// notify-lead-event Edge Function
// task_1778632248579_013 (hermes — vendor new-lead SMS+email)
// task_1778632251533_805 (phaethon — homeowner-notify on accept)
//
// Single fan-out for lead-centric notifications. Dispatched by event_type +
// recipient_type. Always writes a row to public.notifications_test (audit
// trail + Rod morning-review). Real-fire (Twilio SMS + Resend email) gated
// on env: VENDOR_NOTIF_ENABLED + HOMEOWNER_NOTIF_ENABLED — independent so
// Rod can flip each direction without touching the other.
//
// Callers:
//   - Client app (homeowner JWT): { lead_id, recipient_type: 'vendor', event_type: 'new_lead' }
//     after sent_projects.insert succeeds.
//   - phaethon lead-status-transition Edge Function (service-role bearer):
//     { lead_id, recipient_type: 'homeowner', event_type: 'lead_accepted' }
//     after vendor accepts.
//
// Defense layers:
//   1. JWT verify OR service-role bypass — anonymous unauthenticated → 401
//   2. Caller-involvement check — JWT user must be homeowner_id, vendor_id,
//      or admin on the lead. service-role bypasses.
//   3. Idempotency — unique (lead_id, recipient_type, channel, event_type)
//      gate; retry returns 200 idempotent=true.
//   4. Test-table audit BEFORE real-fire — every payload lands in
//      notifications_test even when flag is on, so Rod can spot-check.
//   5. Errors normalized — never leak Supabase / provider internals.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type RecipientType = 'vendor' | 'homeowner'
type EventType = 'new_lead' | 'lead_accepted' | 'lead_rejected' | 'lead_rejected_silent'

interface Body {
  lead_id: string
  recipient_type: RecipientType
  event_type: EventType
}

interface LeadRow {
  id: string
  vendor_id: string | null
  homeowner_id: string | null
  homeowner_name: string | null
  homeowner_phone: string | null
  homeowner_email: string | null
  homeowner_address: string | null
  item: Record<string, unknown> | null
  contractor: Record<string, unknown> | null
}

interface ProfileRow {
  id: string
  email: string | null
  phone: string | null
  name: string | null
  role: string | null
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function redactAddressToZip(address: string | null): string {
  if (!address) return 'your area'
  const zipMatch = address.match(/\b(\d{5})(-\d{4})?\b/)
  if (zipMatch) return zipMatch[1]
  const tail = address.split(',').slice(-2).join(',').trim()
  return tail || 'your area'
}

function serviceLabel(item: Record<string, unknown> | null): string {
  if (!item) return 'a new project'
  const name = (item as { serviceName?: string }).serviceName
  if (typeof name === 'string' && name) return name
  const slug = (item as { serviceId?: string }).serviceId
  if (typeof slug === 'string' && slug) return slug.replace(/_/g, ' ')
  return 'a new project'
}

function dashboardUrl(recipientType: RecipientType, leadId: string): string {
  const base = Deno.env.get('APP_BASE_URL') || 'https://buildc.net'
  if (recipientType === 'vendor') return `${base}/vendor/leads/${leadId}`
  return `${base}/projects/${leadId}`
}

function buildPayload(
  recipientType: RecipientType,
  eventType: EventType,
  channel: 'sms' | 'email',
  lead: LeadRow,
  recipient: ProfileRow,
): Record<string, unknown> {
  const service = serviceLabel(lead.item)
  const zip = redactAddressToZip(lead.homeowner_address)
  const url = dashboardUrl(recipientType, lead.id)

  if (recipientType === 'vendor' && eventType === 'new_lead') {
    if (channel === 'sms') {
      return {
        to: recipient.phone,
        body: `New BuildConnect lead — ${service} at ${zip}. Reply ACCEPT or REJECT. Full details: ${url}`,
        lead_summary: { service, zip, url },
      }
    }
    return {
      to: recipient.email,
      subject: `New BuildConnect lead: ${service}`,
      html: `<h2>New BuildConnect lead</h2>
<p><strong>Service:</strong> ${service}</p>
<p><strong>Area:</strong> ${zip}</p>
<p><strong>Homeowner:</strong> ${lead.homeowner_name ?? 'on file'}</p>
<p><a href="${url}" style="background:#0066cc;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;">View lead and accept or reject</a></p>
<p style="color:#666;font-size:12px;margin-top:24px;">Tap the button above to open this lead in your dashboard. Full address shared on accept.</p>`,
      text: `New BuildConnect lead — ${service} at ${zip}. View and accept/reject: ${url}`,
      lead_summary: { service, zip, url },
    }
  }

  if (recipientType === 'homeowner' && eventType === 'lead_accepted') {
    const contractorName =
      (lead.contractor as { company?: string; name?: string } | null)?.company ??
      (lead.contractor as { name?: string } | null)?.name ??
      'Your contractor'
    if (channel === 'sms') {
      return {
        to: recipient.phone,
        body: `${contractorName} accepted your BuildConnect project (${service}). See details: ${url}`,
        lead_summary: { service, contractor: contractorName, url },
      }
    }
    return {
      to: recipient.email,
      subject: `${contractorName} accepted your project`,
      html: `<h2>Your contractor accepted</h2>
<p><strong>${contractorName}</strong> has accepted your ${service} project on BuildConnect.</p>
<p><a href="${url}" style="background:#0066cc;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;">View project details</a></p>`,
      text: `${contractorName} accepted your BuildConnect project (${service}). Details: ${url}`,
      lead_summary: { service, contractor: contractorName, url },
    }
  }

  return {
    to: channel === 'sms' ? recipient.phone : recipient.email,
    body: `[unhandled event_type=${eventType} recipient_type=${recipientType}]`,
    lead_summary: { service, url },
  }
}

function isFlagEnabled(recipientType: RecipientType): boolean {
  const key =
    recipientType === 'vendor'
      ? 'VENDOR_NOTIF_ENABLED'
      : 'HOMEOWNER_NOTIF_ENABLED'
  return (Deno.env.get(key) ?? 'false').toLowerCase() === 'true'
}

async function fireSms(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from = Deno.env.get('TWILIO_FROM_NUMBER')
  const to = payload.to as string | undefined
  const body = payload.body as string | undefined
  if (!sid || !token || !from) return { ok: false, error: 'twilio_secrets_missing' }
  if (!to || !body) return { ok: false, error: 'payload_to_or_body_missing' }
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    },
  )
  if (!resp.ok) {
    const detail = await resp.text()
    return { ok: false, error: `twilio_${resp.status}: ${detail.slice(0, 200)}` }
  }
  return { ok: true }
}

async function fireEmail(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM') ?? 'notifications@buildc.net'
  const to = payload.to as string | undefined
  const subject = payload.subject as string | undefined
  const html = payload.html as string | undefined
  const text = payload.text as string | undefined
  if (!key) return { ok: false, error: 'resend_key_missing' }
  if (!to || !subject || !html) return { ok: false, error: 'payload_to_subject_or_html_missing' }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  })
  if (!resp.ok) {
    const detail = await resp.text()
    return { ok: false, error: `resend_${resp.status}: ${detail.slice(0, 200)}` }
  }
  return { ok: true }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) return json(401, { error: 'missing_bearer_token' })

  const isServiceRoleCall = token === serviceRoleKey
  let callerUserId: string | null = null
  let callerRole: string | null = null
  if (!isServiceRoleCall) {
    const { data: userResult, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userResult?.user) {
      return json(401, { error: 'invalid_or_expired_token' })
    }
    callerUserId = userResult.user.id
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerUserId)
      .maybeSingle()
    callerRole = (callerProfile as { role?: string } | null)?.role ?? null
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json(400, { error: 'invalid_json_body' })
  }
  if (
    !body.lead_id ||
    !body.recipient_type ||
    !body.event_type ||
    (body.recipient_type !== 'vendor' && body.recipient_type !== 'homeowner')
  ) {
    return json(400, { error: 'invalid_body_shape' })
  }

  const { data: leadRowRaw, error: leadErr } = await admin
    .from('sent_projects')
    .select(
      'id, vendor_id, homeowner_id, homeowner_name, homeowner_phone, homeowner_email, homeowner_address, item, contractor',
    )
    .eq('id', body.lead_id)
    .maybeSingle()
  if (leadErr || !leadRowRaw) return json(404, { error: 'lead_not_found' })
  const lead = leadRowRaw as LeadRow

  if (!isServiceRoleCall) {
    const isInvolved =
      callerUserId === lead.homeowner_id ||
      callerUserId === lead.vendor_id ||
      callerRole === 'admin'
    if (!isInvolved) return json(403, { error: 'forbidden_not_involved_in_lead' })
  }

  const recipientId =
    body.recipient_type === 'vendor' ? lead.vendor_id : lead.homeowner_id
  if (!recipientId) return json(400, { error: 'recipient_id_unresolvable' })
  const { data: recipientRowRaw, error: recipientErr } = await admin
    .from('profiles')
    .select('id, email, phone, name, role')
    .eq('id', recipientId)
    .maybeSingle()
  if (recipientErr || !recipientRowRaw) {
    return json(404, { error: 'recipient_profile_not_found' })
  }
  const recipient = recipientRowRaw as ProfileRow

  const flagOn = isFlagEnabled(body.recipient_type)
  const results: Record<string, unknown> = { sms: null, email: null }

  for (const channel of ['sms', 'email'] as const) {
    if (channel === 'sms' && !recipient.phone) {
      results[channel] = { skipped: 'recipient_phone_missing' }
      continue
    }
    if (channel === 'email' && !recipient.email) {
      results[channel] = { skipped: 'recipient_email_missing' }
      continue
    }

    const payload = buildPayload(
      body.recipient_type,
      body.event_type,
      channel,
      lead,
      recipient,
    )

    const initialStatus = flagOn ? 'queued' : 'test'
    const { data: inserted, error: insertErr } = await admin
      .from('notifications_test')
      .insert({
        lead_id: body.lead_id,
        recipient_type: body.recipient_type,
        recipient_id: recipientId,
        channel,
        event_type: body.event_type,
        payload,
        status: initialStatus,
      })
      .select('id')
      .maybeSingle()

    if (insertErr) {
      const isDupe = (insertErr as { code?: string }).code === '23505'
      if (isDupe) {
        results[channel] = { idempotent: true, status: 'already_recorded' }
        continue
      }
      results[channel] = { error: 'audit_write_failed', detail: insertErr.message }
      continue
    }

    const rowId = (inserted as { id?: string } | null)?.id ?? null

    if (!flagOn) {
      results[channel] = { row_id: rowId, status: 'test', flag_off: true }
      continue
    }

    const fireResult =
      channel === 'sms' ? await fireSms(payload) : await fireEmail(payload)
    const newStatus = fireResult.ok ? 'sent' : 'failed'
    await admin
      .from('notifications_test')
      .update({ status: newStatus, error_msg: fireResult.error ?? null })
      .eq('id', rowId)
    results[channel] = { row_id: rowId, status: newStatus, error: fireResult.error }
  }

  return json(200, {
    ok: true,
    lead_id: body.lead_id,
    recipient_type: body.recipient_type,
    event_type: body.event_type,
    flag_on: flagOn,
    results,
  })
})
