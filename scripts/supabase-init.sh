#!/usr/bin/env bash
set -euo pipefail

# ── colour helpers ─────────────────────────────────────────────────────────────
ok()   { printf '\033[0;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m⚠ %s\033[0m\n' "$*"; }
err()  { printf '\033[0;31m✖ %s\033[0m\n' "$*" >&2; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── mode ───────────────────────────────────────────────────────────────────────
CLOUD_MODE=0
for arg in "$@"; do
  case "$arg" in --cloud) CLOUD_MODE=1 ;; esac
done

# ── ensure supabase devDependency ──────────────────────────────────────────────
if ! npm ls supabase --depth=0 2>/dev/null | grep -q supabase; then
  warn "supabase not found in devDependencies — installing..."
  npm install -D supabase
  ok "supabase devDependency installed"
else
  ok "supabase devDependency present"
fi

# ──────────────────────────────────────────────────────────────────────────────
# LOCAL MODE (default)
# ──────────────────────────────────────────────────────────────────────────────
if [ "$CLOUD_MODE" -eq 0 ]; then

  # 1. supabase init (only if config.toml missing)
  if [ ! -f "supabase/config.toml" ]; then
    warn "supabase/config.toml missing — running supabase init..."
    npx supabase init
    ok "supabase init done"
  else
    ok "supabase/config.toml already present"
  fi

  # 2. Docker check
  if ! docker info > /dev/null 2>&1; then
    err "Docker Desktop isn't running. Open it from the Start menu, wait for the whale, re-run."
    exit 1
  fi
  ok "Docker is running"

  # 3. Start local stack (idempotent — supabase start is safe to re-run)
  echo ""
  echo "Starting local Supabase stack (this can take ~30s on first run)..."
  npx supabase start
  ok "Supabase stack running"

  # 4. Parse status output and upsert keys into .env.local
  STATUS_OUTPUT="$(npx supabase status -o env)"

  # Extract values
  API_URL="$(echo "$STATUS_OUTPUT" | grep '^API_URL=' | cut -d= -f2-)"
  ANON_KEY="$(echo "$STATUS_OUTPUT" | grep '^ANON_KEY=' | cut -d= -f2-)"
  SERVICE_ROLE_KEY="$(echo "$STATUS_OUTPUT" | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2-)"

  if [ -z "$API_URL" ] || [ -z "$ANON_KEY" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
    err "Could not parse keys from supabase status output. Raw output:"
    echo "$STATUS_OUTPUT"
    exit 1
  fi

  # Create .env.local from .env.example if it doesn't exist
  if [ ! -f ".env.local" ]; then
    if [ -f ".env.example" ]; then
      cp .env.example .env.local
      warn ".env.local created from .env.example — fill in remaining values"
    else
      touch .env.local
    fi
  fi

  # Upsert the three keys (preserve all other lines)
  upsert_env() {
    local key="$1" val="$2" file=".env.local"
    local tmp="${file}.tmp.$$"
    # Remove existing line for this key, then write new line at the end
    grep -v "^${key}=" "$file" > "$tmp" 2>/dev/null || true
    echo "${key}=${val}" >> "$tmp"
    mv "$tmp" "$file"
  }

  upsert_env "NEXT_PUBLIC_SUPABASE_URL" "$API_URL"
  upsert_env "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$ANON_KEY"
  upsert_env "SUPABASE_SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY"
  ok ".env.local updated with Supabase keys"

  # 5. db reset (applies migrations + seed.sql)
  echo ""
  echo "Applying migrations + seed.sql..."
  npx supabase db reset
  ok "Database reset complete"

  # 6. Seed placeholder images
  echo ""
  echo "Uploading seed images..."
  node scripts/seed-images.mjs
  ok "Seed images uploaded"

  # 7. Generate TypeScript types
  echo ""
  echo "Generating TypeScript types..."
  mkdir -p src/lib/supabase
  npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
  ok "Types written to src/lib/supabase/database.types.ts"

  echo ""
  ok "═══ LOCAL SETUP DONE ══════════════════════════════════"
  echo ""
  echo "  Studio  → http://127.0.0.1:54323"
  echo "  Mailpit → http://127.0.0.1:54324"
  echo "  DB      → postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  echo ""

# ──────────────────────────────────────────────────────────────────────────────
# CLOUD MODE (--cloud flag + SUPABASE_ACCESS_TOKEN set)
# ──────────────────────────────────────────────────────────────────────────────
else
  if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
    err "--cloud flag requires SUPABASE_ACCESS_TOKEN to be set in the environment"
    exit 1
  fi
  export SUPABASE_ACCESS_TOKEN

  # List orgs so user can pick
  echo ""
  echo "Your Supabase organisations:"
  npx supabase orgs list
  echo ""
  printf 'Enter organisation slug to create the project in: '
  read -r ORG_SLUG

  PROJECT_NAME="${SUPABASE_PROJECT_NAME:-feedsomeone}"
  DB_PASSWORD="${SUPABASE_DB_PASSWORD:-$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c 24 || echo "ChangeMe$(date +%s)")}"
  REGION="${SUPABASE_REGION:-ap-south-1}"

  echo ""
  echo "Creating Supabase cloud project '$PROJECT_NAME' in org '$ORG_SLUG' (region $REGION)..."
  REF_OUTPUT="$(npx supabase projects create "$PROJECT_NAME" \
    --org-id "$ORG_SLUG" \
    --db-password "$DB_PASSWORD" \
    --region "$REGION" 2>&1)" || {
    warn "projects create failed — project may already exist. Continuing with link..."
    printf 'Enter your existing project ref (e.g. abcdefghijklmnop): '
    read -r REF
  }

  # Try to extract project ref from output if we got one
  if [ -z "${REF:-}" ]; then
    REF="$(echo "$REF_OUTPUT" | grep -oE '[a-z]{20}' | head -1 || true)"
    if [ -z "$REF" ]; then
      printf 'Could not auto-detect project ref. Enter it manually: '
      read -r REF
    fi
  fi

  echo "Linking to project ref: $REF"
  npx supabase link --project-ref "$REF" --password "$DB_PASSWORD"
  ok "Linked"

  echo "Pushing migrations..."
  npx supabase db push
  ok "Migrations pushed"

  echo ""
  echo "API keys:"
  npx supabase projects api-keys --project-ref "$REF"
  echo ""
  warn "Update apphosting.yaml with the cloud NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
  warn "Then run: firebase apphosting:secrets:set SUPABASE_SERVICE_ROLE_KEY"
  ok "═══ CLOUD SETUP DONE — ref: $REF ══════════════════════"
fi
