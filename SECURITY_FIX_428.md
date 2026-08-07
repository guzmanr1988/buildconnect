# Security Fix: Leaked Demo Passwords in Production Bundle

## Problem
Five demo account password environment variables were present in the production build:
- VITE_DEMO_HOMEOWNER_PW
- VITE_DEMO_VENDOR_PW
- VITE_DEMO_ADMIN_PW
- VITE_DEMO_ACCOUNT_REP_PW
- VITE_DEMO_EMPLOYEE_PW

These were inlined into the public JavaScript bundle by Vite at build time, making them fetchable at:
- https://buildc.net/assets/index-*.js (HTTP 200, no auth)

## Root Cause
**Regression from task_535 (2026-06-06):**
- task_535 correctly removed VITE_ prefixes from demo passwords to keep them out of bundle
- task_535 moved demo access to demo-unlock Edge fn + DEMO_GATE_PASSCODE
- BUT: deploy.yml still injects them via secrets + hardcoded literal

**Direct source: .github/workflows/deploy.yml (tracked in git)**
- Lines 31-35: VITE_DEMO_HOMEOWNER_PW, VITE_DEMO_VENDOR_PW, VITE_DEMO_ADMIN_PW, VITE_DEMO_ACCOUNT_REP_PW, VITE_DEMO_MODE (from secrets)
- Line 44: VITE_DEMO_EMPLOYEE_PW hardcoded as plaintext literal: `'demo-employee-Spring2026!'`

**Why .env.production was a red herring:**
- CI runs on fresh runner with `actions/checkout + npm ci + npm run build`
- .env.production is gitignored, so never checked out into CI
- Vite receives env vars ONLY from deploy.yml Build step, not from .env.production
- .env.production is used locally in development only

**ALSO: Credential in public repo history**
- 'demo-employee-Spring2026!' has been hardcoded in tracked source since PR #306 (2026-05-21)
- guzmanr1988/buildconnect is PUBLIC repo
- Credential present in 810 commits of public history
- GitHub archives and forks also contain it
- Deletion from tip does NOT remove from history; credential is permanently disclosed

## Required Changes (in .github/workflows/deploy.yml)
Remove the demo password injection from the Build step (lines 31-44):

1. **Remove demo password env vars from secrets (lines 31-35):**
   ```
   - VITE_DEMO_HOMEOWNER_PW: ${{ secrets.VITE_DEMO_HOMEOWNER_PW }}
   - VITE_DEMO_VENDOR_PW: ${{ secrets.VITE_DEMO_VENDOR_PW }}
   - VITE_DEMO_ADMIN_PW: ${{ secrets.VITE_DEMO_ADMIN_PW }}
   - VITE_DEMO_ACCOUNT_REP_PW: ${{ secrets.VITE_DEMO_ACCOUNT_REP_PW }}
   - VITE_DEMO_MODE: ${{ secrets.VITE_DEMO_MODE }}
   ```

2. **Remove hardcoded plaintext password (lines 36-44):**
   ```
   - Comment block explaining PR-306 reasoning (incorrect)
   - VITE_DEMO_EMPLOYEE_PW: 'demo-employee-Spring2026!'
   ```

**Important:** When removing VITE_DEMO_MODE, simply delete the line (do NOT set to string 'false'). Unsetting/removing it is falsy in JS; the string 'false' is truthy and would keep demo mode enabled.

This disables the floating QA persona switcher in production and removes password injection from the bundle.

## Impact on Users
**Demo users in production will experience:**
- QA persona switcher removed (floating component disappears)
- Demo login bypass (?bypass=1 on register) disabled
- Demo data clearing feature removed from vendor dashboard
- Demo booking flows disabled

**Expected behavior:**
- All demo features fall back to regular signup/login flow
- Demo access controlled exclusively by demo-unlock Edge fn + DEMO_GATE_PASSCODE (per task_535)
- No code changes required (feature flags already present for fallback)

## Verification (post-deployment)
Run this verification against the newly deployed bundle:

```bash
# Fetch the production bundle and verify passwords are NOT present
curl -s https://buildc.net/assets/index-*.js | grep -c "VITE_DEMO_HOMEOWNER_PW"
# Expected: 0

# Positive control - verify something that SHOULD be present
curl -s https://buildc.net/assets/index-*.js | grep -c "VITE_SUPABASE_ANON_KEY"
# Expected: non-zero (confirms grep works and bundle is valid)
```

## Notes
- .env.production is properly gitignored (correct security practice)
- Code changes NOT required (passwords are not referenced in source)
- This is a build environment update only
- Demo account password rotation required separately (security fix_428 (b) - Rod's responsibility)
