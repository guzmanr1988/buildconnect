// Financing feature flags.
//
// FE master-switch (financing_enabled) reads from feature_flags DB table via
// useFeatureFlag hook — see lib/financing/hooks/use-feature-flag.ts. Admin
// toggles in /admin/financing propagate to live sessions without redeploy.
//
// FE bank selector (FINANCING_BANK) still reads VITE_* (build-time bake;
// bank choice is a deploy-config decision, not a runtime admin toggle).
// Edge Functions read FINANCING_* via Deno.env.get inline — they are NOT
// bundled with Vite.

export function getActiveBankKey(): string {
  return (import.meta.env.VITE_FINANCING_BANK as string | undefined) ?? 'manual_referral';
}
