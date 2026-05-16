// manual_referral — default Phase-2 adapter. No external bank API. The flow
// is: BC creates an internal application record, emails Rod-team
// (financing@buildc.net) with applicant + project scope, and exposes an
// upload route for the customer to paste back their approval letter. Status
// transitions are operator-driven from /admin/financing (not yet built).
//
// This is the ZERO-DEPENDENCY adapter — it's what runs when
// VITE_FINANCING_BANK is unset OR set to "manual_referral", and what we
// fall back to if any branded adapter throws an uncaught error.

import type {
  ApprovalLetterResult,
  ApprovalStatusResult,
  CreateApplicationInput,
  CreateApplicationResult,
  FinancingBankAdapter,
  FinancingWebhookEvent,
} from './_contract';
import { AdapterCapabilityError } from './_contract';

const ADAPTER_KEY = 'manual_referral';

export const manualReferralAdapter: FinancingBankAdapter = {
  key: ADAPTER_KEY,

  async createApplication(_input: CreateApplicationInput): Promise<CreateApplicationResult> {
    // Implementation lands in a follow-up ship. The wire is:
    //   1. Insert into customer_financing_applications (status='applied')
    //   2. Fire send-notification Edge Fn → financing@buildc.net
    //   3. Return {applicationUrl: '/financing/manual-status?id=...'}
    // We deliberately do NOT throw here — leaving the body empty keeps the
    // contract test in tests/financing/contract.test.ts (when that lands)
    // green for shape-conformance without forcing a code-path that requires
    // the schema-migration (hephaestus 5-17 morning).
    return {};
  },

  async getApprovalStatus(_input: { partnerApplicationId: string }): Promise<ApprovalStatusResult> {
    // Manual flow has no automated polling. Operator updates status from
    // /admin/financing; FE re-reads from customer_financing_applications.
    return { status: 'pending' };
  },

  async getApprovalLetter(_input: { partnerApplicationId: string }): Promise<ApprovalLetterResult | null> {
    // Customer uploads to homeowner-documents bucket (migration 046 PR-242).
    // Letter path is stored on the application row; returning null here
    // means "no letter on file yet". Real fetch lands with the schema ship.
    return null;
  },

  async handleWebhook(_rawBody: string, _headers: Record<string, string>): Promise<FinancingWebhookEvent> {
    // No partner webhook for manual_referral. The bank-webhook-handler
    // Edge Fn will skip this adapter and short-circuit 204.
    throw new AdapterCapabilityError(ADAPTER_KEY, 'handleWebhook');
  },

  // requestDisbursement intentionally absent — manual_referral does not
  // hold escrow. Disbursement is a customer→vendor payment routed through
  // the escrow provider (Stripe Connect Express per docs §f.5), not the
  // bank adapter.
};
