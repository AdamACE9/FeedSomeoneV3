#!/usr/bin/env bash
set -euo pipefail

# ── colour helpers ─────────────────────────────────────────────────────────────
ok()   { printf '\033[0;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m⚠ %s\033[0m\n' "$*"; }
err()  { printf '\033[0;31m✖ %s\033[0m\n' "$*" >&2; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║        FEEDSOMEONE — deploy                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── sanity: build check ───────────────────────────────────────────────────────
echo "Running build sanity check..."
npm run build
ok "Build succeeded"

# ── deploy functions ──────────────────────────────────────────────────────────
echo ""
echo "Deploying Firebase functions (cron)..."
firebase deploy --only functions
ok "Functions deployed"

# ── deploy App Hosting ────────────────────────────────────────────────────────
echo ""
echo "Deploying to Firebase App Hosting..."
firebase deploy --only apphosting:feedsomeone
ok "App Hosting deployed"

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
ok "═══ Deploy complete ══════════════════════════════════════"
echo ""
echo "  Live URL: https://feedsomeone.org  (once DNS is set)"
echo "  Firebase console: https://console.firebase.google.com"
echo ""
warn "NUMBERED EXCEPTION — Custom domain DNS:"
warn "  1. Go to Firebase console → App Hosting → your backend → Custom domains"
warn "  2. Add feedsomeone.org and follow the verification steps"
warn "  3. Copy the A/CNAME records shown"
warn "  4. Paste them at your domain registrar (registrar UI is human-only)"
warn "     WHY: Each registrar has a different UI; DNS propagation requires"
warn "     human confirmation of the correct records."
