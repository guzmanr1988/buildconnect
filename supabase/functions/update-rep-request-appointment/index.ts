// update-rep-request-appointment Edge Function
// Intake Phase 2 — admin/admin_employee accept-or-reschedule path.
//
// Rod-directive (via kratos msg 1782433470070): after homeowner picks an
// exact date+time at intake (status='new', appointment_status='proposed'),
// admin OR admin_employee either ACCEPTS the date or RESCHEDULES with a note.
//
// PARITY: admin === admin_employee enforced via profiles.role check in this
// fn (mirrors rep_requests_admin_update RLS: profiles.role = ANY (ARRAY[
// 'admin','admin_employee']); the policy is permissive but we belt-and-suspenders
// the same check here for clarity and to write the event_type/actor_role
// faithfully).
//
// REQUEST:
//   POST {
//     rep_request_id: uuid,
//     action: 'accept' | 'reschedule',
//     proposed_visit_at?: string (ISO 8601 datetime; required if action=reschedule),
//     reschedule_notes?: string (optional free-text shown to homeowner)
//   }
//
// SEMANTICS:
//   action='accept':
//     - appointment_status='accepted'
//     - status: 'new' → 'scheduled' (lifecycle advance)
//     - scheduled_at = requested_visit_at (the homeowner's picked datetime)
//     - rep_request_events: event_type='scheduled', payload={appointment_status,
//       scheduled_at, actor_role}
//   action='reschedule':
//     - appointment_status='rescheduled'
//     - proposed_visit_at = body.proposed_visit_at
//     - reschedule_notes = body.reschedule_notes ?? null
//     - status: UNCHANGED (stays 'new' — homeowner can confirm reschedule
//       separately, or admin can later 'accept' against the proposed slot)
//     - rep_request_events: event_type='note_added' with payload={
//       prior_requested_visit_at, proposed_visit_at, notes, actor_role}
//
// RESPONSE (200):
//   { ok: true, rep_request_id, appointment_status, status, requested_visit_at,
//     proposed_visit_at, reschedule_notes }
//
// ERRORS (400/401/403/404/500):
//   { ok: false, code, error }
//   missing_bearer_token | invalid_or_expired_token | forbidden_role |
//   invalid_json_body | invalid_action | invalid_proposed_visit_at |
//   rep_request_not_found | rep_request_not_eligible | update_failed

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

type AppointmentAction = 'accept' | 'reschedule'
type Body = {
  rep_request_id: string
  action: AppointmentAction
  proposed_visit_at?: string
  reschedule_notes?: string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, code: 'method_not_allowed', error: 'POST only' })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) {
    return jsonResponse(401, { ok: false, code: 'missing_bearer_token', error: 'Authorization Bearer required' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { ok: false, code: 'invalid_or_expired_token', error: 'JWT verify failed' })
  }
  const caller = userResult.user

  const { data: callerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', caller.id)
    .maybeSingle()
  if (profileErr) {
    return jsonResponse(500, { ok: false, code: 'profile_lookup_failed', error: profileErr.message })
  }
  if (!callerProfile || (callerProfile.role !== 'admin' && callerProfile.role !== 'admin_employee')) {
    return jsonResponse(403, { ok: false, code: 'forbidden_role', error: 'admin or admin_employee only' })
  }
  const actorRole = callerProfile.role as 'admin' | 'admin_employee'

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return jsonResponse(400, { ok: false, code: 'invalid_json_body', error: 'Body must be valid JSON' })
  }
  if (typeof body.rep_request_id !== 'string' || body.rep_request_id.length < 8) {
    return jsonResponse(400, { ok: false, code: 'invalid_rep_request_id', error: 'rep_request_id required' })
  }
  if (body.action !== 'accept' && body.action !== 'reschedule') {
    return jsonResponse(400, { ok: false, code: 'invalid_action', error: "action must be 'accept' or 'reschedule'" })
  }
  let proposedAt: Date | null = null
  if (body.action === 'reschedule') {
    if (typeof body.proposed_visit_at !== 'string') {
      return jsonResponse(400, {
        ok: false,
        code: 'invalid_proposed_visit_at',
        error: 'proposed_visit_at (ISO datetime) required when action=reschedule',
      })
    }
    const parsed = new Date(body.proposed_visit_at)
    if (Number.isNaN(parsed.getTime())) {
      return jsonResponse(400, { ok: false, code: 'invalid_proposed_visit_at', error: 'proposed_visit_at not a valid ISO datetime' })
    }
    if (parsed.getTime() <= Date.now()) {
      return jsonResponse(400, { ok: false, code: 'invalid_proposed_visit_at', error: 'proposed_visit_at must be in the future' })
    }
    proposedAt = parsed
  }

  const { data: existing, error: lookupErr } = await admin
    .from('rep_requests')
    .select('id, status, appointment_status, requested_visit_at')
    .eq('id', body.rep_request_id)
    .maybeSingle()
  if (lookupErr) {
    return jsonResponse(500, { ok: false, code: 'rep_request_lookup_failed', error: lookupErr.message })
  }
  if (!existing) {
    return jsonResponse(404, { ok: false, code: 'rep_request_not_found', error: 'No rep_request with that id' })
  }
  if (existing.status !== 'new') {
    return jsonResponse(400, {
      ok: false,
      code: 'rep_request_not_eligible',
      error: `status=${existing.status} — appointment changes allowed only while status=new`,
    })
  }

  if (body.action === 'accept') {
    if (!existing.requested_visit_at) {
      return jsonResponse(400, {
        ok: false,
        code: 'rep_request_not_eligible',
        error: 'requested_visit_at is null on this row — homeowner has not yet picked a datetime',
      })
    }
    const scheduledAt = new Date(existing.requested_visit_at).toISOString()
    const { error: updErr } = await admin
      .from('rep_requests')
      .update({
        appointment_status: 'accepted',
        status: 'scheduled',
        scheduled_at: scheduledAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (updErr) {
      return jsonResponse(500, { ok: false, code: 'update_failed', error: updErr.message })
    }
    await admin.from('rep_request_events').insert({
      rep_request_id: existing.id,
      actor_id: caller.id,
      actor_role: actorRole,
      event_type: 'scheduled',
      from_status: 'new',
      to_status: 'scheduled',
      payload: { appointment_status: 'accepted', scheduled_at: scheduledAt },
    })
    return jsonResponse(200, {
      ok: true,
      rep_request_id: existing.id,
      appointment_status: 'accepted',
      status: 'scheduled',
      requested_visit_at: existing.requested_visit_at,
      scheduled_at: scheduledAt,
    })
  }

  // action='reschedule'
  const proposedIso = proposedAt!.toISOString()
  const { error: updErr } = await admin
    .from('rep_requests')
    .update({
      appointment_status: 'rescheduled',
      proposed_visit_at: proposedIso,
      reschedule_notes: body.reschedule_notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
  if (updErr) {
    return jsonResponse(500, { ok: false, code: 'update_failed', error: updErr.message })
  }
  await admin.from('rep_request_events').insert({
    rep_request_id: existing.id,
    actor_id: caller.id,
    actor_role: actorRole,
    event_type: 'note_added',
    payload: {
      kind: 'appointment_rescheduled',
      prior_requested_visit_at: existing.requested_visit_at,
      proposed_visit_at: proposedIso,
      reschedule_notes: body.reschedule_notes ?? null,
    },
  })
  return jsonResponse(200, {
    ok: true,
    rep_request_id: existing.id,
    appointment_status: 'rescheduled',
    status: existing.status,
    requested_visit_at: existing.requested_visit_at,
    proposed_visit_at: proposedIso,
    reschedule_notes: body.reschedule_notes ?? null,
  })
})
