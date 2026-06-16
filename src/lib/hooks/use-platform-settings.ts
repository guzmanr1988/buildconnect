// Platform settings (singleton row in platform_settings) — load + save.
//
// Phase 1 surfaces the Stripe-relevant subset (stripe_enabled,
// application_fee_bps, homeowner_payout_fee_bps). Phase 2+ extends to
// onboarding-link configuration. Other admin-page fields (companyName,
// contactEmail, etc.) stay in local React state until each gets its own
// migration; this hook intentionally does NOT pretend to persist them.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_APPLICATION_FEE_BPS,
  DEFAULT_HOMEOWNER_PAYOUT_FEE_BPS,
} from '@/lib/financing/escrow/constants';

export interface PlatformSettings {
  stripeEnabled: boolean;
  applicationFeeBps: number;
  homeownerPayoutFeeBps: number;
  updatedAt: string | null;
}

const QUERY_KEY = ['platform_settings'] as const;

const DEFAULTS: PlatformSettings = {
  stripeEnabled: false,
  applicationFeeBps: DEFAULT_APPLICATION_FEE_BPS,
  homeownerPayoutFeeBps: DEFAULT_HOMEOWNER_PAYOUT_FEE_BPS,
  updatedAt: null,
};

async function fetchPlatformSettings(): Promise<PlatformSettings> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('stripe_enabled, application_fee_bps, homeowner_payout_fee_bps, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULTS;

  return {
    stripeEnabled: !!data.stripe_enabled,
    applicationFeeBps: data.application_fee_bps ?? DEFAULT_APPLICATION_FEE_BPS,
    homeownerPayoutFeeBps: data.homeowner_payout_fee_bps ?? DEFAULT_HOMEOWNER_PAYOUT_FEE_BPS,
    updatedAt: data.updated_at ?? null,
  };
}

async function savePlatformSettings(input: Omit<PlatformSettings, 'updatedAt'>): Promise<void> {
  const { error } = await supabase
    .from('platform_settings')
    .update({
      stripe_enabled: input.stripeEnabled,
      application_fee_bps: input.applicationFeeBps,
      homeowner_payout_fee_bps: input.homeownerPayoutFeeBps,
    })
    .eq('id', 1);
  if (error) throw error;
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPlatformSettings,
    staleTime: 60_000,
  });
}

export function useSavePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: savePlatformSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
