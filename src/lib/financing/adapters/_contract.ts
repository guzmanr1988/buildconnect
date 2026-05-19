// FinancingBankAdapter contract — Phase-2 scaffolding (dark, gated by
// feature_flags.financing_enabled DB row via useFeatureFlag hook). One
// adapter per bank. All adapters share this
// shape so swapping FINANCING_BANK env value is a one-line config change —
// per the reversibility contract in docs/financing-architecture.md §(j).
//
// Sibling: src/lib/financing/escrow/_contract.ts for escrow providers.

export type FinancingApplicationStatus =
  | 'pending'
  | 'applied'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'terms_accepted'
  | 'cancelled';

export interface CustomerProfileInput {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
  };
}

export interface ProjectScopeInput {
  service_category: string;
  estimated_amount_cents: number;
  vendor_id?: string;
}

export interface CreateApplicationInput {
  customerProfile: CustomerProfileInput;
  projectScope: ProjectScopeInput;
  bcApplicationId: string;
}

export interface CreateApplicationResult {
  partnerApplicationId?: string;
  applicationUrl?: string;
}

export interface ApprovalStatusResult {
  status: FinancingApplicationStatus;
  approvedAmountCents?: number;
  downPaymentCents?: number;
  termMonths?: number;
  aprBps?: number;
  expiresAt?: string;
  denialReasonCode?: string;
  denialReasonText?: string;
}

export interface ApprovalLetterResult {
  letterUrl: string;
  filename: string;
}

export interface DisbursementInput {
  partnerApplicationId: string;
  milestoneAmountCents: number;
  milestoneRef: string;
}

export interface DisbursementResult {
  disbursementId: string;
  status: 'pending' | 'released' | 'failed';
}

export interface FinancingWebhookEvent {
  eventType: string;
  partnerApplicationId?: string;
  status?: FinancingApplicationStatus;
  rawPayload: unknown;
}

export interface FinancingBankAdapter {
  readonly key: string;

  createApplication(input: CreateApplicationInput): Promise<CreateApplicationResult>;

  getApprovalStatus(input: { partnerApplicationId: string }): Promise<ApprovalStatusResult>;

  getApprovalLetter(input: { partnerApplicationId: string }): Promise<ApprovalLetterResult | null>;

  handleWebhook(rawBody: string, headers: Record<string, string>): Promise<FinancingWebhookEvent>;

  requestDisbursement?(input: DisbursementInput): Promise<DisbursementResult>;
}

// Sentinel for optional methods the adapter does not implement. Callers
// catch this specifically rather than swallowing generic Error so a real
// bug never gets masked as "this bank doesn't support that op".
export class AdapterCapabilityError extends Error {
  readonly capability: string;
  readonly adapterKey: string;

  constructor(adapterKey: string, capability: string) {
    super(`adapter ${adapterKey} does not support capability: ${capability}`);
    this.name = 'AdapterCapabilityError';
    this.adapterKey = adapterKey;
    this.capability = capability;
  }
}
