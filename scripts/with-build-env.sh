#!/usr/bin/env bash
# FU-2 — wrapper that guarantees the build env is sourced before running ANY
# command that may consume VITE_* / SUPABASE_* / STRIPE_* secrets.
#
# Use: `./scripts/with-build-env.sh npm run build`
#      `./scripts/with-build-env.sh node some-tool.mjs`
#
# Rationale: the recurring class of failures (pin-33 white-screen, env-poison
# rounds 1-2 of bubble-cards) all reduce to "the shell that ran the build did
# not have secrets.env sourced." Asking every caller (CI, daemon, human, agent)
# to remember `set -a && source ... && set +a` is a brittle contract. This
# wrapper centralizes it.
#
# Pairs with the FU-1 check-vite-env.mjs POISONED rail: even if a caller
# bypasses this wrapper and the env contains placeholders, the prebuild guard
# halts the build.

set -euo pipefail

# Locate secrets.env. Default to the conventional path on this dev machine;
# allow override via SECRETS_ENV_PATH for CI / other environments.
DEFAULT_SECRETS="/Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env"
SECRETS_ENV_PATH="${SECRETS_ENV_PATH:-$DEFAULT_SECRETS}"

if [[ ! -f "$SECRETS_ENV_PATH" ]]; then
  echo "[with-build-env] ERROR: secrets file not found at $SECRETS_ENV_PATH" >&2
  echo "[with-build-env] Set SECRETS_ENV_PATH to an existing file, or place" >&2
  echo "[with-build-env] secrets at the default path." >&2
  exit 2
fi

# `set -a` makes every subsequently sourced assignment automatically exported.
set -a
# shellcheck disable=SC1090
source "$SECRETS_ENV_PATH"
set +a

if [[ $# -eq 0 ]]; then
  echo "[with-build-env] Usage: $0 <command> [args...]" >&2
  echo "[with-build-env] Sourced $SECRETS_ENV_PATH; no command given." >&2
  exit 1
fi

exec "$@"
