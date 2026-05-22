// GoodLeap adapter — DEMO STUB (helios task_1779387367041_851). Real
// GoodLeap Partner API integration is still Phase-3. To support Rod's
// end-to-end UI clickthrough demo (pre-launch posture, no backend wire
// required), createApplication mirrors manual_referral's local Supabase
// INSERT under the homeowner-own RLS policy — same status='applied' row
// shape so the existing status.tsx renders normally. The other adapter
// methods stay capability-error stubs since they're not exercised in the
// demo flow; status.tsx reads directly from financing_applications +
// uses the existing Accept-Terms / Reset demo controls to advance state.
//
// Rip / re-wire at GA cleanup. Grep `data-demo-control` +
// project_buildconnect_financing_demo_controls_pre_launch_only.

import { supabase } from '@/lib/supabase';
import { insertFinancingApplication } from '@/lib/api/financing';
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

  async createApplication(input: CreateApplicationInput): Promise<CreateApplicationResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('goodleap.createApplication requires authenticated user');

    const row = await insertFinancingApplication({
      id: input.bcApplicationId,
      homeowner_id: user.id,
      project_id: input.projectId ?? null,
      adapter: ADAPTER_KEY,
      adapter_application_id: input.bcApplicationId,
      estimated_amount_cents: input.projectScope.estimated_amount_cents,
    });

    return {
      partnerApplicationId: row.id,
      applicationUrl: `/financing/status/${row.id}`,
    };
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
