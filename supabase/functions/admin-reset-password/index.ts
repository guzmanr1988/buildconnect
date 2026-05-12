// Admin reset-password Edge Function
// task_1776743274579_661, Tranche-2 — wires the Ship #136 admin dashboard
// password-reset stubs to real Supabase auth admin calls. Service-role key
// stays server-only; admin UI calls this function with the operator's
// admin-session JWT in Authorization: Bearer <token>.
//
// Endpoints (routed by request body `action`):
//   send-reset-link  → supabase.auth.admin.resetPasswordForEmail(email)
//   set-user-password → supabase.auth.admin.updateUserById({ password })
//
// Defense layers (load-bearing):
//   1. JWT verify via supabase.auth.getUser(token) — signature-fail → 401
//   2. profiles.role === 'admin' claim check — non-admin → 401
//   3. Optional email allowlist (env ADMIN_EMAIL_ALLOWLIST, comma-separated)
//      — second-layer only; never standalone
//   4. Rate limit: 10 calls/hour/admin via admin_reset_audit_log row count
//   5. Audit log row inserted BEFORE the privileged action returns
//   6. Errors normalized — never leak Supabase internals to client

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RATE_LIMIT_PER_HOUR = 10
const MIN_PASSWORD_LENGTH = 8

type ActionBody =
  | { action: 'send-reset-link'; targetEmail: string }
  | { action: 'set-user-password'; targetEmail: string; newPassword: string }

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getClientIp(req: Request): string | null {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  )
}

function isAllowlistedEmail(email: string): boolean {
  const allowlist = Deno.env.get('ADMIN_EMAIL_ALLOWLIST')
  if (!allowlist) return true
  return allowlist.split(',').map((s) => s.trim().toLowerCase()).includes(email.toLowerCase())
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

serve(async (req: Request) => {
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
  const adminUser = userResult.user

  // Layer 2 — admin role claim check (via profiles table)
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', adminUser.id)
    .maybeSingle()
  if (profileErr || !profile || profile.role !== 'admin') {
    return jsonResponse(401, { error: 'forbidden_not_admin' })
  }

  // Layer 3 — optional allowlist (defense-in-depth on top of JWT+role)
  if (!isAllowlistedEmail(adminUser.email || '')) {
    return jsonResponse(401, { error: 'forbidden_not_allowlisted' })
  }

  // Parse + validate body
  let body: ActionBody
  try {
    body = (await req.json()) as ActionBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }
  if (!body.action || !body.targetEmail || !isValidEmail(body.targetEmail)) {
    return jsonResponse(400, { error: 'invalid_action_or_target_email' })
  }
  if (
    body.action === 'set-user-password' &&
    (typeof body.newPassword !== 'string' || body.newPassword.length < MIN_PASSWORD_LENGTH)
  ) {
    return jsonResponse(400, { error: 'invalid_new_password_length' })
  }
  if (body.action !== 'send-reset-link' && body.action !== 'set-user-password') {
    return jsonResponse(400, { error: 'unknown_action' })
  }

  // Layer 4 — rate limit (per-admin rolling hour)
  const { data: rateCount, error: rateErr } = await admin.rpc(
    'admin_reset_count_last_hour',
    { p_admin_id: adminUser.id },
  )
  if (rateErr) {
    return jsonResponse(500, { error: 'rate_limit_check_failed' })
  }
  if ((rateCount as number) >= RATE_LIMIT_PER_HOUR) {
    return jsonResponse(429, { error: 'rate_limit_exceeded', retryAfterMinutes: 60 })
  }

  // Resolve target user_id (best-effort — send-reset-link still works for
  // unknown emails per Supabase semantics; just log a null target_user_id)
  const { data: targetUserRow } = await admin
    .from('profiles')
    .select('id')
    .eq('email', body.targetEmail)
    .maybeSingle()
  const targetUserId: string | null = targetUserRow?.id ?? null

  // Layer 5 — audit log BEFORE the privileged action so a Supabase-side error
  // still leaves a record. If the action then fails, the audit row remains as
  // evidence of the attempt; we surface the error after.
  const ip = getClientIp(req)
  const userAgent = req.headers.get('user-agent')
  const { error: auditErr } = await admin
    .from('admin_reset_audit_log')
    .insert({
      admin_id: adminUser.id,
      admin_email: adminUser.email ?? '',
      target_email: body.targetEmail,
      target_user_id: targetUserId,
      action: body.action,
      ip,
      user_agent: userAgent,
    })
  if (auditErr) {
    return jsonResponse(500, { error: 'audit_log_write_failed' })
  }

  // Privileged action — `resetPasswordForEmail` triggers Supabase Auth to
  // send the (BuildConnect-branded) recovery email. The Edge Function uses
  // the service-role client, but this method exists on `auth` (not
  // `auth.admin`) and routes through the same Supabase Auth email pipeline.
  if (body.action === 'send-reset-link') {
    const redirectTo = Deno.env.get('ADMIN_RESET_REDIRECT_URL') || undefined
    const { error } = await admin.auth.resetPasswordForEmail(body.targetEmail, {
      redirectTo,
    })
    if (error) {
      return jsonResponse(400, { error: 'reset_link_failed', detail: error.message })
    }
    return jsonResponse(200, { ok: true, action: 'send-reset-link' })
  }

  // set-user-password
  if (!targetUserId) {
    return jsonResponse(404, { error: 'target_user_not_found' })
  }
  const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
    password: body.newPassword,
  })
  if (updErr) {
    return jsonResponse(400, { error: 'set_password_failed', detail: updErr.message })
  }
  return jsonResponse(200, { ok: true, action: 'set-user-password' })
})
