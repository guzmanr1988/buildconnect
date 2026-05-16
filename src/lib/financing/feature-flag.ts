// Financing feature flags.
//
// All financing UI + API surfaces are gated behind FINANCING_ENABLED. Default
// is OFF at launch so this scaffolding is dark on production until Rod flips
// the flag in a separate ship.
//
// FE reads VITE_FINANCING_* (baked at build time per
// feedback_vite_env_must_be_in_ci_build_env). Edge Functions read
// FINANCING_* via Deno.env.get inline — they are NOT bundled with Vite.

export function isFinancingEnabled(): boolean {
  return import.meta.env.VITE_FINANCING_ENABLED === 'true';
}

export function getActiveBankKey(): string {
  return (import.meta.env.VITE_FINANCING_BANK as string | undefined) ?? 'manual_referral';
}
