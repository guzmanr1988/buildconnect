// financing-demo-action Edge Function
//
// DEMO-ONLY — RIP AT GA CLEANUP BEAT.
// Banked: project_buildconnect_financing_demo_controls_pre_launch_only.
// Rod 2026-05-19 11:54Z: demo controls stay "until final release".
// Pre-GA cleanup must:
//   1. delete this entire supabase/functions/financing-demo-action/ dir
//   2. rip the matching data-demo-control buttons from
//      src/features/financing/pages/status.tsx (grep `data-demo-control`)
//   3. de-deploy the function via Mgmt API DELETE /v1/projects/<ref>/functions/financing-demo-action
//
// Two customer-side actions for the homeowner /home/financing/status page:
//
//   action='accept_terms' — advance status approved -> terms_accepted.
//     Required: applicationId. Customer must own the application.
//
//   action='reset' — wipe customer's financing trail so they can re-run the
//     apply flow from /home. DELETEs all financing_applications for the
//     customer + clears customer_financing_profile fields. Customer-scoped.
//
// Defense layers (mirrors admin-create-approval pattern, customer-scoped):
//   1. JWT verify via supabase.auth.getUser(token) — signature fail -> 401
//   2. Customer-owns-application check on accept_terms (homeowner_id = auth.uid)
//   3. feature_flags.enabled === true gate (key='financing_enabled') -> 503 OFF
//   4. Service-role writes (bypass RLS) — RLS on the AS-SHIPPED schema does not
//      grant customer UPDATE on financing_applications nor any write on
//      customer_financing_profile, so direct client writes 403; this Fn is
//      the customer-side write path until GA strips it.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type AcceptTermsBody = { action: 'accept_terms'; applicationId: string }
type ResetBody = { action: 'reset' }
type ActionBody = AcceptTermsBody | ResetBody

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
  const customerId = userResult.user.id

  const { data: flagRow, error: flagErr } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'financing_enabled')
    .maybeSingle()
  if (flagErr) return jsonResponse(500, { error: 'flag_check_failed' })
  if (!flagRow || flagRow.enabled !== true) {
    return jsonResponse(503, { error: 'financing_disabled', flag: 'financing_enabled' })
  }

  let body: ActionBody
  try {
    body = (await req.json()) as ActionBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }

  if (body.action === 'accept_terms') {
    if (typeof body.applicationId !== 'string' || body.applicationId.length === 0) {
      return jsonResponse(400, { error: 'missing_application_id' })
    }
    const { data: appRow, error: appErr } = await admin
      .from('financing_applications')
      .select('id, homeowner_id, status')
      .eq('id', body.applicationId)
      .maybeSingle()
    if (appErr) return jsonResponse(500, { error: 'application_lookup_failed' })
    if (!appRow) return jsonResponse(404, { error: 'application_not_found' })
    if (appRow.homeowner_id !== customerId) {
      return jsonResponse(403, { error: 'not_application_owner' })
    }
    if (appRow.status !== 'approved') {
      return jsonResponse(409, { error: 'application_not_in_approved_state', current_status: appRow.status })
    }
    const { error: updateErr } = await admin
      .from('financing_applications')
      .update({ status: 'terms_accepted' })
      .eq('id', body.applicationId)
    if (updateErr) {
      return jsonResponse(500, { error: 'update_failed', detail: updateErr.message })
    }
    const { error: cfpErr } = await admin
      .from('customer_financing_profile')
      .update({ last_known_status: 'approved' })
      .eq('customer_id', customerId)
    void cfpErr
    return jsonResponse(200, { ok: true, action: 'accept_terms', new_status: 'terms_accepted' })
  }

  if (body.action === 'reset') {
    const { error: delAppsErr } = await admin
      .from('financing_applications')
      .delete()
      .eq('homeowner_id', customerId)
    if (delAppsErr) {
      return jsonResponse(500, { error: 'delete_applications_failed', detail: delAppsErr.message })
    }
    const { error: cfpErr } = await admin
      .from('customer_financing_profile')
      .update({
        has_financing: false,
        last_known_status: null,
        last_known_amount_cents: null,
        approval_partner: null,
        approval_expires_at: null,
      })
      .eq('customer_id', customerId)
    if (cfpErr) {
      return jsonResponse(500, { error: 'cfp_clear_failed', detail: cfpErr.message })
    }
    return jsonResponse(200, { ok: true, action: 'reset' })
  }

  return jsonResponse(400, { error: 'unknown_action' })
})
