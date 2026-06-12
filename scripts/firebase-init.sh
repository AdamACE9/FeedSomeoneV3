#!/usr/bin/env bash
set -euo pipefail

# ── colour helpers ─────────────────────────────────────────────────────────────
ok()   { printf '\033[0;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m⚠ %s\033[0m\n' "$*"; }
err()  { printf '\033[0;31m✖ %s\033[0m\n' "$*" >&2; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── check firebase-tools installed ────────────────────────────────────────────
if ! command -v firebase > /dev/null 2>&1; then
  err "firebase-tools not found."
  err "Install with: npm i -g firebase-tools"
  exit 1
fi
ok "firebase CLI: $(firebase --version 2>/dev/null | head -1)"

# ── check auth ────────────────────────────────────────────────────────────────
echo ""
echo "Checking Firebase auth..."
LOGIN_LIST="$(firebase login:list 2>/dev/null || true)"
if ! echo "$LOGIN_LIST" | grep -qE '@'; then
  err "Not logged in to Firebase."
  err "Run: firebase login"
  err "Then re-run this script."
  exit 1
fi
ok "Firebase auth: $(echo "$LOGIN_LIST" | grep -oE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' | head -1)"

# ── project setup ─────────────────────────────────────────────────────────────
PROJECT_ID="${1:-feedsomeone-app}"
echo ""
echo "Target Firebase project: $PROJECT_ID"

# Try to create project (may already exist — that's fine)
echo "Attempting to create project '$PROJECT_ID'..."
if firebase projects:create "$PROJECT_ID" 2>/dev/null; then
  ok "Project created: $PROJECT_ID"
else
  warn "Could not create project '$PROJECT_ID' via CLI."
  warn "NUMBERED EXCEPTION (1): Firebase project creation via CLI may require console acceptance"
  warn "  → https://console.firebase.google.com — create the project there, then re-run."
  warn "Continuing assuming project already exists..."
fi

# ── Blaze billing ─────────────────────────────────────────────────────────────
if [ -n "${BILLING_ACCOUNT_ID:-}" ]; then
  echo ""
  echo "Linking billing account $BILLING_ACCOUNT_ID to project $PROJECT_ID..."
  if command -v gcloud > /dev/null 2>&1; then
    if gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT_ID" 2>/dev/null; then
      ok "Billing linked"
    else
      warn "gcloud billing link failed."
      warn "NUMBERED EXCEPTION (2): Upgrade to Blaze plan at:"
      warn "  https://console.firebase.google.com/project/$PROJECT_ID/usage/details"
    fi
  else
    warn "gcloud CLI not found. Install Google Cloud SDK to automate billing linking."
    warn "NUMBERED EXCEPTION (2): Manually upgrade to Blaze plan at:"
    warn "  https://console.firebase.google.com/project/$PROJECT_ID/usage/details"
  fi
else
  warn "BILLING_ACCOUNT_ID not set — skipping billing link."
  warn "NUMBERED EXCEPTION (2): Upgrade to Blaze (pay-as-you-go) plan BEFORE deploying:"
  warn "  https://console.firebase.google.com/project/$PROJECT_ID/usage/details"
  warn "  (Google requires a human + card — cannot be automated)"
fi

# ── set active project ────────────────────────────────────────────────────────
echo ""
echo "Setting active Firebase project..."
firebase use "$PROJECT_ID"
ok "Active project: $PROJECT_ID"

# ── load .env.local for secret values ─────────────────────────────────────────
declare -A ENV_VALS=()
if [ -f ".env.local" ]; then
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    k="${line%%=*}"
    v="${line#*=}"
    v="${v#\"}" v="${v%\"}"
    v="${v#\'}" v="${v%\'}"
    ENV_VALS["$k"]="$v"
  done < .env.local
fi

# ── set App Hosting secrets ───────────────────────────────────────────────────
echo ""
echo "Setting App Hosting secrets..."

# Map: secret name in Firebase → key in .env.local (or special handling)
declare -A SECRET_MAP=(
  [SUPABASE_SERVICE_ROLE_KEY]=SUPABASE_SERVICE_ROLE_KEY
  [MOCK_WEBHOOK_SECRET]=MOCK_WEBHOOK_SECRET
  [STRIPE_SECRET_KEY]=STRIPE_SECRET_KEY
  [STRIPE_WEBHOOK_SECRET]=STRIPE_WEBHOOK_SECRET
  [RESEND_API_KEY]=RESEND_API_KEY
  [APP_CRON_SECRET]=CRON_SECRET
)

for SECRET_NAME in SUPABASE_SERVICE_ROLE_KEY MOCK_WEBHOOK_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET RESEND_API_KEY APP_CRON_SECRET; do
  # APP_CRON_SECRET reads from CRON_SECRET in .env.local
  if [ "$SECRET_NAME" = "APP_CRON_SECRET" ]; then
    ENV_KEY="CRON_SECRET"
  else
    ENV_KEY="$SECRET_NAME"
  fi

  VAL="${ENV_VALS[$ENV_KEY]:-}"

  if [ -z "$VAL" ]; then
    warn "Skipping $SECRET_NAME — $ENV_KEY not found in .env.local"
    warn "  Set it later: printf '%s' 'VALUE' | firebase apphosting:secrets:set $SECRET_NAME --data-file -"
    continue
  fi

  echo "  Setting secret: $SECRET_NAME"
  if printf '%s' "$VAL" | firebase apphosting:secrets:set "$SECRET_NAME" --data-file - 2>/dev/null; then
    ok "Secret set: $SECRET_NAME"
  else
    # --data-file flag may not be supported in all CLI versions — fall back to interactive guidance
    warn "Could not set $SECRET_NAME via --data-file flag."
    warn "  Run interactively: firebase apphosting:secrets:set $SECRET_NAME"
    warn "  Then paste: $VAL"
  fi
done

# ── write functions/.env ──────────────────────────────────────────────────────
echo ""
APP_URL="${APP_URL:-https://feedsomeone.org}"
mkdir -p functions
echo "APP_URL=${APP_URL}" > functions/.env
ok "functions/.env written (APP_URL=${APP_URL})"

# ── install functions deps + deploy functions ─────────────────────────────────
echo ""
echo "Installing functions dependencies..."
(cd functions && npm install)
ok "functions deps installed"

echo ""
echo "Deploying Firebase functions..."
firebase deploy --only functions
ok "Functions deployed"

# ── App Hosting — ensure firebase.json has apphosting section ─────────────────
echo ""
if grep -q '"apphosting"' firebase.json 2>/dev/null; then
  ok "firebase.json already has apphosting section"
else
  warn "firebase.json missing apphosting section."
  warn "Running: firebase init apphosting"
  warn "When prompted, set backendId to: feedsomeone"
  firebase init apphosting
fi

# ── deploy App Hosting ────────────────────────────────────────────────────────
echo ""
echo "Next step: deploy the app"
echo ""
ok "═══ firebase-init done ═══════════════════════════════════"
echo ""
echo "  Run: bash scripts/deploy.sh"
echo ""
warn "NUMBERED EXCEPTION (3): Custom domain feedsomeone.org must be added in Firebase console:"
warn "  https://console.firebase.google.com/project/$PROJECT_ID/apphosting"
warn "  Then update DNS at your registrar (exception 4)."
