#!/usr/bin/env bash
#
# Cloud Agent install step for the Oasis Coastal Cleaning site.
#
# The deployed site itself has no build step — public/ is served as-is and
# functions/ is compiled by Cloudflare. This script only prepares the LOCAL
# development experience: the Wrangler CLI, local-only dev secrets, and a
# migrated local D1 database so /admin and /api/* work end to end.
#
# It is idempotent: safe to run repeatedly against cached or partial state.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Dev tooling (Wrangler), pinned in .cursor/package.json. Installed under
#    .cursor/ so the repository root stays free of a package.json that would
#    change how Cloudflare Pages builds the site.
( cd .cursor && npm install --no-audit --no-fund )

WRANGLER="./.cursor/node_modules/.bin/wrangler"

# 2. Local-only dev secrets for the leads portal. Never committed (.dev.vars is
#    git-ignored); these are throwaway values for local dev, not production.
if [ ! -f .dev.vars ]; then
  cat > .dev.vars <<'EOF'
ADMIN_PASSWORD="devpassword"
SESSION_SECRET="local-dev-session-secret-please-change-in-production-0123456789"
EOF
fi

# 3. Create and migrate the local D1 database used by wrangler pages dev.
#    The migration is CREATE TABLE IF NOT EXISTS and Wrangler tracks applied
#    migrations, so re-running is a no-op.
"$WRANGLER" d1 migrations apply oasis --local

echo "Dev environment ready. Start the site with:"
echo "  ./.cursor/node_modules/.bin/wrangler pages dev public --port 8788"
