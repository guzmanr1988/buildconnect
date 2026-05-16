// Adapter registry. Reads VITE_FINANCING_BANK to select which adapter is
// active. Unknown values fail LOUD (throw) rather than silent-falling-back
// to manual_referral — silent-fallback masks misconfiguration in CI.

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

export function getActiveAdapter(): FinancingBankAdapter {
  const key = (import.meta.env.VITE_FINANCING_BANK as string | undefined) ?? 'manual_referral';
  const adapter = REGISTRY[key];
  if (!adapter) {
    throw new Error(
      `unknown VITE_FINANCING_BANK adapter: ${key}. registered: ${Object.keys(REGISTRY).join(', ')}`,
    );
  }
  return adapter;
}

export function getAdapterByKey(key: string): FinancingBankAdapter | undefined {
  return REGISTRY[key];
}

export function listRegisteredAdapters(): string[] {
  return Object.keys(REGISTRY);
}

export type { FinancingBankAdapter };
