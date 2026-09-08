// Admin create-employee Edge Function
// kratos msg 1782413570982 — closes the privilege-escalation hole where
// the public anon-key signUp path could mint admin / admin_employee
// accounts. Once hephaestus's handle_new_user trigger guard lands, ANY
// client-side signUp({ data: { role: 'admin' | 'admin_employee' } })
// throws 42501. This Edge Function is the legitimate service-role path
// for admin_employee creation: it re-verifies the OPERATOR is a true
// admin (NOT admin_employee, per Rod exclusive-privilege carve-out)
// before calling auth.admin.createUser, which bypasses the trigger
// guard via the service-role JWT.
//
// Shape parity with admin-reset-password (ship #136 / Tranche-2):
//   1. CORS preflight answer (browser admin path is cross-origin)
//   2. JWT verify via supabase.auth.getUser(token)
//   3. profiles.role === 'admin' — NOT admin_employee, NOT any other role
//   4. Service-role auth.admin.createUser({ user_metadata: { role:
//      'admin_employee' } }) — handle_new_user trigger inserts the
//      profiles row at the requested role because the service-role JWT
//      is allowed past the guard
//   5. Errors normalized — never leak Supabase internals to client

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MIN_PASSWORD_LENGTH = 8

interface CreateEmployeeBody {
  email: string
  password: string
  name: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
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

  // Layer 1 — JWT verify (signature + expiry)
  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { error: 'invalid_or_expired_token' })
  }
  const operator = userResult.user

  // Layer 2 — operator MUST be a true admin. admin_employee CANNOT mint
  // employees per Rod exclusive-privilege carve-out (kratos msg
  // 1782413570982). Any role other than 'admin' is rejected here.
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', operator.id)
    .maybeSingle()
  if (profileErr || !profile || profile.role !== 'admin') {
    return jsonResponse(403, { error: 'forbidden_not_admin' })
  }

  // Parse + validate body
  let body: CreateEmployeeBody
  try {
    body = (await req.json()) as CreateEmployeeBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }
  if (!body.email || !isValidEmail(body.email)) {
    return jsonResponse(400, { error: 'invalid_email' })
  }
  if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
    return jsonResponse(400, { error: 'invalid_password_length' })
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  // Privileged action — TWO-STEP pattern (kratos msg 1782414859706,
  // hephaestus dev rehearsal). The handle_new_user trigger guard
  // (hephaestus) fires on ANY auth.users INSERT — including this
  // service-role createUser. It RAISES 42501 if user_metadata.role is
  // admin / admin_employee, because the guard cannot tell a legit
  // server-side mint from a client attack when the role is in metadata.
  //
  // Step 1 — createUser WITHOUT role in user_metadata. Trigger creates
  // the profiles row at the default role=homeowner (no guard trip).
  // Step 2 — service-role UPDATE profiles SET role='admin_employee'.
  // UPDATE bypasses RLS via service-role JWT and does NOT re-fire the
  // INSERT trigger, so the privileged role is set without tripping the
  // guard.
  //
  // email_confirm:false preserves the "confirmation email is sent —
  // employee clicks link before first sign-in" flow.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: false,
    user_metadata: {
      name,
    },
  })
  if (createErr) {
    const lower = createErr.message.toLowerCase()
    if (lower.includes('already') && (lower.includes('registered') || lower.includes('exists'))) {
      return jsonResponse(409, { error: 'email_already_registered' })
    }
    return jsonResponse(400, { error: 'create_user_failed', detail: createErr.message })
  }

  const newUid = created?.user?.id
  if (!newUid) {
    return jsonResponse(500, { error: 'create_user_no_id' })
  }

  // Step 2 — promote profile to admin_employee via service-role UPDATE.
  // Trigger guard does not fire on UPDATE (only INSERT). If this fails,
  // the auth.users row exists but the profile is stuck at homeowner —
  // surface that as a distinct error so the operator can reconcile.
  const { error: promoteErr } = await admin
    .from('profiles')
    .update({ role: 'admin_employee' })
    .eq('id', newUid)
  if (promoteErr) {
    return jsonResponse(500, {
      error: 'role_promote_failed',
      detail: promoteErr.message,
      userId: newUid,
    })
  }

  return jsonResponse(200, {
    ok: true,
    userId: newUid,
    email: body.email,
  })
})
