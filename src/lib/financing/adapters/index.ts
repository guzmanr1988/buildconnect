// Adapter registry. Bank choice is DB-runtime (feature_flags row
// financing_bank_active.value) read by callers via useFlagValue hook —
// see lib/financing/hooks/use-feature-flag.ts. Unknown values fail LOUD
// at the call site (throw) rather than silent-falling-back to
// manual_referral — silent-fallback masks misconfiguration in CI.

import type { FinancingBankAdapter } from './_contract';
import { goodleapAdapter } from './goodleap';
import { manualReferralAdapter } from './manual_referral';
import { momntAdapter } from './momnt';
import { upgradeAdapter } from './upgrade';

const REGISTRY: Record<string, FinancingBankAdapter> = {
  manual_referral: manualReferralAdapter,
  goodleap: goodleapAdapter,
  momnt: momntAdapter,
  upgrade: upgradeAdapter,
};

export function getAdapterByKey(key: string): FinancingBankAdapter | undefined {
  return REGISTRY[key];
}

export function listRegisteredAdapters(): string[] {
  return Object.keys(REGISTRY);
}

export type { FinancingBankAdapter };
