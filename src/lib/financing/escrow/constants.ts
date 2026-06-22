// Escrow / Stripe Connect Express decision constants.
//
// Phase 0 defaults locked by kratos 2026-06-16 msg 1781569611114:
//   - Express both parties (vendor + homeowner)
//   - Test-mode-only on the stripe-connect-preview branch
//   - US-only
//   - homeowner_payout_fee_bps = 0 (referrer keeps full payout)
//   - application_fee_bps stored in platform_settings + per-customer override
//   - Stripe secret key in Supabase Edge Function env (supabase secrets set),
//     NEVER persisted in a DB row.
//
// Phase 1 owns these as constants; Phase 2 reads platform_settings at
// request time to allow runtime tuning without redeploy.

export const ESCROW_ADAPTER_KEY = 'stripe_express' as const;

export const SUPPORTED_COUNTRIES = ['US'] as const;
export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

export const PARTY_TYPES = ['vendor', 'homeowner'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const ESCROW_ACCOUNT_STATUSES = [
  'pending_verification',
  'active',
  'restricted',
  'rejected',
] as const;
export type EscrowAccountStatus = (typeof ESCROW_ACCOUNT_STATUSES)[number];

export const DEFAULT_APPLICATION_FEE_BPS = 0;
export const DEFAULT_HOMEOWNER_PAYOUT_FEE_BPS = 0;

export const MAX_FEE_BPS = 10_000;

export const STRIPE_CONNECT_ACCOUNT_LINK_TYPE = 'account_onboarding' as const;
export const STRIPE_CONNECT_ACCOUNT_TYPE = 'express' as const;

export const STRIPE_EVENTS_NEEDED = [
  'account.updated',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'checkout.session.completed',
  'transfer.created',
  'transfer.updated',
  'charge.refunded',
  'charge.dispute.created',
] as const;

// Referral program defaults — applied when no row in referral_bonus_overrides
// for a given referrer. Kept in sync with platform_settings.default_referral_bonus_cents
// (migration 072 ALTER ADD COLUMN). The DB column is the source of truth for
// admin-editable defaults; this constant is a build-time fallback used when
// platform_settings hasn't been loaded yet (initial render, network failure).
export const DEFAULT_REFERRAL_BONUS_CENTS = 50_000; // $500 per kratos directive

// Phase 2 onboarding endpoints — Edge Functions deployed alongside migration 069.
export const STRIPE_CONNECT_ONBOARDING_FN = 'stripe-connect-onboarding' as const;
export const STRIPE_CONNECT_REFRESH_FN = 'stripe-connect-refresh' as const;

// Connected-account status state machine surfaced in the Banking/Payouts UI.
// Mirrors escrow_accounts.status enum from migration 069, with one synthetic
// state — 'not_connected' — for the "no row yet" case the DB doesn't have to
// represent.
export const CONNECT_UI_STATES = [
  'not_connected',
  'pending_verification',
  'active',
  'restricted',
  'rejected',
] as const;
export type ConnectUiState = (typeof CONNECT_UI_STATES)[number];
