#!/usr/bin/env bash
set -euo pipefail

# ── colour helpers ─────────────────────────────────────────────────────────────
ok()   { printf '\033[0;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m⚠ %s\033[0m\n' "$*"; }
err()  { printf '\033[0;31m✖ %s\033[0m\n' "$*" >&2; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── load .env.local ────────────────────────────────────────────────────────────
if [ -f ".env.local" ]; then
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    k="${line%%=*}"
    v="${line#*=}"
    v="${v#\"}" v="${v%\"}"
    v="${v#\'}" v="${v%\'}"
    export "$k=$v" 2>/dev/null || true
  done < .env.local
fi

# ── require RESEND_API_KEY ────────────────────────────────────────────────────
if [ -z "${RESEND_API_KEY:-}" ]; then
  err "RESEND_API_KEY not set in environment or .env.local"
  exit 1
fi
ok "RESEND_API_KEY loaded"

DOMAIN="feedsomeone.org"
RESEND_BASE="https://api.resend.com"

# ── helper: call Resend API ───────────────────────────────────────────────────
resend_get() {
  curl -fsS -H "Authorization: Bearer $RESEND_API_KEY" "${RESEND_BASE}${1}"
}
resend_post() {
  local path="$1"; shift
  curl -fsS -X POST -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" "${RESEND_BASE}${path}" "$@"
}

# ── check if domain already registered ───────────────────────────────────────
echo ""
echo "Checking existing Resend domains..."
DOMAINS_JSON="$(resend_get /domains)"
DOMAIN_ID="$(echo "$DOMAINS_JSON" | grep -o '"id":"[^"]*"' | \
  head -1 | sed 's/"id":"//;s/"//' || true)"

# Try to find the specific domain
EXISTING_ID=""
# parse the domains array looking for feedsomeone.org
while IFS= read -r chunk; do
  if echo "$chunk" | grep -q '"name":"feedsomeone.org"'; then
    EXISTING_ID="$(echo "$chunk" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')"
    break
  fi
done <<< "$(echo "$DOMAINS_JSON" | tr '{' '\n')"

if [ -n "$EXISTING_ID" ]; then
  ok "Domain $DOMAIN already registered (id: $EXISTING_ID)"
  DOMAIN_ID="$EXISTING_ID"
  CREATE_RESP=""
else
  echo "Registering domain $DOMAIN..."
  CREATE_RESP="$(resend_post /domains --data "{\"name\":\"$DOMAIN\"}")"
  DOMAIN_ID="$(echo "$CREATE_RESP" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//' || true)"
  if [ -z "$DOMAIN_ID" ]; then
    err "Domain registration failed. Response:"
    echo "$CREATE_RESP"
    exit 1
  fi
  ok "Domain registered (id: $DOMAIN_ID)"
fi

# ── fetch domain details for DNS records ─────────────────────────────────────
echo ""
DETAIL="$(resend_get "/domains/${DOMAIN_ID}")"

echo "DNS records to add at your registrar:"
echo ""
printf "%-8s %-50s %-60s %-8s\n" "TYPE" "NAME" "VALUE" "PRIORITY"
printf "%-8s %-50s %-60s %-8s\n" "────" "────────────────────────────────────────────────" "────────────────────────────────────────────────────────────" "────────"

# Parse records array — extract type/name/value/priority fields
# Works with simple single-line JSON arrays
echo "$DETAIL" | tr ',' '\n' | while IFS= read -r field; do
  case "$field" in
    *'"record_type":'*) REC_TYPE="$(echo "$field" | grep -o '"record_type":"[^"]*"' | sed 's/"record_type":"//;s/"//')" ;;
    *'"name":'*)        REC_NAME="$(echo "$field" | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"//')" ;;
    *'"value":'*)       REC_VALUE="$(echo "$field" | grep -o '"value":"[^"]*"' | sed 's/"value":"//;s/"//')" ;;
    *'"priority":'*)    REC_PRIO="$(echo "$field" | grep -o '"priority":[0-9]*' | sed 's/"priority"://')" ;;
  esac
done

# Simplified: just print the raw DNS section nicely
echo "$DETAIL" | grep -o '"records":\[.*\]' | tr '[{' '\n' | while IFS= read -r rec; do
  [ -z "$rec" ] && continue
  TYPE="$(echo "$rec" | grep -o '"record_type":"[^"]*"' | sed 's/"record_type":"//;s/"//' || true)"
  NAME="$(echo "$rec" | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"//' || true)"
  VAL="$(echo "$rec" | grep -o '"value":"[^"]*"' | sed 's/"value":"//;s/"//' || true)"
  PRIO="$(echo "$rec" | grep -o '"priority":[0-9]*' | sed 's/"priority"://' || true)"
  [ -z "$TYPE" ] && continue
  printf "%-8s %-50s %-60s %-8s\n" "$TYPE" "$NAME" "$VAL" "${PRIO:--}"
done

echo ""

# ── trigger verification ──────────────────────────────────────────────────────
echo "Triggering domain verification..."
resend_post "/domains/${DOMAIN_ID}/verify" > /dev/null 2>&1 || warn "Verify trigger returned an error (may be fine if already verifying)"

# ── poll status for up to 2 minutes ──────────────────────────────────────────
echo ""
echo "Polling verification status (up to 2 minutes)..."
ATTEMPTS=0
MAX_ATTEMPTS=24  # 24 × 5s = 120s

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  STATUS_JSON="$(resend_get "/domains/${DOMAIN_ID}")"
  STATUS="$(echo "$STATUS_JSON" | grep -o '"status":"[^"]*"' | head -1 | sed 's/"status":"//;s/"//' || echo "unknown")"

  if [ "$STATUS" = "verified" ]; then
    ok "Domain $DOMAIN is VERIFIED"
    break
  elif [ "$STATUS" = "failed" ]; then
    err "Domain verification FAILED. Check DNS records above and re-run."
    exit 1
  else
    printf "\r  Status: %-20s (attempt %d/%d) — waiting for DNS propagation..." \
      "$STATUS" "$ATTEMPTS" "$MAX_ATTEMPTS"
    sleep 5
  fi
done
echo ""

if [ "$STATUS" != "verified" ]; then
  warn "Domain not yet verified after 2 minutes — DNS propagation can take up to 48h."
  warn "Re-run this script later or check status at https://resend.com/domains"
fi

# ── notes ────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SANDBOX LIMITS (pre-verification):"
echo "    - Can only send FROM onboarding@resend.dev"
echo "    - Can only send TO the account owner's email"
echo "    - EMAIL_FROM must use a verified domain once live"
echo ""
echo "  After verification, set in .env.local (or apphosting.yaml):"
echo "    EMAIL_PROVIDER=resend"
echo "    EMAIL_FROM=FeedSomeone <photos@feedsomeone.org>"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
ok "resend-init done"
