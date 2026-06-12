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
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    val="${val#\"}" val="${val%\"}"
    val="${val#\'}" val="${val%\'}"
    export "$key=$val" 2>/dev/null || true
  done < .env.local
fi

# ── resolve STRIPE_SECRET_KEY ─────────────────────────────────────────────────
STRIPE_KEY="${STRIPE_SECRET_KEY:-}"
if [ -z "$STRIPE_KEY" ]; then
  err "STRIPE_SECRET_KEY not found in environment or .env.local"
  err "Set it before running: export STRIPE_SECRET_KEY=sk_..."
  exit 1
fi
ok "STRIPE_SECRET_KEY loaded"

# ── resolve site URL ──────────────────────────────────────────────────────────
SITE_URL="${1:-${NEXT_PUBLIC_SITE_URL:-https://feedsomeone.org}}"
WEBHOOK_URL="${SITE_URL%/}/api/webhooks/payment"
ok "Webhook target: $WEBHOOK_URL"

# ── required events ────────────────────────────────────────────────────────────
EVENTS="checkout.session.completed,invoice.paid,invoice.payment_failed,checkout.session.expired"

# ── list existing endpoints ───────────────────────────────────────────────────
echo ""
echo "Fetching existing Stripe webhook endpoints..."
EXISTING="$(curl -fsS "https://api.stripe.com/v1/webhook_endpoints?limit=20" \
  -u "${STRIPE_KEY}:" 2>/dev/null)"

MATCH_URL="$(echo "$EXISTING" | grep -o '"url":"[^"]*"' | grep "$WEBHOOK_URL" | head -1 | sed 's/"url":"//;s/"//' || true)"

if [ -n "$MATCH_URL" ]; then
  ok "Webhook endpoint already exists for $WEBHOOK_URL"
  echo ""
  warn "Existing endpoint found — no new signing secret generated."
  warn "If you need the signing secret, delete the old endpoint and re-run."
else
  echo ""
  echo "Creating new webhook endpoint..."
  CREATE_RESP="$(curl -fsS "https://api.stripe.com/v1/webhook_endpoints" \
    -u "${STRIPE_KEY}:" \
    -d "url=${WEBHOOK_URL}" \
    -d "enabled_events[]=$(echo "$EVENTS" | tr ',' '\n' | while read -r e; do printf '%s' "$e "; done | xargs -I{} echo -d "enabled_events[]={}" | xargs)" \
    --data-urlencode "enabled_events[]=checkout.session.completed" \
    --data-urlencode "enabled_events[]=invoice.paid" \
    --data-urlencode "enabled_events[]=invoice.payment_failed" \
    --data-urlencode "enabled_events[]=checkout.session.expired" \
    2>/dev/null)"

  WHSEC="$(echo "$CREATE_RESP" | grep -o '"secret":"[^"]*"' | sed 's/"secret":"//;s/"//' || true)"

  if [ -z "$WHSEC" ]; then
    err "Webhook creation failed. Stripe response:"
    echo "$CREATE_RESP"
    exit 1
  fi

  ok "Webhook endpoint created"
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  STRIPE_WEBHOOK_SECRET (save this — shown ONCE)             ║"
  echo "║                                                              ║"
  printf  "║  %-60s  ║\n" "$WHSEC"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Add to .env.local:"
  echo "    STRIPE_WEBHOOK_SECRET=$WHSEC"
  echo ""
  echo "  Or set as App Hosting secret:"
  echo "    printf '%s' '$WHSEC' | firebase apphosting:secrets:set STRIPE_WEBHOOK_SECRET --data-file -"
fi

# ── Day-2 swap instructions ────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Day-2 env flip (zero code changes required):"
echo ""
echo "    1. In .env.local (local) or apphosting.yaml (production):"
echo "       PAYMENT_PROVIDER=stripe"
echo ""
echo "    2. Restart the dev server / redeploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Local webhook testing with Stripe CLI:"
echo "    stripe listen --forward-to localhost:3000/api/webhooks/payment"
echo "    (uses its own signing secret; set STRIPE_WEBHOOK_SECRET to the"
echo "     whsec_ printed by 'stripe listen', not the one above)"
echo ""
ok "stripe-init done"
