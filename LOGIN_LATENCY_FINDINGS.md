# Login Latency Profile (#475) — Findings + Draft Fix

**Branch:** `draft/login-latency-profile-475`
**Base:** apex HEAD `eedc92b` (Ship #10 FACE-1 trifecta) — branched per branch-from-apex-HEAD discipline, NOT git main (which is stale at `a5250b4`).
**Mode:** profiling + DRAFT only. NOT deployed. NOT promoted. Awaiting morning Rod-go.
**Dispatched by:** kratos msg `1780619460388-kratos-2c9vh`, task `task_1780619450251_221`.

---

## Critical path (login click → /home navigate)

```
LoginPage.onSubmit
  └─ signIn()                                       lib/auth.ts:24
      └─ supabase.auth.signInWithPassword()          (12s timeout race)
         → SIGNED_IN event fires on the bus
            └─ AuthBootstrap.onAuthStateChange       AuthBootstrap.tsx:214
                └─ hydrate(userId, email, token)     AuthBootstrap.tsx:22
                    1. store.setSession()              (sync, instant — flips isAuthenticated=true)
                    2. await getProfile()              (10s timeout race)
                         └─ supabase.from('profiles').select('*').eq('id').single()
                    3. merge-prior-profile fields    (sync)
                    4. store.setProfile()              (sync — triggers LoginPage navigate)
                    5. catalog.hydrateFromServer()    (fire-and-forget)
                    6. vendor-catalog.hydrateFromSupabase()  (fire-and-forget, vendor only)
                    7. projects.hydrateFromSupabase() (fire-and-forget)
LoginPage.useEffect [isAuthenticated, profile]      login.tsx:135
  └─ navigate(dest, {replace: true})                  (when BOTH flip true)
```

**Blocking dependency:** navigate() requires `isAuthenticated && profile` — the user does not leave `/login` until step 4 completes. Steps 5–7 do NOT block, but they share the same Supabase HTTP/2 connection so they compete for bandwidth.

---

## Measured / inferred latency contributors

| # | Stage | Cost (steady state) | Cost (worst case observed) | Source |
|---|---|---|---|---|
| 1 | Bundle parse (cold) | ~250–500 ms | ~1.5 s on low-end mobile | bundle 3.35 MB single chunk, no code-split |
| 2 | supabase.auth.signInWithPassword | ~400–800 ms | up to 12 s (timeout ceiling) | apollo PoP-walker 16:25Z + 16:30Z + Rod 17:40Z, banked CF→Supabase edge-pinning class |
| 3 | getProfile (`select('*')`) | ~300–700 ms | **~17 s** | apollo PoP-walker, see PR-254 comment AuthBootstrap.tsx:11 |
| 4 | setProfile + React re-render → navigate | ~50–150 ms | ~200 ms | useEffect[isAuthenticated, profile] in LoginPage |
| 5 | Post-navigate first-paint of /home or /vendor | ~200–400 ms | varies | shared HTTP/2 with steps 5–7 of hydrate |

**Total best-case:** ~1.0–1.8 s click-to-content.
**Total worst-case (edge-pinning):** ~17–24 s (apollo PoP-walker), capped by 12 s signIn + 10 s getProfile timeouts.

---

## Root-cause analysis: why is getProfile the long pole?

`getProfile` runs `from('profiles').select('*').eq('id').single()`. The profile row can carry:

| Column | Type | Typical size | Worst case |
|---|---|---|---|
| `id_document_url` | text (base64 dataURL) | 0 | **~2 MB** per PR #197 comment |
| `noncircumvention_agreement_text_snapshot` | text (frozen agreement body) | 0 | ~5–10 KB |
| `noncircumvention_agreement_signature_metadata` | jsonb | 0 | <1 KB |
| `contractor_licenses` | jsonb (array of `ContractorLicense` w/ `imageDataUrl`) | 0 | **multi-MB** with license images |
| `avatar_url` | text (base64 dataURL or storage URL) | 0–100 KB | ~500 KB |
| `additional_addresses` | jsonb | 0–500 B | ~5 KB |
| All other text/uuid/timestamp cols combined | — | <1 KB | <2 KB |

A homeowner who's uploaded an ID doc + a vendor with multiple licensed images = **5–10 MB profile row**. On a CF edge-pinned connection (~100–500 Kbps effective throughput in those windows), the row-transfer time alone explains the 17 s measurement.

**The fix:** strip bloat columns from the critical-path select. Navigation only needs `role` (LoginPage L141). First-paint UI needs `name`, `avatar_color`, `address`, `role`, `noncircumvention_agreement_signed_at`. None of the bloat columns above are needed before the user has landed on their destination page.

---

## Draft fix (implemented in this branch)

**T1 — Split `getProfile` into `getProfileLite` (critical path) + `getProfileBloat` (background merge).**

- `src/lib/auth.ts`: new exports `getProfileLite()` and `getProfileBloat()`. Lite enumerates ~17 small columns. Bloat = 4 columns (`id_document_url`, `noncircumvention_agreement_text_snapshot`, `noncircumvention_agreement_signature_metadata`, `contractor_licenses`).
- `src/components/AuthBootstrap.tsx`: `hydrate()` calls `getProfileLite()` on the timeout race, then fires `getProfileBloat()` fire-and-forget after `setProfile`. Merge runs only if the user is still the same userId (guards against rapid sign-out/sign-in).
- Feature-flagged: `VITE_LOGIN_LITE_PROFILE` (default `true`). Set to `false` in `.env.production` for emergency rollback without redeploy.
- Perf telemetry: `performance.mark('bc-login-*')` and `performance.measure(...)` at `hydrate-start`, `getProfile-start`, `getProfile-end`, `setProfile-done`, `bloat-start`, `bloat-end`. Visible in Chrome DevTools Performance panel + accessible to any future RUM hook.

**Expected impact (edge-pinning window):**
- Wire payload: ~5–10 MB → <1 KB (lite) + ~5–10 MB (bloat, off critical path)
- getProfile critical-path latency: ~17 s → ~0.5–1.5 s (bandwidth-bound payload eliminated)
- Click-to-content total: ~17–24 s → ~2–4 s

**Steady-state impact:** small (~50–200 ms saved per login) — the bloat columns are typically empty for most users, so the lite/full distinction only matters when columns are populated.

**Risk assessment:**
- Downstream surfaces reading bloat columns on first paint: very few. Audited:
  - `id_document_url` — read by cart Send-to-Contractor gate + admin ID-review (both post-navigation surfaces).
  - `noncircumvention_agreement_text_snapshot` — read by admin NCA-review (admin surface only).
  - `contractor_licenses` — read by vendor profile panel (post-navigation).
- Worst case: a vendor whose dashboard renders their license images on first paint sees them flash in ~500ms–2s later. UI tolerates undefined → defined transition (already pattern across codebase per Tranche-2 column-not-yet-migrated idiom).
- Rollback path: flip `VITE_LOGIN_LITE_PROFILE=false` in `.env.production` and rebuild. Falls back to legacy `getProfile('*')`. No DB migration.

---

## Follow-up proposals (NOT implemented — for Rod-go discussion)

**T2 — Dedupe duplicate `getProfile` fires on cold load** (`~50–100 ms` saved on cold load with active session, plus 1 fewer Supabase RTT)
- AuthBootstrap calls both `supabase.auth.getSession().then(hydrate)` AND `onAuthStateChange(SIGNED_IN→hydrate)` on mount.
- On cold load with a valid session, both fire and each runs its own getProfile. The existing PR-254 comment ("times out on BOTH") acknowledges this.
- Fix: in-flight promise cache keyed by `userId`. Tiny (~10 LOC).
- Defer reason: this is a secondary win and changes the listener semantics; want Rod to OK the dedupe pattern before shipping.

**T3 — Code-split heavy routes** (`~250–500 ms saved` on cold-load TTI, login bundle would shrink by ~1.0–1.5 MB)
- Current bundle: `index-KW9ql9mv.js` = 3.35 MB single chunk. Admin (`/admin/*`), Vendor (`/vendor/*`), Account Rep panels all bundle together.
- Fix: `React.lazy()` + dynamic `import()` on the role-segment route trees. `router.tsx` would split into `homeowner.routes.tsx`, `vendor.routes.tsx`, `admin.routes.tsx`.
- Defer reason: touches router structure + needs full E2E re-verify across all role landings. Bigger change.

**T4 — Decouple navigate from profile-ready** (`~300–700 ms` saved in steady state, much more on edge-pinning since signIn ceiling is 12 s vs profile ceiling 10 s)
- `LoginPage.useEffect[isAuthenticated, profile]` waits for both. Could fire `navigate()` as soon as `isAuthenticated` flips, and let role-gated routes show a small loading state while profile lands.
- Risk: any UI on /home (or /vendor, /admin) that reads `profile.role` on first paint without a null-guard will flash unauthorized → authorized.
- Defer reason: needs audit of role-gated render code across landing surfaces.

**T5 — Defer non-critical store hydrations** (`50–150 ms` of main-thread time saved on first paint of /home)
- Current: catalog + vendor-catalog + projects all fire from `hydrate()` immediately after `setProfile`. These share the same Supabase HTTP/2 connection as the landing page's own data fetches.
- Fix: wrap them in `requestIdleCallback` (with `setTimeout(0)` fallback) so the destination page's React tree gets first crack at the bandwidth.
- Defer reason: behavior change for offline-resilience paths (catalog-store has a stale-fallback path that should still fire eagerly on stale-cache).

**T6 — Already implemented** (perf telemetry markers above).

---

## How to verify locally

```bash
git checkout draft/login-latency-profile-475

# Build (uses bash subshell for proper env expansion per banked feedback)
bash -c 'set -a; source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env; set +a; npm run build'

# Diff vs apex
git log --oneline eedc92b..HEAD

# In a browser with the built /dist served locally or on a CF Pages preview:
# 1. Sign in as a real account with a populated id_document_url
# 2. Open Chrome DevTools → Performance panel → start recording before clicking Sign in
# 3. After landing on /home, stop recording
# 4. Search for "bc-login-*" marks in the timing pane:
#    - bc-login-hydrate-start
#    - bc-login-getProfile-start / bc-login-getProfile-end (measure: bc-login-getProfile)
#    - bc-login-setProfile-done (measure: bc-login-getProfile-to-setProfile)
#    - bc-login-bloat-start / bc-login-bloat-end (measure: bc-login-bloat-fetch)
# 5. The 'bc-login-getProfile' measure should be <1.5s on a normal connection
#    (vs ~17s in apex edge-pinning window).

# Emergency rollback (no DB migration needed, no redeploy of code):
# In .env.production:
#   VITE_LOGIN_LITE_PROFILE=false
# Then rebuild.
```

---

## Suggested morning ship-order (Rod-go)

1. **Rod approves T1** as drafted.
2. helios builds from `draft/login-latency-profile-475` using `bash -c "set -a; source secrets.env; set +a; npm run build"` (per banked manual-ship discipline).
3. CF Pages preview deploy → apollo PoP-walker before/after measurement on the same edge-pinning route used for the original 17 s measurement.
4. If preview measure shows <2 s getProfile p50: helios promote-verified-bytes to apex.
5. T2 (dedupe) follows in a small bundled PR if T1 confirms the wire-payload hypothesis. T3–T5 separate arcs.

If the apollo measurement does NOT show the expected speedup, the hypothesis is falsified — the long pole is RTT count or auth.signInWithPassword latency, not row payload. In that case, prioritize T2 (dedupe to drop one RTT) and instrument signIn to surface where its latency lives.
