// manual_referral — default Phase-2 adapter. No external bank API. Browser
// calls adapter.createApplication() directly; adapter does the Supabase
// INSERT into financing_applications under RLS policy "homeowner INSERT own
// with check status='applied'" (per migration 047 / PR-246). No Edge Fn
// involved on the write path — webhook Edge Fn is Phase-3 only.
//
// Operator flow (Rod-team): financing@buildc.net inbound email is fired
// out-of-band by the FE form submit (helios PR), not by this adapter. The
// adapter is the source of truth for the DB row; email notification is a
// separate concern intentionally decoupled from the adapter contract.

import { supabase } from '@/lib/supabase'
import {
  getFinancingApplicationById,
  getFinancingApprovalByApplicationId,
  insertFinancingApplication,
} from '@/lib/api/financing'
import type {
  ApprovalLetterResult,
  ApprovalStatusResult,
  CreateApplicationInput,
  CreateApplicationResult,
  FinancingBankAdapter,
  FinancingWebhookEvent,
} from './_contract'
import { AdapterCapabilityError } from './_contract'

const ADAPTER_KEY = 'manual_referral'

export const manualReferralAdapter: FinancingBankAdapter = {
  key: ADAPTER_KEY,

  async createApplication(input: CreateApplicationInput): Promise<CreateApplicationResult> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('manual_referral.createApplication requires authenticated user')

    const row = await insertFinancingApplication({
      id: input.bcApplicationId,
      homeowner_id: user.id,
      project_id: input.projectId ?? null,
      adapter: ADAPTER_KEY,
      adapter_application_id: input.bcApplicationId,
    })

    return {
      partnerApplicationId: row.id,
      applicationUrl: `/financing/status/${row.id}`,
    }
  },

  async getApprovalStatus(input: { partnerApplicationId: string }): Promise<ApprovalStatusResult> {
    const app = await getFinancingApplicationById(input.partnerApplicationId)
    if (!app) return { status: 'pending' }

    const approval = await getFinancingApprovalByApplicationId(input.partnerApplicationId)
    if (!approval) return { status: app.status }

    return {
      status: app.status,
      approvedAmountCents: approval.envelope_amount_cents ?? undefined,
      downPaymentCents: approval.dp_amount_cents ?? undefined,
      termMonths: approval.term_months ?? undefined,
      aprBps: approval.apr_bps ?? undefined,
      expiresAt: approval.expires_at ?? undefined,
      denialReasonCode: approval.denial_reason_code ?? undefined,
      denialReasonText: approval.denial_reason_text ?? undefined,
    }
  },

  async getApprovalLetter(input: { partnerApplicationId: string }): Promise<ApprovalLetterResult | null> {
    const approval = await getFinancingApprovalByApplicationId(input.partnerApplicationId)
    if (!approval?.letter_url) return null
    const filename = approval.letter_url.split('/').pop() ?? 'approval-letter.pdf'
    return { letterUrl: approval.letter_url, filename }
  },

  async handleWebhook(_rawBody: string, _headers: Record<string, string>): Promise<FinancingWebhookEvent> {
    throw new AdapterCapabilityError(ADAPTER_KEY, 'handleWebhook')
  },
}
