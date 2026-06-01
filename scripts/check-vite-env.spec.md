# `scripts/check-vite-env.mjs` — VITE_ env-surface preflight guard

## What it does

Build-time guard that fails `npm run build` if any `import.meta.env.VITE_*` referenced anywhere under `src/` is missing from `process.env` or is the empty string.

Wired as `prebuild` in `package.json`, so `npm run build` runs the guard before `tsc -b && vite build`. No CI change needed — the existing `npm run build` step now includes the guard automatically.

Available standalone as `npm run check:vite-env` for ad-hoc invocation (e.g. inside the wrangler-deploy invocation, before `npm run build`, as a no-op sanity probe).

## Why it exists

Closes the trap class anchored on 2026-05-30 BC demo-login arc (banked: `feedback_vite_env_full_surface_audit_before_local_wrangler_deploy`, N=2):

- **Round 1** — `VITE_DEMO_*_PW` vars missing from build env → demo password fields baked as `undefined`/`void 0` in the production bundle → demo login silently broken.
- **Round 2** — `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing → `src/lib/supabase.ts` `|| 'http://localhost:54321'` and `|| 'your-anon-key'` code-side fallbacks baked into prod → entire substrate connection wedged.

Both rounds had the same upstream cause: build env source-of-truth mismatch (a `.env.production` that was gitignored and invisible to clean-worktree builds; or wrangler invoked without sourcing `secrets.env`). Both rounds emitted no build error — Vite happily resolves missing `import.meta.env.VITE_*` to `undefined`, and code fallbacks then turn that into a wrong-but-stable value baked into the bundle.

The guard makes this class loud: any build with an incomplete VITE_ surface fails before `tsc` runs, with a clear list of missing var names and the files that reference them.

## Behavior

### Scans

- Walks `src/` recursively. Skips `node_modules` and dot-prefixed dirs.
- Reads `.ts | .tsx | .js | .jsx | .mts | .cts` files.
- Matches `import.meta.env.VITE_[A-Z0-9_]+` (multiple matches per file collected).

### Checks (for each unique VITE_ var found)

- `process.env[name] === undefined` → MISSING (fail).
- `process.env[name] === ''` → EMPTY (fail).
- Otherwise → present (pass).

### Exits

- All vars present → `exit 0` with a one-line summary: `✓ N/N VITE_ vars present in build env`.
- Any missing/empty → `exit 1` with:
  - A grouped list of MISSING vars + first 3 referencing files each.
  - A grouped list of EMPTY vars + first 3 referencing files each.
  - A remediation hint: `source orgs/buildconnect/secrets.env (or the CI env equivalent) before npm run build`.
  - A pointer to the OPTIONAL allowlist for legitimately-optional vars.

## OPTIONAL allowlist

To exempt a var that is intentionally optional, edit `OPTIONAL` in `scripts/check-vite-env.mjs`:

```js
const OPTIONAL = new Set([
  'VITE_FOO_BAR', // justification: only used by feature X which is admin-gated and falls back to disabled when unset
])
```

Empty by default. Adding to the allowlist is the explicit carve-out — discourages quiet exemptions and forces the rationale to live next to the exemption.

## What it does NOT do (v1 scope)

- Does NOT scan `index.html` for `<%= VITE_ %>`-style template injection (not used in this repo).
- Does NOT scan `scripts/`, `tests/`, or `vite.config.ts` for VITE_ usage — those run in Node where `process.env` is read directly and a missing var surfaces immediately.
- Does NOT validate var VALUES (only presence + non-empty). A value-shape check (e.g. `VITE_SUPABASE_URL` must match `https://*.supabase.co`) is a deliberate non-goal for v1 — keeps the guard cheap and false-positive-free.
- Does NOT distinguish between "should be required" and "happens to be referenced." Every `import.meta.env.VITE_*` in `src/` is treated as required. This is intentional: code fallbacks like `|| 'http://localhost:54321'` are precisely the trap class this guard closes, and weakening the rule for fallback-having vars would re-open the trap.

## Wiring

```json
"scripts": {
  "prebuild": "node scripts/check-vite-env.mjs",
  "build": "tsc -b && vite build",
  "check:vite-env": "node scripts/check-vite-env.mjs"
}
```

- `npm run build` triggers `prebuild` automatically (npm convention).
- `npm run check:vite-env` runs the guard standalone (no side effects, fast).

## Failure-mode examples

### Local build without sourcing `secrets.env`

```
$ npm run build
> prebuild
> node scripts/check-vite-env.mjs

[check-vite-env] ✗ VITE_ env-surface preflight FAILED
[check-vite-env]
[check-vite-env] MISSING (10):
  - VITE_DEMO_ACCOUNT_REP_PW
      src/components/QAPersonaSwitcher.tsx
  - VITE_DEMO_ADMIN_PW
      src/components/QAPersonaSwitcher.tsx
  ...
[check-vite-env]
[check-vite-env] Fix: source orgs/buildconnect/secrets.env (or the
[check-vite-env] CI env equivalent) before `npm run build`. A missing
[check-vite-env] VITE_ at build time bakes either `undefined` or a
[check-vite-env] code-side fallback (e.g. `http://localhost:54321`)
[check-vite-env] into the production bundle.
```

### Source `secrets.env` first

```
$ set -a && source orgs/buildconnect/secrets.env && set +a && npm run build
> prebuild
> node scripts/check-vite-env.mjs

[check-vite-env] ✓ 10/10 VITE_ vars present in build env
> build
> tsc -b && vite build
...
```

### One var declared but blank in `secrets.env`

```
$ npm run build
[check-vite-env] ✗ VITE_ env-surface preflight FAILED
[check-vite-env]
[check-vite-env] EMPTY (1):
  - VITE_GOOGLE_MAPS_API_KEY
      src/components/satellite-measure/polygon-draw.tsx
```

## Tests / verification protocol (manual, this branch is draft-only)

The guard itself is a build-time tool; the verification protocol below is what was run locally on this branch:

1. **Unset env → expect fail.** Run `unset $(env | grep -oE '^VITE_[A-Z0-9_]+' | tr '\n' ' '); npm run check:vite-env`. Exit code 1, all 10 vars listed as MISSING.
2. **Source secrets.env → expect pass.** Run `set -a && source orgs/buildconnect/secrets.env && set +a && npm run check:vite-env`. Exit code 0, `✓ 10/10 VITE_ vars present`.
3. **One var empty → expect EMPTY fail.** Run `VITE_GOOGLE_MAPS_API_KEY= ... npm run check:vite-env`. Exit code 1, EMPTY block lists the one var.
4. **Full build pipeline → expect prebuild fires.** Run `set -a && source orgs/buildconnect/secrets.env && set +a && npm run build`. Prebuild runs and prints the pass summary; build proceeds.

Results captured in the draft PR body.

## Future extensions (out of scope for v1)

- Value-shape validation (regex per var: URL format for `VITE_SUPABASE_URL`, JWT shape for `VITE_SUPABASE_ANON_KEY`).
- Reverse check: every var declared in `secrets.env` is actually referenced somewhere in `src/` (catches dead env declarations).
- Diff-against-`.env.example` to keep the example file in sync with actual usage.
- CI-side identical guard as a separate GitHub Actions step (defense-in-depth: catches the case where someone bypasses `npm run build` and invokes `vite build` directly).
