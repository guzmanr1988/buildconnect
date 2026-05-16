// Stripe Connect Express escrow adapter — STUB. Recommended provider per
// docs §(f).5 but real wire-up is post-Phase-2 (needs Stripe Connect
// onboarding flow, Express dashboard branding, application_fee tuning).

import type {
  CreateConnectedAccountInput,
  CreateConnectedAccountResult,
  EscrowProviderAdapter,
  FundEscrowInput,
  FundEscrowResult,
  ReleaseMilestoneInput,
  ReleaseMilestoneResult,
} from './_contract';

const ADAPTER_KEY = 'stripe_express';

export const stripeExpressEscrowAdapter: EscrowProviderAdapter = {
  key: ADAPTER_KEY,

  async createConnectedAccount(_input: CreateConnectedAccountInput): Promise<CreateConnectedAccountResult> {
    throw new Error(`${ADAPTER_KEY}.createConnectedAccount not implemented`);
  },

  async fundEscrow(_input: FundEscrowInput): Promise<FundEscrowResult> {
    throw new Error(`${ADAPTER_KEY}.fundEscrow not implemented`);
  },

  async releaseMilestone(_input: ReleaseMilestoneInput): Promise<ReleaseMilestoneResult> {
    throw new Error(`${ADAPTER_KEY}.releaseMilestone not implemented`);
  },

  async refundEscrow(_input: { externalEscrowId: string; amountCents: number; reason: string }): Promise<{ refundId: string }> {
    throw new Error(`${ADAPTER_KEY}.refundEscrow not implemented`);
  },
};
