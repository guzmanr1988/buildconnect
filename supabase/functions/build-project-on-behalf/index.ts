// build-project-on-behalf edge fn — rep/admin builds a homeowner-owned
// project from a rep_request scope. Privileged because it INSERTs a
// projects row owned by the rep_request.homeowner_id (a different user)
// and a project_items row keyed to it — RLS-direct UPDATE cannot
// express this cross-table privileged write.
//
// FLOW:
//   1. Authenticate the caller; load their role + id.
//   2. Validate payload: rep_request_id, service_id, scope, optional
//      estimated_amount_cents, optional notes.
//   3. Authorize: caller MUST be (a) the assigned_rep_id on the
//      rep_request, OR (b) role IN ('admin','admin_employee').
//      Other roles (homeowner, vendor, rep-but-not-assigned) → 403.
//   4. Status precondition: rep_request.status MUST be 'visited' —
//      project-on-behalf is the build step BETWEEN visited and
//      project_ready. Other statuses → 409.
//   5. Service-role INSERT INTO projects (homeowner_id from the
//      rep_request, title=scope, status='draft', notes).
//   6. Service-role INSERT INTO project_items (project_id, service_id,
//      service_name=service_id title-cased, selections=jsonb, notes).
//   7. APPEND event_type=project_built (rep_request_id, actor_id,
//      actor_role, payload={project_id, service_id, scope,
//      estimated_amount_cents}).
//   8. Return { ok: true, project_id }.
//
// The FE's markProjectReady fn is called separately AFTER this — it
// flips rep_request.status visited → project_ready and stamps
// project_id on the rep_request row. Splitting the two steps lets the
// rep review the built project before flipping the rep_request status.
//
// IDEMPOTENCY: re-running this fn for the same rep_request_id would
// create a SECOND draft project — not desirable. Guard at the FE
// level (button disabled if any project_id is already attached); at
// the DB level the markProjectReady fn enforces single-project per
// rep_request via UNIQUE(rep_request_id) on its update path. This fn
// does NOT enforce idempotency on its own.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS } from '../_shared/rep-request/index.ts'

interface BuildPayload {
  rep_request_id: string
  service_id: string
  scope: string
  estimated_amount_cents?: number | null
  notes?: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const callerId = userData.user.id

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', callerId)
    .maybeSingle()
  if (!callerProfile) {
    return new Response(JSON.stringify({ error: 'profile_not_found' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const callerRole = callerProfile.role as string

  let payload: BuildPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  if (
    !payload?.rep_request_id ||
    !payload?.service_id ||
    !payload?.scope
  ) {
    return new Response(
      JSON.stringify({ error: 'missing_fields', required: ['rep_request_id', 'service_id', 'scope'] }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  const { data: rr, error: rrErr } = await admin
    .from('rep_requests')
    .select('id, homeowner_id, assigned_rep_id, status')
    .eq('id', payload.rep_request_id)
    .maybeSingle()
  if (rrErr || !rr) {
    return new Response(JSON.stringify({ error: 'rep_request_not_found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const isAdmin = callerRole === 'admin' || callerRole === 'admin_employee'
  const isAssignedRep = callerRole === 'rep' && rr.assigned_rep_id === callerId
  if (!isAdmin && !isAssignedRep) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  if (rr.status !== 'visited') {
    return new Response(
      JSON.stringify({
        error: 'invalid_status',
        message: 'build-project-on-behalf requires rep_request.status=visited',
        current_status: rr.status,
      }),
      {
        status: 409,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  const { data: project, error: projErr } = await admin
    .from('projects')
    .insert({
      homeowner_id: rr.homeowner_id,
      title: payload.scope,
      status: 'draft',
      notes: payload.notes ?? null,
    })
    .select('id')
    .single()
  if (projErr || !project) {
    return new Response(
      JSON.stringify({ error: 'project_insert_failed', detail: projErr?.message }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  const { error: itemErr } = await admin.from('project_items').insert({
    project_id: project.id,
    service_id: payload.service_id,
    service_name: payload.service_id,
    selections: {
      scope: payload.scope,
      estimated_amount_cents: payload.estimated_amount_cents ?? null,
      built_by_rep: callerId,
      built_from_rep_request: payload.rep_request_id,
    },
    notes: payload.notes ?? null,
  })
  if (itemErr) {
    return new Response(
      JSON.stringify({
        error: 'project_item_insert_failed',
        detail: itemErr.message,
        project_id: project.id,
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  await admin.from('rep_request_events').insert({
    rep_request_id: payload.rep_request_id,
    event_type: 'project_built',
    actor_id: callerId,
    actor_role: callerRole,
    payload: {
      project_id: project.id,
      service_id: payload.service_id,
      scope: payload.scope,
      estimated_amount_cents: payload.estimated_amount_cents ?? null,
    },
  })

  return new Response(
    JSON.stringify({ ok: true, project_id: project.id }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    },
  )
})
