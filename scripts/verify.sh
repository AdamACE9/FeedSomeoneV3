#!/usr/bin/env bash
set -euo pipefail

# ── colour helpers ─────────────────────────────────────────────────────────────
ok()   { printf '\033[0;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m⚠ %s\033[0m\n' "$*"; }
err()  { printf '\033[0;31m✖ %s\033[0m\n' "$*" >&2; }

SITE="${1:-http://localhost:3000}"

echo ""
echo "Verifying FeedSomeone at: $SITE"
echo ""

# ── homepage HTTP code ────────────────────────────────────────────────────────
echo "Checking homepage..."
HOME_CODE="$(curl -o /dev/null -s -w '%{http_code}' "$SITE")"
if [ "$HOME_CODE" = "200" ]; then
  ok "Homepage → HTTP $HOME_CODE"
else
  warn "Homepage → HTTP $HOME_CODE (expected 200)"
fi

# ── health endpoint ───────────────────────────────────────────────────────────
echo ""
echo "Checking /api/health..."
HEALTH_BODY="$(curl -fsS "$SITE/api/health" 2>/dev/null)" || {
  err "/api/health request failed — is the dev server running?"
  exit 1
}

# Pretty-print with jq if available, else raw
if command -v jq > /dev/null 2>&1; then
  echo "$HEALTH_BODY" | jq .
else
  echo "$HEALTH_BODY"
fi

# Check for ok:false or "ok":false
if echo "$HEALTH_BODY" | grep -qE '"ok"\s*:\s*false'; then
  err "/api/health returned ok:false — check subsystem errors above"
  exit 1
fi

if echo "$HEALTH_BODY" | grep -qE '"ok"\s*:\s*true'; then
  ok "/api/health → ok"
else
  warn "/api/health response does not contain ok:true — check output above"
fi

echo ""
ok "Verification complete"
