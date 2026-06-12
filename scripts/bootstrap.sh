#!/usr/bin/env bash
set -euo pipefail

# ── colour helpers ─────────────────────────────────────────────────────────────
ok()   { printf '\033[0;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m⚠ %s\033[0m\n' "$*"; }
err()  { printf '\033[0;31m✖ %s\033[0m\n' "$*" >&2; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── banner ─────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║        FEEDSOMEONE — one-command setup                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── check node ≥ 20 ────────────────────────────────────────────────────────────
NODE_VERSION="$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo '0')"
if [ "$NODE_VERSION" -lt 20 ] 2>/dev/null; then
  err "Node.js 20+ required. Found: $(node --version 2>/dev/null || echo 'not installed')"
  err "Install from https://nodejs.org or via nvm: nvm install 20"
  exit 1
fi
ok "Node.js $(node --version)"

# ── check npm ─────────────────────────────────────────────────────────────────
if ! command -v npm > /dev/null 2>&1; then
  err "npm not found — install Node.js from https://nodejs.org"
  exit 1
fi
ok "npm $(npm --version)"

# ── npm install ───────────────────────────────────────────────────────────────
echo ""
echo "Installing dependencies..."
npm install
ok "npm install complete"

# ── supabase local setup ───────────────────────────────────────────────────────
echo ""
bash scripts/supabase-init.sh

# ── done ───────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  READY — seeded logins:                                  ║"
echo "║  admin@feedsomeone.com  /  Admin@123  (forced pw change) ║"
echo "║  kitchen@feedsomeone.com / Kitchen@123                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  TERMINAL 1 — start dev server:"
echo "    npm run dev"
echo ""
echo "  TERMINAL 2 — start cron loop:"
echo "    node scripts/dev-cron.mjs"
echo ""
echo "  Open http://localhost:3000"
echo ""
echo "  Verify everything is healthy:"
echo "    bash scripts/verify.sh"
echo ""
warn "Make sure CRON_SECRET is set in .env.local before starting dev-cron."
warn "Copy from .env.example and fill in any remaining values."
