// GoodLeap adapter — STUB. Throws AdapterCapabilityError on every call
// until the real GoodLeap Partner API integration ships. Registered in
// the adapters index so toggling VITE_FINANCING_BANK=goodleap fails LOUD
// rather than silently falling back to manual_referral.

import type {
  ApprovalLetterResult,
  ApprovalStatusResult,
  CreateApplicationInput,
  CreateApplicationResult,
  FinancingBankAdapter,
  FinancingWebhookEvent,
} from './_contract';
import { AdapterCapabilityError } from './_contract';

const ADAPTER_KEY = 'goodleap';

export const goodleapAdapter: FinancingBankAdapter = {
  key: ADAPTER_KEY,

  async createApplication(_input: CreateApplicationInput): Promise<CreateApplicationResult> {
    throw new AdapterCapabilityError(ADAPTER_KEY, 'createApplication');
  },

  async getApprovalStatus(_input: { partnerApplicationId: string }): Promise<ApprovalStatusResult> {
    throw new AdapterCapabilityError(ADAPTER_KEY, 'getApprovalStatus');
  },

  async getApprovalLetter(_input: { partnerApplicationId: string }): Promise<ApprovalLetterResult | null> {
    throw new AdapterCapabilityError(ADAPTER_KEY, 'getApprovalLetter');
  },

  async handleWebhook(_rawBody: string, _headers: Record<string, string>): Promise<FinancingWebhookEvent> {
    throw new AdapterCapabilityError(ADAPTER_KEY, 'handleWebhook');
  },
};
