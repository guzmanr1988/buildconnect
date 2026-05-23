// Financing feature flags.
//
// FE master-switch (financing_enabled) reads from feature_flags DB table via
// useFeatureFlag hook — see lib/financing/hooks/use-feature-flag.ts. Admin
// toggles in /admin/financing propagate to live sessions without redeploy.
//
// FE bank selector (financing_bank_active) ALSO reads from feature_flags
// (the row's `value` text column, T+3a widen). Same admin-toggle propagation
// as the master switch — bank choice is a runtime admin decision, not a
// deploy-config one. Use useFlagValue('financing_bank_active') at the hook
// call-site, then look up the adapter via getAdapterByKey.
//
// Edge Functions read FINANCING_* via Deno.env.get inline — they are NOT
// bundled with Vite.
