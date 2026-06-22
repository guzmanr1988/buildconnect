// Stripe Connect onboarding hook.
//
// Reads the caller's escrow_accounts row (own-read via RLS policy
// escrow_accounts_own_read) to derive the UI status state machine, and
// exposes a startOnboarding() action that invokes the stripe-connect-onboarding
// or stripe-connect-refresh Edge Function and returns a hosted-Stripe URL
// for client-side redirect.
//
// State machine surfaced in Banking/Payouts UI:
//   not_connected        → no DB row; show "Set up payouts" CTA
//   pending_verification → row exists, charges/payouts not yet enabled
//   active               → onboarded + ready; show dashboard link
//   restricted           → Stripe flagged the account; show re-link button
//   rejected             → terminal; show contact-support message
//
// Phase 2 ships the data flow + redirect mint; Phase 3 wires the
// account.updated webhook handler in stripe-webhook to transition statuses
// post-onboarding without a re-fetch round-trip.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  STRIPE_CONNECT_ONBOARDING_FN,
  STRIPE_CONNECT_REFRESH_FN,
  type PartyType,
  type ConnectUiState,
} from '@/lib/financing/escrow/constants';

export interface ConnectAccountRow {
  stripeAccountId: string;
  status: ConnectUiState;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: unknown | null;
  onboardedAt: string | null;
  updatedAt: string;
}

interface ConnectQueryArgs {
  partyType: PartyType;
  enabled?: boolean;
}

function queryKey(partyType: PartyType) {
  return ['escrow_accounts', partyType] as const;
}

async function fetchConnectAccount(partyType: PartyType): Promise<ConnectAccountRow | null> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return null;

  const { data, error } = await supabase
    .from('escrow_accounts')
    .select(
      'stripe_account_id, status, charges_enabled, payouts_enabled, requirements, onboarded_at, updated_at',
    )
    .eq('party_type', partyType)
    .eq('party_id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    stripeAccountId: data.stripe_account_id,
    status: data.status as ConnectUiState,
    chargesEnabled: !!data.charges_enabled,
    payoutsEnabled: !!data.payouts_enabled,
    requirements: data.requirements ?? null,
    onboardedAt: data.onboarded_at ?? null,
    updatedAt: data.updated_at,
  };
}

export function useConnectAccount({ partyType, enabled = true }: ConnectQueryArgs) {
  return useQuery({
    queryKey: queryKey(partyType),
    queryFn: () => fetchConnectAccount(partyType),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending_verification' ? 30_000 : false,
  });
}

export function useConnectUiState(partyType: PartyType): {
  state: ConnectUiState;
  isLoading: boolean;
  account: ConnectAccountRow | null;
} {
  const { data, isLoading } = useConnectAccount({ partyType });
  if (isLoading) {
    return { state: 'not_connected', isLoading: true, account: null };
  }
  return {
    state: data ? data.status : 'not_connected',
    isLoading: false,
    account: data ?? null,
  };
}

export interface StartOnboardingInput {
  partyType: PartyType;
  returnUrl: string;
  refreshUrl: string;
  businessName?: string;
}

export interface StartOnboardingResult {
  ok: boolean;
  accountId: string;
  url: string;
  expiresAt: number;
  status: ConnectUiState;
  created: boolean;
  accountAlreadyActive?: boolean;
}

async function startOnboarding(input: StartOnboardingInput): Promise<StartOnboardingResult> {
  const { data, error } = await supabase.functions.invoke<StartOnboardingResult>(
    STRIPE_CONNECT_ONBOARDING_FN,
    {
      body: {
        action: 'create-or-link',
        partyType: input.partyType,
        returnUrl: input.returnUrl,
        refreshUrl: input.refreshUrl,
        businessName: input.businessName,
      },
    },
  );
  if (error) {
    // FunctionsHttpError surfaces non-2xx; the function's JSON error body is
    // not in error.message — Phase 3 will plumb structured errors. For now,
    // re-throw with the message and let the caller surface a generic toast.
    throw new Error(error.message || 'connect_onboarding_invoke_failed');
  }
  if (!data) {
    throw new Error('connect_onboarding_empty_response');
  }
  return data;
}

async function refreshOnboardingLink(input: Omit<StartOnboardingInput, 'businessName'>): Promise<StartOnboardingResult> {
  const { data, error } = await supabase.functions.invoke<StartOnboardingResult>(
    STRIPE_CONNECT_REFRESH_FN,
    {
      body: {
        partyType: input.partyType,
        returnUrl: input.returnUrl,
        refreshUrl: input.refreshUrl,
      },
    },
  );
  if (error) throw new Error(error.message || 'connect_refresh_invoke_failed');
  if (!data) throw new Error('connect_refresh_empty_response');
  return data;
}

export function useStartConnectOnboarding(partyType: PartyType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<StartOnboardingInput, 'partyType'>) =>
      startOnboarding({ ...input, partyType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(partyType) });
    },
  });
}

export function useRefreshConnectOnboarding(partyType: PartyType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<StartOnboardingInput, 'partyType' | 'businessName'>) =>
      refreshOnboardingLink({ ...input, partyType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(partyType) });
    },
  });
}
