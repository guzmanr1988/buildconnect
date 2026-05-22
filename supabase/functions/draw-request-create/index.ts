// draw-request-create Edge Function
//
// VENDOR-callable. Initiates a milestone draw against a homeowner's
// approved financing envelope. Validates ownership chain, envelope-remaining,
// active-draw lock, then INSERTs draw_requests row with sms_pending status,
// generates one-shot sms_token, dispatches STUB-SMS (v1 — no Twilio yet).
//
// Body: { sent_project_id: uuid, amount_cents: int, idempotency_key?: string }
// Auth: vendor JWT
//
// Math (PLATFORM_COMMISSION_PCT = 10 v1, hardcoded constant):
//   commission_cents = floor(amount_cents * 10 / 100)
//   vendor_payout_cents = amount_cents - commission_cents
//
// 7-step Rod constraint coverage:
//   #1 sold-gate (lead.status = sold-active)        — handler step 5
//   #2 full-or-partial pull flex                     — server-derived from
//                                                       envelope_remaining_after
//   #3 homeowner SMS approval per pull               — sms_token + sms_sent_at
//   #5 per-draw commission % off-the-top             — math constants above
//   #6 master-flag gate (financing-active)           — handler step 3
//
// Banked discipline:
//   - feedback_supabase_edge_function_deploy_multipart_not_json (deploy lane)
//   - feedback_supabase_security_definer_search_path (none here, service-role
//     write-path so RLS bypass intended; production RLS still enforced for
//     direct PostgREST writes)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLATFORM_COMMISSION_PCT = 10
const DISPUTE_WINDOW_HOURS = 48

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function generateSmsToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

type CreateBody = {
  sent_project_id: string
  amount_cents: number
  idempotency_key?: string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) {
    return jsonResponse(401, { error: 'missing_bearer_token' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { error: 'invalid_or_expired_token' })
  }
  const vendorId = userResult.user.id

  const { data: flagRow, error: flagErr } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'financing_enabled')
    .maybeSingle()
  if (flagErr) return jsonResponse(500, { error: 'flag_check_failed' })
  if (!flagRow || flagRow.enabled !== true) {
    return jsonResponse(503, { error: 'financing_disabled', flag: 'financing_enabled' })
  }

  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }

  if (typeof body.sent_project_id !== 'string' || body.sent_project_id.length === 0) {
    return jsonResponse(400, { error: 'missing_sent_project_id' })
  }
  if (typeof body.amount_cents !== 'number' || !Number.isInteger(body.amount_cents) || body.amount_cents <= 0) {
    return jsonResponse(400, { error: 'invalid_amount_cents' })
  }

  // Idempotency check (apollo Q1 pattern: same key+amount → return existing; key+different amount → 409)
  if (body.idempotency_key) {
    const { data: existing, error: idemErr } = await admin
      .from('draw_requests')
      .select('id, amount_cents, commission_cents, vendor_payout_cents, status')
      .eq('vendor_id', vendorId)
      .eq('sent_project_id', body.sent_project_id)
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle()
    if (idemErr) return jsonResponse(500, { error: 'idempotency_lookup_failed' })
    if (existing) {
      if (existing.amount_cents !== body.amount_cents) {
        return jsonResponse(409, { error: 'idempotency_key_amount_mismatch' })
      }
      return jsonResponse(200, {
        ok: true,
        draw_request_id: existing.id,
        amount_cents: existing.amount_cents,
        commission_cents: existing.commission_cents,
        vendor_payout_cents: existing.vendor_payout_cents,
        status: existing.status,
        idempotent_replay: true,
      })
    }
  }

  // Sent-project ownership + lead sold-active gate (Rod #1)
  const { data: spRow, error: spErr } = await admin
    .from('sent_projects')
    .select('id, vendor_id, homeowner_id, lead_id, status')
    .eq('id', body.sent_project_id)
    .maybeSingle()
  if (spErr) return jsonResponse(500, { error: 'sent_project_lookup_failed' })
  if (!spRow) return jsonResponse(404, { error: 'sent_project_not_found' })
  if (spRow.vendor_id !== vendorId) {
    return jsonResponse(403, { error: 'vendor_not_owner_of_sent_project' })
  }

  // Lead sold-active check (Rod #1)
  const { data: leadRow, error: leadErr } = await admin
    .from('leads')
    .select('id, status')
    .eq('id', spRow.lead_id)
    .maybeSingle()
  if (leadErr) return jsonResponse(500, { error: 'lead_lookup_failed' })
  if (!leadRow || leadRow.status !== 'sold-active') {
    return jsonResponse(403, { error: 'lead_not_sold_active', current_status: leadRow?.status ?? null })
  }

  // Financing application (project_id wire-up — helios D-deliverable required for non-null match)
  const { data: faRow, error: faErr } = await admin
    .from('financing_applications')
    .select('id, homeowner_id, status')
    .eq('project_id', body.sent_project_id)
    .in('status', ['approved', 'terms_accepted'])
    .maybeSingle()
  if (faErr) return jsonResponse(500, { error: 'financing_application_lookup_failed' })
  if (!faRow) {
    return jsonResponse(404, { error: 'no_approved_financing_application_for_project' })
  }

  // Envelope source — customer_financing_profile.last_known_amount_cents
  const { data: cfpRow, error: cfpErr } = await admin
    .from('customer_financing_profile')
    .select('last_known_amount_cents')
    .eq('customer_id', faRow.homeowner_id)
    .maybeSingle()
  if (cfpErr) return jsonResponse(500, { error: 'envelope_lookup_failed' })
  const envelopeCents = cfpRow?.last_known_amount_cents
  if (typeof envelopeCents !== 'number' || envelopeCents <= 0) {
    return jsonResponse(409, { error: 'no_active_envelope' })
  }

  // Drawn-so-far sum (approved + paid count against envelope)
  const { data: drawn, error: drawnErr } = await admin
    .from('draw_requests')
    .select('amount_cents, status')
    .eq('financing_application_id', faRow.id)
    .in('status', ['approved', 'paid'])
  if (drawnErr) return jsonResponse(500, { error: 'drawn_sum_lookup_failed' })
  const drawnSum = (drawn ?? []).reduce((sum, r: { amount_cents: number }) => sum + r.amount_cents, 0)
  const envelopeRemaining = envelopeCents - drawnSum
  if (body.amount_cents > envelopeRemaining) {
    return jsonResponse(400, {
      error: 'amount_exceeds_remaining',
      envelope_cents: envelopeCents,
      drawn_cents: drawnSum,
      remaining_cents: envelopeRemaining,
      requested_cents: body.amount_cents,
    })
  }

  // Active-draw lock (only one sms_pending at a time per FA)
  const { data: pendingRow, error: pendingErr } = await admin
    .from('draw_requests')
    .select('id')
    .eq('financing_application_id', faRow.id)
    .eq('status', 'sms_pending')
    .maybeSingle()
  if (pendingErr) return jsonResponse(500, { error: 'pending_lookup_failed' })
  if (pendingRow) {
    return jsonResponse(409, { error: 'active_draw_pending', existing_id: pendingRow.id })
  }

  // Math (Rod #5)
  const commissionCents = Math.floor(body.amount_cents * PLATFORM_COMMISSION_PCT / 100)
  const vendorPayoutCents = body.amount_cents - commissionCents

  // Generate one-shot SMS token (Rod #3)
  const smsToken = generateSmsToken()
  const now = new Date().toISOString()

  const { data: inserted, error: insertErr } = await admin
    .from('draw_requests')
    .insert({
      financing_application_id: faRow.id,
      sent_project_id: spRow.id,
      vendor_id: vendorId,
      homeowner_id: spRow.homeowner_id,
      amount_cents: body.amount_cents,
      commission_cents: commissionCents,
      vendor_payout_cents: vendorPayoutCents,
      status: 'sms_pending',
      sms_token: smsToken,
      sms_sent_at: now,
      idempotency_key: body.idempotency_key ?? null,
    })
    .select('id')
    .single()
  if (insertErr) {
    return jsonResponse(500, { error: 'insert_failed', detail: insertErr.message })
  }

  // STUB-SMS dispatch (v1 — no Twilio). Log structured event for admin/dev surface.
  console.log(JSON.stringify({
    event: 'sms_stub_dispatched',
    draw_request_id: inserted.id,
    homeowner_id: faRow.homeowner_id,
    amount_cents: body.amount_cents,
    sms_token_redacted: smsToken.slice(0, 4) + '...',
    sent_at: now,
  }))

  return jsonResponse(200, {
    ok: true,
    draw_request_id: inserted.id,
    amount_cents: body.amount_cents,
    commission_cents: commissionCents,
    vendor_payout_cents: vendorPayoutCents,
    envelope_remaining_after_cents: envelopeRemaining - body.amount_cents,
    status: 'sms_pending',
    sms_status: 'stub_dispatched',
    dispute_window_hours: DISPUTE_WINDOW_HOURS,
  })
})
