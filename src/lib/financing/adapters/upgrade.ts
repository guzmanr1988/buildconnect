// Upgrade (Upgrade Inc.) adapter — STUB. See goodleap.ts header.

import type {
  ApprovalLetterResult,
  ApprovalStatusResult,
  CreateApplicationInput,
  CreateApplicationResult,
  FinancingBankAdapter,
  FinancingWebhookEvent,
} from './_contract';
import { AdapterCapabilityError } from './_contract';

const ADAPTER_KEY = 'upgrade';

export const upgradeAdapter: FinancingBankAdapter = {
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
