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

This regression occurred because .env.production was not updated after the security fix in task_535 (2026-06-06), which intentionally dropped the VITE_ prefix from these variables to keep them out of the bundle.

## Root Cause
- task_535 (2026-06-06) correctly moved demo access to demo-unlock Edge fn + DEMO_GATE_PASSCODE
- Demo passwords were removed from code but remained in .env.production
- Vite inlines ALL VITE_-prefixed env vars into the bundle at build time

## Required Changes (in .env.production)
These changes must be made in the production build environment:

1. **Remove the 5 demo password variables entirely:**
   ```
   - VITE_DEMO_HOMEOWNER_PW
   - VITE_DEMO_VENDOR_PW
   - VITE_DEMO_ADMIN_PW
   - VITE_DEMO_ACCOUNT_REP_PW
   - VITE_DEMO_EMPLOYEE_PW
   ```

2. **Set demo mode to false:**
   ```
   VITE_DEMO_MODE=false
   ```

   This disables the floating QA persona switcher in production (was publicly accessible at /login).

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
