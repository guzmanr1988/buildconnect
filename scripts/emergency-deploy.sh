#!/usr/bin/env bash
# ============================================================
# BuildConnect Emergency Deploy
# ============================================================
# Use ONLY during a confirmed GitHub Actions outage.
# Before running, verify the outage at https://www.githubstatus.com/
# (look for "GitHub Actions" or "Actions" incidents).
#
# This script replicates the GH Actions deploy pipeline locally:
#   1. Loads CF + VITE_* secrets from secrets.env + .env.local
#   2. Installs dependencies (npm ci)
#   3. Builds the Vite bundle (npm run build)
#   4. Deploys to Cloudflare Pages via wrangler
#   5. Verifies the live site is up + serving the new bundle
#
# Requirements:
#   - Node 20+ and npm in PATH
#   - wrangler installed globally (npm i -g wrangler) or via npx
#   - CLOUDFLARE_API_TOKEN in secrets.env (or in env already)
#
# Run from the buildconnect repo root:
#   bash scripts/emergency-deploy.sh
# ============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_ENV="/Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env"
LOCAL_ENV="$REPO_ROOT/.env.local"
CF_ACCOUNT_ID="9dbd92f96246453d02c05850358a5565"
CF_PROJECT_NAME="buildconnect"
PROD_URL="https://buildc.net/"

echo ""
echo "=========================================="
echo " BuildConnect Emergency Deploy"
echo "=========================================="
echo ""
echo "⚠️  Use only during confirmed GH Actions outage."
echo "    Check: https://www.githubstatus.com/"
echo ""

# ── 1. Load secrets ──────────────────────────────────────────
echo "→ Loading secrets..."

if [[ -f "$SECRETS_ENV" ]]; then
  # shellcheck source=/dev/null
  set -a; source "$SECRETS_ENV"; set +a
  echo "  Loaded $SECRETS_ENV"
else
  echo "  WARN: $SECRETS_ENV not found — relying on environment"
fi

if [[ -f "$LOCAL_ENV" ]]; then
  # shellcheck source=/dev/null
  set -a; source "$LOCAL_ENV"; set +a
  echo "  Loaded $LOCAL_ENV"
else
  echo "  WARN: $LOCAL_ENV not found — VITE_* vars must already be in env"
fi

# ── 2. Verify required env vars ──────────────────────────────
echo ""
echo "→ Verifying required env vars..."

REQUIRED_VARS=(
  CLOUDFLARE_API_TOKEN
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
  VITE_GOOGLE_MAPS_API_KEY
)

MISSING=0
for VAR in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "  ✗ MISSING: $VAR"
    MISSING=1
  else
    echo "  ✓ $VAR"
  fi
done

if [[ $MISSING -eq 1 ]]; then
  echo ""
  echo "ERROR: Missing required env vars. Aborting." >&2
  exit 1
fi

export CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID"

# ── 3. Ensure we're on main + up to date ─────────────────────
echo ""
echo "→ Checking git state..."
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "ERROR: Not on main branch (currently on '$CURRENT_BRANCH'). Aborting." >&2
  exit 1
fi
echo "  Branch: main ✓"

COMMIT_HASH="$(git rev-parse --short HEAD)"
echo "  Commit: $COMMIT_HASH"

# ── 4. Install dependencies ───────────────────────────────────
echo ""
echo "→ Installing dependencies (npm ci)..."
npm ci --prefer-offline 2>&1 | tail -3

# ── 5. Build ─────────────────────────────────────────────────
echo ""
echo "→ Building (npm run build)..."
npm run build 2>&1

# Extract bundle hash from output
BUNDLE_JS="$(ls dist/assets/index-*.js 2>/dev/null | head -1)"
if [[ -z "$BUNDLE_JS" ]]; then
  echo "ERROR: No dist/assets/index-*.js found after build." >&2
  exit 1
fi
BUNDLE_HASH="$(basename "$BUNDLE_JS" .js | sed 's/index-//')"
echo ""
echo "  Bundle: $BUNDLE_HASH ✓"

# ── 6. Deploy to Cloudflare Pages ────────────────────────────
echo ""
echo "→ Deploying to Cloudflare Pages (project: $CF_PROJECT_NAME)..."
DEPLOY_OUTPUT="$(npx wrangler pages deploy dist \
  --project-name="$CF_PROJECT_NAME" \
  --branch=main \
  2>&1)"
echo "$DEPLOY_OUTPUT"

DEPLOY_URL="$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^ ]*\.pages\.dev' | tail -1 || echo "")"

# ── 7. Smoke-test prod ───────────────────────────────────────
echo ""
echo "→ Verifying prod ($PROD_URL)..."
HTTP_CODE="$(curl -sLo /dev/null -w "%{http_code}" --max-time 15 "$PROD_URL")"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "  WARN: $PROD_URL returned HTTP $HTTP_CODE (CF propagation may still be in progress)"
else
  echo "  HTTP 200 ✓"
fi

# Check bundle hash is live
LIVE_BODY="$(curl -sL --max-time 15 "$PROD_URL" || echo "")"
if echo "$LIVE_BODY" | grep -q "$BUNDLE_HASH"; then
  echo "  Bundle $BUNDLE_HASH confirmed live ✓"
else
  echo "  WARN: Bundle $BUNDLE_HASH not yet visible in prod HTML (CF propagation in progress — check in ~60s)"
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo " Deploy complete"
echo "  Commit:  $COMMIT_HASH"
echo "  Bundle:  $BUNDLE_HASH"
echo "  Prod:    $PROD_URL"
if [[ -n "$DEPLOY_URL" ]]; then
  echo "  CF URL:  $DEPLOY_URL"
fi
echo "=========================================="
echo ""
