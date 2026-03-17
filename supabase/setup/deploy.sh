#!/usr/bin/env bash
# ============================================================
# deploy.sh - Deploy Optimus Detection Studio database schema
# ============================================================
# Usage:
#   DATABASE_URL="postgresql://..." bash supabase/setup/deploy.sh
#   — or —
#   bash supabase/setup/deploy.sh "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
# ============================================================

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Resolve script directory (works from any CWD)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Accept DATABASE_URL from env or first argument
DB_URL="${1:-${DATABASE_URL:-}}"

if [ -z "$DB_URL" ]; then
  echo -e "${RED}Error: No database URL provided.${NC}"
  echo ""
  echo "Usage:"
  echo "  DATABASE_URL=\"postgresql://...\" bash supabase/setup/deploy.sh"
  echo "  bash supabase/setup/deploy.sh \"postgresql://...\""
  echo ""
  echo "Find your database URL in Supabase Dashboard → Settings → Database → Connection string (URI)"
  exit 1
fi

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Optimus Detection Studio — Database Setup         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# SQL files in execution order
SQL_FILES=(
  "01_extensions.sql"
  "02_tables.sql"
  "03_indexes.sql"
  "04_views.sql"
  "05_materialized_views.sql"
  "06_functions.sql"
  "07_triggers.sql"
  "08_rls_policies.sql"
  "09_seed_data.sql"
)

TOTAL=${#SQL_FILES[@]}
CURRENT=0
FAILED=0

for file in "${SQL_FILES[@]}"; do
  CURRENT=$((CURRENT + 1))
  filepath="${SCRIPT_DIR}/${file}"

  if [ ! -f "$filepath" ]; then
    echo -e "  ${RED}[${CURRENT}/${TOTAL}] MISSING: ${file}${NC}"
    FAILED=$((FAILED + 1))
    continue
  fi

  echo -ne "  ${CYAN}[${CURRENT}/${TOTAL}]${NC} Running ${file}..."

  if psql "$DB_URL" -f "$filepath" --quiet --no-psqlrc -v ON_ERROR_STOP=1 > /dev/null 2>&1; then
    echo -e " ${GREEN}OK${NC}"
  else
    echo -e " ${RED}FAILED${NC}"
    echo -e "  ${YELLOW}→ Re-running with error output:${NC}"
    psql "$DB_URL" -f "$filepath" --no-psqlrc -v ON_ERROR_STOP=1 2>&1 | tail -5
    FAILED=$((FAILED + 1))
  fi
done

echo ""

# ── Verification ──
echo -e "${CYAN}── Verification ──${NC}"

TABLE_COUNT=$(psql "$DB_URL" --quiet --no-psqlrc -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | tr -d ' ')

VIEW_COUNT=$(psql "$DB_URL" --quiet --no-psqlrc -t -c \
  "SELECT count(*) FROM information_schema.views WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

FUNCTION_COUNT=$(psql "$DB_URL" --quiet --no-psqlrc -t -c \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public';" 2>/dev/null | tr -d ' ')

RLS_COUNT=$(psql "$DB_URL" --quiet --no-psqlrc -t -c \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true;" 2>/dev/null | tr -d ' ')

echo -e "  Tables:    ${GREEN}${TABLE_COUNT}${NC}"
echo -e "  Views:     ${GREEN}${VIEW_COUNT}${NC}"
echo -e "  Functions: ${GREEN}${FUNCTION_COUNT}${NC}"
echo -e "  RLS-enabled tables: ${GREEN}${RLS_COUNT}${NC}"

echo ""

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   Database setup complete!                          ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "Next steps:"
  echo -e "  1. Deploy edge functions:  ${CYAN}supabase functions deploy --project-ref YOUR_REF${NC}"
  echo -e "  2. Set secrets:            ${CYAN}supabase secrets set GEMINI_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=...${NC}"
  echo -e "  3. Configure .env.local    (copy from .env.example)"
  echo -e "  4. Start the app:          ${CYAN}bun install && bun dev${NC}"
  echo -e "  5. Sign up, then promote:  ${CYAN}UPDATE profiles SET role = 'owner' WHERE email = 'you@example.com';${NC}"
  echo -e "  6. Settings → MITRE Sync → click 'Import MITRE Data'"
  echo -e "  7. After sync: click 'Refresh Scores'"
else
  echo -e "${RED}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║   Setup completed with ${FAILED} error(s)                  ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════╝${NC}"
  echo -e "  Review the errors above and re-run failed scripts manually."
  exit 1
fi
