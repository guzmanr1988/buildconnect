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

# Resolve secrets file location.
#
# Resolution order (first match wins):
#   1. SECRETS_ENV_PATH=skip  → trust caller env (CI mode: secrets injected as env vars,
#                                no file on disk). Skip the source step entirely.
#   2. SECRETS_ENV_PATH=<path> → source the explicit path (hard-error if missing — caller
#                                set it deliberately, so an absent file is a real failure).
#   3. ${HOME}/Sage/orgs/buildconnect/secrets.env (default fallback, machine-agnostic)
#      → source if present; otherwise fall through to (4).
#   4. No file + already-populated env (VITE_SUPABASE_URL set non-empty) → trust caller env.
#   5. No file + empty env → hard-error with guidance.
#
# This shape closes the prior "DEFAULT_SECRETS hardcoded user path + hard-error if missing"
# leak: CI can inject env directly with no file, local dev gets the default fallback,
# explicit override path stays hard-error to fail loud on typos.

if [[ "${SECRETS_ENV_PATH:-}" == "skip" ]]; then
  echo "[with-build-env] SECRETS_ENV_PATH=skip — trusting caller env, not sourcing any file." >&2
elif [[ -n "${SECRETS_ENV_PATH:-}" ]]; then
  if [[ ! -f "$SECRETS_ENV_PATH" ]]; then
    echo "[with-build-env] ERROR: SECRETS_ENV_PATH=$SECRETS_ENV_PATH set but file does not exist." >&2
    echo "[with-build-env] Either fix the path, unset SECRETS_ENV_PATH to use the default," >&2
    echo "[with-build-env] or set SECRETS_ENV_PATH=skip to trust caller-provided env." >&2
    exit 2
  fi
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_ENV_PATH"
  set +a
else
  DEFAULT_SECRETS="${HOME}/Sage/orgs/buildconnect/secrets.env"
  if [[ -f "$DEFAULT_SECRETS" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$DEFAULT_SECRETS"
    set +a
  elif [[ -n "${VITE_SUPABASE_URL:-}" ]]; then
    echo "[with-build-env] No secrets file; caller env already populated (VITE_SUPABASE_URL set). Proceeding." >&2
  else
    echo "[with-build-env] ERROR: no secrets file at $DEFAULT_SECRETS and caller env is empty." >&2
    echo "[with-build-env] Either place secrets at the default path, set SECRETS_ENV_PATH to an" >&2
    echo "[with-build-env] explicit file, or set SECRETS_ENV_PATH=skip after injecting required" >&2
    echo "[with-build-env] VITE_* / SUPABASE_* / STRIPE_* vars directly into the env." >&2
    exit 2
  fi
fi

if [[ $# -eq 0 ]]; then
  echo "[with-build-env] Usage: $0 <command> [args...]" >&2
  echo "[with-build-env] Env prepared; no command given." >&2
  exit 1
fi

exec "$@"
