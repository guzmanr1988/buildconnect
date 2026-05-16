/*
 * Helios email template registry.
 *
 * Single source of truth for all transactional email templates served via
 * Resend. Each entry pairs an HTML body, a plaintext body, a subject line,
 * and the set of merge tags the template expects.
 *
 * Adapter handlers (e.g. hermes notify-lead-event) import this registry,
 * select a template by id, populate merge tags from event payload, and
 * forward to Resend. Optional merge tags render conditionally via
 * Handlebars-style {{#if}} blocks inside the template bodies.
 *
 * Conventions:
 *  - Template id is `<flow>-<variant>-v<n>` (e.g. denial-financing-v1).
 *  - HTML file ships alongside plaintext file with matching basename.
 *  - Subject line lives in the registry, not the template body, so the
 *    adapter can use it without parsing HTML.
 *  - mergeTags lists every {{var}} reference; required tags are caller-
 *    enforced, optional tags render conditionally.
 */

import denialFinancingV1Html from './denial-financing-v1.html' with { type: 'text' }
import denialFinancingV1Txt from './denial-financing-v1.txt' with { type: 'text' }

export type MergeTagSpec = {
  name: string
  required: boolean
  description: string
}

export type EmailTemplate = {
  id: string
  subject: string
  html: string
  text: string
  mergeTags: MergeTagSpec[]
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  'denial-financing-v1': {
    id: 'denial-financing-v1',
    subject: 'Update on your financing application',
    html: denialFinancingV1Html,
    text: denialFinancingV1Txt,
    mergeTags: [
      { name: 'customer_first_name', required: true, description: 'Homeowner first name for greeting' },
      { name: 'lender_name', required: true, description: 'Customer-facing lender label (e.g. "Sunlight Financial")' },
      { name: 'denial_reason', required: false, description: 'Human-readable denial reason from lender, if provided' },
      { name: 'denial_reason_code', required: false, description: 'Machine code for support lookup (renders alongside denial_reason)' },
      { name: 'retry_eligibility_days_if_any', required: false, description: 'Days until customer can re-apply with same lender, if disclosed' },
      { name: 'link_to_alternate_financing_options', required: true, description: 'URL routing back to BC alternate-financing flow (mailto: for v1 manual_referral, BC route post-Phase-2-D8)' },
    ],
  },
}

export function getTemplate(id: string): EmailTemplate {
  const tpl = EMAIL_TEMPLATES[id]
  if (!tpl) throw new Error(`Unknown email template id: ${id}`)
  return tpl
}
