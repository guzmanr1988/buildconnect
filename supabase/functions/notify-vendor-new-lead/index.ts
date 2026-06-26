// notify-vendor-new-lead Edge Function
// task_1776718973266_843 (helios) — Tranche-2 real vendor new-lead notifications,
// EMAIL rail. Kratos direction-lock msg 1782246687673 (phased ship: email now,
// SMS deferred) + Q5 wire-style lock 1782246949241 (FE-invoke server-side edge
// fn AFTER sent_projects upsert resolves successfully — post-await, not
// optimistic). Mig 099 (notification_log + profiles.notification_email_enabled +
// profiles.phone_e164) applied apex 2026-06-23.
//
// Discipline (kratos confirm-glance msg 1782247191418):
//   1. recipient_id non-null assert on kind='vendor_new_lead' — NULL is hard
//      error, not best-effort. Idempotency triplet (event_id, channel,
//      recipient_id) silently degrades to no-dedupe when recipient is NULL.
//   2. Insert-before-send: INSERT notification_log status='pending' BEFORE
//      Resend POST. Unique-violation on insert = retry of an in-flight or
//      completed send → silent no-op (return 200 with reason: 'idempotent_replay').
//   3. Flag-park: NOTIFY_VENDOR_NEW_LEAD_ENABLED default 'false'. While
//      flag-off, logs intent + writes notification_log row with status='pending'
//      → 'failed' (reason: 'flag_off') so dial-tone verify can confirm zero
//      Resend POSTs. Walker flag-flip is the discriminator axis (off=no send,
//      on=exactly-one send + idempotency-dedup on retry).
//
// Request (FE-invoke from sent_projects upsert success handler):
//   POST {
//     sentProjectId: string,    // uuid — IS the event_id
//     vendorId: string,         // uuid — recipient (must be non-null)
//     homeownerName: string,
//     serviceName: string,
//     scheduledDate: string,    // pre-formatted display
//     scheduledTime: string,    // pre-formatted display
//     homeownerAddress: string,
//     quotedPriceLabel?: string // optional pre-formatted dollar string
//   }
//
// Response (200):
//   { ok: true, sent: true, providerId: string, idempotent: false }   // first send succeeded
//   { ok: true, sent: false, reason: 'flag_off', idempotent: false }   // dial-tone path
//   { ok: true, sent: false, reason: 'idempotent_replay', idempotent: true }  // dedup hit
//   { ok: true, sent: false, reason: 'opted_out', idempotent: false }  // vendor opted out
//   { ok: true, sent: false, reason: 'no_email', idempotent: false }   // vendor.email missing
//
// Response (4xx/5xx):
//   { error: string, hint?: string }
//
// Env:
//   SUPABASE_URL                       — for service-role client
//   SUPABASE_SERVICE_ROLE_KEY          — service-role for notification_log writes + profile read
//   NOTIFY_VENDOR_NEW_LEAD_ENABLED     — flag, default 'false' = dial-tone
//   RESEND_API_KEY                     — full-access on buildc.net domain
//   RESEND_FROM                        — defaults to 'BuildConnect <hello@buildc.net>'
//   PUBLIC_APP_URL                     — defaults to 'https://buildc.net'

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/emails/transactional-render.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'BuildConnect <hello@buildc.net>'
const DEFAULT_APP_URL = 'https://buildc.net'
const NOTIFICATION_KIND = 'vendor_new_lead'
const CHANNEL = 'email'

type RequestPayload = {
  sentProjectId: string
  vendorId: string
  homeownerName: string
  serviceName: string
  scheduledDate: string
  scheduledTime: string
  homeownerAddress: string
  quotedPriceLabel?: string
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function flagOn(): boolean {
  return (Deno.env.get('NOTIFY_VENDOR_NEW_LEAD_ENABLED') ?? 'false') === 'true'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, {
      error: 'supabase_not_configured',
      hint: 'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required for notification_log writes.',
    })
  }

  let body: RequestPayload
  try {
    body = (await req.json()) as RequestPayload
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  // ── Kratos guard (note-1, mig 099 confirm-glance): NULL recipient_id on
  //    kind='vendor_new_lead' is a hard error. Idempotency silently degrades
  //    without it (UNIQUE treats NULLs as distinct). Treat it as a 400, not
  //    a best-effort log.
  if (!isUuid(body.sentProjectId)) {
    return jsonResponse(400, { error: 'invalid_sent_project_id' })
  }
  if (!isUuid(body.vendorId)) {
    return jsonResponse(400, { error: 'invalid_vendor_id', hint: 'recipient_id non-null required for vendor_new_lead kind' })
  }
  if (typeof body.homeownerName !== 'string' || body.homeownerName.length === 0 || body.homeownerName.length > 200) {
    return jsonResponse(400, { error: 'invalid_homeowner_name' })
  }
  if (typeof body.serviceName !== 'string' || body.serviceName.length === 0 || body.serviceName.length > 200) {
    return jsonResponse(400, { error: 'invalid_service_name' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Load vendor profile (email + opt-out + first name)
  const { data: vendor, error: vendorErr } = await supabase
    .from('profiles')
    .select('id, email, name, notification_email_enabled')
    .eq('id', body.vendorId)
    .maybeSingle()

  if (vendorErr) {
    console.error(`[notify-vendor-new-lead] vendor lookup error vendor_id=${body.vendorId} err=${vendorErr.message}`)
    return jsonResponse(502, { error: 'vendor_lookup_failed' })
  }
  if (!vendor) {
    return jsonResponse(404, { error: 'vendor_not_found' })
  }

  const vendorEmail = vendor.email as string | null
  const vendorOptIn = vendor.notification_email_enabled !== false  // default true
  const vendorFirstName = (vendor.name as string | null)?.split(' ')[0] ?? 'there'

  // ── Insert-before-send: claim the idempotency slot BEFORE provider call.
  //    Status starts 'pending'; we'll UPDATE to sent/failed after.
  const recipientAddress = vendorEmail
  const { error: insertErr } = await supabase
    .from('notification_log')
    .insert({
      event_id: body.sentProjectId,
      channel: CHANNEL,
      recipient_id: body.vendorId,
      kind: NOTIFICATION_KIND,
      status: 'pending',
      recipient_address: recipientAddress,
    })

  if (insertErr) {
    // Unique-violation = idempotency dedup. Postgres SQLSTATE 23505.
    const isUniqueViolation = (insertErr as { code?: string }).code === '23505'
      || insertErr.message?.includes('notification_log_idempotency_uq')
    if (isUniqueViolation) {
      console.log(`[notify-vendor-new-lead] idempotent replay event_id=${body.sentProjectId} vendor_id=${body.vendorId}`)
      return jsonResponse(200, { ok: true, sent: false, reason: 'idempotent_replay', idempotent: true })
    }
    console.error(`[notify-vendor-new-lead] notification_log insert error: ${insertErr.message}`)
    return jsonResponse(502, { error: 'notification_log_insert_failed' })
  }

  // Helper to update the log row to final status
  const finalize = async (status: 'sent' | 'failed', extras: { provider_id?: string; error?: string } = {}) => {
    const patch: Record<string, unknown> = { status, sent_at: status === 'sent' ? new Date().toISOString() : null }
    if (extras.provider_id) patch.provider_id = extras.provider_id
    if (extras.error) patch.error = extras.error.substring(0, 2000)  // cap
    await supabase
      .from('notification_log')
      .update(patch)
      .eq('event_id', body.sentProjectId)
      .eq('channel', CHANNEL)
      .eq('recipient_id', body.vendorId)
  }

  // ── Short-circuits (log a finalized row so observability is complete) ──

  if (!vendorOptIn) {
    await finalize('failed', { error: 'opted_out' })
    return jsonResponse(200, { ok: true, sent: false, reason: 'opted_out', idempotent: false })
  }

  if (!vendorEmail) {
    await finalize('failed', { error: 'no_email' })
    return jsonResponse(200, { ok: true, sent: false, reason: 'no_email', idempotent: false })
  }

  // ── Flag-park (dial-tone): claim slot + log intent + return without
  //    Resend call. Walker flag-flip is the discriminator axis.
  if (!flagOn()) {
    console.log(`[notify-vendor-new-lead] FLAG-OFF would send to=${vendorEmail} event_id=${body.sentProjectId}`)
    await finalize('failed', { error: 'flag_off' })
    return jsonResponse(200, { ok: true, sent: false, reason: 'flag_off', idempotent: false })
  }

  const apiKey = Deno.env.get('RESEND_API_KEY') || ''
  if (!apiKey) {
    await finalize('failed', { error: 'resend_not_configured' })
    return jsonResponse(503, {
      error: 'resend_not_configured',
      hint: 'Set RESEND_API_KEY via supabase secrets set.',
    })
  }

  // ── Render brand-shell + build payload
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || DEFAULT_APP_URL
  const leadUrl = `${appUrl}/vendor/leads/${encodeURIComponent(body.sentProjectId)}`
  const unsubscribeUrl = `${appUrl}/vendor/profile?tab=notifications`

  const { subject, html } = renderEmail({
    type: 'vendor-new-lead',
    data: {
      vendorFirstName,
      homeownerName: body.homeownerName,
      serviceName: body.serviceName,
      scheduledDate: body.scheduledDate,
      scheduledTime: body.scheduledTime,
      homeownerAddress: body.homeownerAddress,
      quotedPriceLabel: body.quotedPriceLabel,
      leadUrl,
      unsubscribeUrl,
    },
  })

  const from = Deno.env.get('RESEND_FROM') || DEFAULT_FROM

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: vendorEmail, subject, html }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[notify-vendor-new-lead] resend error status=${res.status} body=${errBody}`)
    await finalize('failed', { error: `resend_${res.status}:${errBody}` })
    return jsonResponse(502, { error: 'resend_send_failed', status: res.status })
  }

  const { id: providerId } = (await res.json()) as { id: string }
  await finalize('sent', { provider_id: providerId })
  console.log(`[notify-vendor-new-lead] sent to=${vendorEmail} event_id=${body.sentProjectId} provider_id=${providerId}`)
  return jsonResponse(200, { ok: true, sent: true, providerId, idempotent: false })
})
