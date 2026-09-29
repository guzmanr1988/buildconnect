// add-rep-request-note Edge Function
//
// Admin-only append-only note attach to a rep_request. Notes land as
// rep_request_events rows with event_type='note_added' — the same append-only
// log the rep-request flow already uses for state transitions. The append-only
// trigger on rep_request_events denies UPDATE/DELETE, so notes are immutable
// history by construction (no separate mig needed).
//
// REQUEST: POST { rep_request_id: uuid, note: string (1..2000 chars) }
//
// RESPONSE 200: {
//   ok: true,
//   note: {
//     id, rep_request_id, actor_id, actor_role, event_type, note, created_at
//   }
// }
//
// ROLE GATE: admin or admin_employee only. Other authenticated callers 403.
//
// IDEMPOTENCY: not enforced — sending the same note twice creates two events.
// This matches Rod's "log to know what is going on" framing: a log records
// every entry, even repeats. UI surfaces the timestamp; humans can de-dupe.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { secretKey } from '../_shared/keys.ts'

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

Deno.serve(async (req: Request) => {
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
  const serviceRoleKey = secretKey()
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { ok: false, code: 'invalid_or_expired_token', error: 'JWT verify failed' })
  }
  const caller = userResult.user

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle()
  if (profileErr) {
    return jsonResponse(500, { ok: false, code: 'profile_lookup_failed', error: profileErr.message })
  }
  if (!profile || (profile.role !== 'admin' && profile.role !== 'admin_employee')) {
    return jsonResponse(403, { ok: false, code: 'forbidden_role', error: 'admin or admin_employee required' })
  }

  let body: { rep_request_id?: string; note?: string }
  try { body = await req.json() } catch {
    return jsonResponse(400, { ok: false, code: 'invalid_json_body', error: 'Body must be valid JSON' })
  }
  if (typeof body.rep_request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.rep_request_id)) {
    return jsonResponse(400, { ok: false, code: 'invalid_rep_request_id', error: 'rep_request_id must be a UUID' })
  }
  const noteText = typeof body.note === 'string' ? body.note.trim() : ''
  if (noteText.length < 1 || noteText.length > 2000) {
    return jsonResponse(400, { ok: false, code: 'invalid_note', error: 'note must be 1..2000 chars after trim' })
  }

  const { data: repRequest, error: repLookupErr } = await admin
    .from('rep_requests')
    .select('id')
    .eq('id', body.rep_request_id)
    .maybeSingle()
  if (repLookupErr) {
    return jsonResponse(500, { ok: false, code: 'rep_request_lookup_failed', error: repLookupErr.message })
  }
  if (!repRequest) {
    return jsonResponse(404, { ok: false, code: 'rep_request_not_found', error: 'No rep_request with that id' })
  }

  const { data: inserted, error: insertErr } = await admin
    .from('rep_request_events')
    .insert({
      rep_request_id: body.rep_request_id,
      actor_id: caller.id,
      actor_role: profile.role,
      event_type: 'note_added',
      note: noteText,
      payload: {},
    })
    .select('id, rep_request_id, actor_id, actor_role, event_type, note, created_at')
    .single()

  if (insertErr) {
    return jsonResponse(500, { ok: false, code: 'event_insert_failed', error: insertErr.message })
  }

  return jsonResponse(200, { ok: true, note: inserted })
})
