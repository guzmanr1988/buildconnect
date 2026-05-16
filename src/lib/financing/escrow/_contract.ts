// EscrowProviderAdapter — parallel to FinancingBankAdapter for the
// customer→vendor money-flow side. Bank funds the loan to the customer;
// escrow holds the customer payment and releases per milestone. Separate
// adapter so we can swap escrow providers (Stripe Connect Express vs
// Tilled vs custom) without touching the bank-adapter layer.
//
// Recommendation in docs §(f).5: Stripe Connect Express for v1.

export type EscrowAccountStatus =
  | 'pending_verification'
  | 'active'
  | 'restricted'
  | 'rejected';

export type EscrowReleaseStatus = 'pending' | 'released' | 'failed' | 'reversed';

export interface CreateConnectedAccountInput {
  vendorId: string;
  businessEmail: string;
  businessName: string;
  country: string;
}

export interface CreateConnectedAccountResult {
  externalAccountId: string;
  onboardingUrl?: string;
  status: EscrowAccountStatus;
}

export interface FundEscrowInput {
  bcEscrowId: string;
  customerEmail: string;
  amountCents: number;
  description: string;
}

export interface FundEscrowResult {
  externalEscrowId: string;
  customerPaymentUrl?: string;
}

export interface ReleaseMilestoneInput {
  externalEscrowId: string;
  vendorExternalAccountId: string;
  amountCents: number;
  milestoneRef: string;
  applicationFeeCents?: number;
}

export interface ReleaseMilestoneResult {
  releaseId: string;
  status: EscrowReleaseStatus;
}

export interface EscrowProviderAdapter {
  readonly key: string;

  createConnectedAccount(input: CreateConnectedAccountInput): Promise<CreateConnectedAccountResult>;
  fundEscrow(input: FundEscrowInput): Promise<FundEscrowResult>;
  releaseMilestone(input: ReleaseMilestoneInput): Promise<ReleaseMilestoneResult>;
  refundEscrow(input: { externalEscrowId: string; amountCents: number; reason: string }): Promise<{ refundId: string }>;
}
