// draw-request-approve Edge Function
//
// HOMEOWNER-callable (or service_role for walker-deterministic). Approves
// or disputes a sms_pending draw. One-shot sms_token consume (NULL after).
//
// Body: { draw_request_id: uuid, sms_token: string, decision: 'approve' | 'dispute' }
// Auth: homeowner JWT (RLS-verified homeowner owns the FA) OR service_role bypass
//
// On approve:
//   status sms_pending → approved
//   sms_approved_at = NOW()
//   dispute_window_ends_at = NOW() + 48h
//   sms_token NULLed
//
// On dispute (TERMINAL v1, no re-submit per kratos Q2 ruling):
//   status sms_pending → disputed
//   sms_disputed_at = NOW()
//   sms_token NULLed (no replay)
//
// 7-step Rod constraint coverage:
//   #3 homeowner SMS approval per pull               — sms_token verify
//   #4 48h dispute window                            — dispute_window_ends_at
//   #6 master-flag gate                              — handler step 3

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

type ApproveBody = {
  draw_request_id: string
  sms_token: string
  decision: 'approve' | 'dispute'
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

  // Detect service-role bypass (walker-deterministic path) vs homeowner JWT
  const isServiceRole = token === serviceRoleKey
  let homeownerId: string | null = null
  if (!isServiceRole) {
    const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
    if (getUserErr || !userResult?.user) {
      return jsonResponse(401, { error: 'invalid_or_expired_token' })
    }
    homeownerId = userResult.user.id
  }

  const { data: flagRow, error: flagErr } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'financing_enabled')
    .maybeSingle()
  if (flagErr) return jsonResponse(500, { error: 'flag_check_failed' })
  if (!flagRow || flagRow.enabled !== true) {
    return jsonResponse(503, { error: 'financing_disabled', flag: 'financing_enabled' })
  }

  let body: ApproveBody
  try {
    body = (await req.json()) as ApproveBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }

  if (typeof body.draw_request_id !== 'string' || body.draw_request_id.length === 0) {
    return jsonResponse(400, { error: 'missing_draw_request_id' })
  }
  if (typeof body.sms_token !== 'string' || body.sms_token.length === 0) {
    return jsonResponse(400, { error: 'missing_sms_token' })
  }
  if (body.decision !== 'approve' && body.decision !== 'dispute') {
    return jsonResponse(400, { error: 'invalid_decision' })
  }

  // Lookup draw — service_role sees all; homeowner JWT verifies ownership via FA.homeowner_id
  const { data: drawRow, error: drawErr } = await admin
    .from('draw_requests')
    .select('id, financing_application_id, status, sms_token')
    .eq('id', body.draw_request_id)
    .maybeSingle()
  if (drawErr) return jsonResponse(500, { error: 'draw_lookup_failed' })
  if (!drawRow) return jsonResponse(404, { error: 'draw_request_not_found' })

  if (!isServiceRole) {
    const { data: faRow, error: faErr } = await admin
      .from('financing_applications')
      .select('homeowner_id')
      .eq('id', drawRow.financing_application_id)
      .maybeSingle()
    if (faErr) return jsonResponse(500, { error: 'fa_lookup_failed' })
    if (!faRow || faRow.homeowner_id !== homeownerId) {
      return jsonResponse(403, { error: 'not_homeowner_of_draw' })
    }
  }

  if (drawRow.status !== 'sms_pending') {
    return jsonResponse(409, { error: 'draw_not_in_sms_pending_state', current_status: drawRow.status })
  }
  if (drawRow.sms_token === null) {
    return jsonResponse(400, { error: 'sms_token_consumed' })
  }
  if (drawRow.sms_token !== body.sms_token) {
    return jsonResponse(400, { error: 'sms_token_invalid' })
  }

  const now = new Date().toISOString()

  if (body.decision === 'approve') {
    const disputeWindowEnds = new Date(Date.now() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    const { error: updErr } = await admin
      .from('draw_requests')
      .update({
        status: 'approved',
        sms_approved_at: now,
        dispute_window_ends_at: disputeWindowEnds,
        sms_token: null,
      })
      .eq('id', drawRow.id)
      .eq('status', 'sms_pending')
    if (updErr) {
      return jsonResponse(500, { error: 'update_failed', detail: updErr.message })
    }
    return jsonResponse(200, {
      ok: true,
      status: 'approved',
      dispute_window_ends_at: disputeWindowEnds,
    })
  }

  // dispute (terminal v1)
  void now
  const { error: updErr } = await admin
    .from('draw_requests')
    .update({
      status: 'disputed',
      sms_token: null,
    })
    .eq('id', drawRow.id)
    .eq('status', 'sms_pending')
  if (updErr) {
    return jsonResponse(500, { error: 'update_failed', detail: updErr.message })
  }
  return jsonResponse(200, { ok: true, status: 'disputed' })
})
