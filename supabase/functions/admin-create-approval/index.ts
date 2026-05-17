// admin-create-approval Edge Function
// Phase 1 Admin Financing — task_1779054206392_927
// Wires the /admin/financing manual approval-set surface (spec §Edge-Fn-shape)
// to the AS-SHIPPED financing_core schema (hermes PR #256 + 050 fixup, prod
// 2026-05-17 22:18Z): 32 lenders (15 contractor_pos / 12 personal_loans / 5
// solar_hi_specialty), feature_flags.financing_enabled PK row, audit_log
// service_role-only writer.
//
// Action: create-approval — given (customerEmail, lenderName, envelopeCents,
//   aprBps, termMonths, expiresAt), perform a 3-write sequence:
//     1. financing_applications INSERT (status='approved', service_role)
//     2. financing_approvals    INSERT (approved_cents/apr_bps/term/expires)
//     3. customer_financing_profile UPSERT (last_known_status='approved',
//        last_approved_application_id=app.id) — cfp-precedence per spec
//   then audit_log INSERT with full after_json payload.
//
// Defense layers (mirror admin-reset-password 5-layer pattern):
//   1. JWT verify via supabase.auth.getUser(token) — signature-fail → 401
//   2. profiles.role === 'admin' claim check — non-admin → 401
//   3. Optional ADMIN_EMAIL_ALLOWLIST — second-layer defense
//   4. feature_flags.financing_enabled === true gate — flag-OFF → 503
//   5. Partner validation: lenders.name match WHERE active AND NOT deleted
//   6. Body validation: envelope/apr/term/expires bounds + email shape
//   7. Audit log row BEFORE the privileged write sequence; status updated after
//   8. Errors normalized — never leak Supabase internals to client
//
// Coordination notes:
//   - hermes: set_updated_at_secure() trigger fires on lenders + feature_flags
//     UPDATEs; we don't write either of those tables here
//   - hermes: audit_log has zero write policies — service_role is the only path
//   - WF folded as personal_loans sort_order=5 pending Rod re-categorization;
//     no hardcoded category branches in this Fn (partner validation is name-only)
//   - cfp-precedence: latest approval wins, frozen until new approval or expiry

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_ENVELOPE_CENTS = 5_000_000_00 // $5M ceiling — well above Phase 1 norms
const MIN_ENVELOPE_CENTS = 100_00       // $100 floor — sub-$100 = data entry slip
const MAX_APR_BPS = 5000  // 50% APR ceiling
const MIN_APR_BPS = 0     // 0% promo allowed
const MIN_TERM_MONTHS = 1
const MAX_TERM_MONTHS = 360 // 30y solar loans
const HIGH_VALUE_CONFIRM_CENTS = 50_000_00 // $50k — spec §+ Set Approval gate

type ActionBody = {
  action: 'create-approval'
  customerEmail: string
  lenderName: string
  envelopeCents: number
  aprBps: number
  termMonths: number
  expiresAt: string // ISO-8601
  bcApplicationRef?: string | null
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

function isValidIsoDate(s: string): boolean {
  if (typeof s !== 'string') return false
  const d = new Date(s)
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now()
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
  const adminUser = userResult.user

  // Layer 2 — admin role claim check (single-admin model; no financing_manager)
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', adminUser.id)
    .maybeSingle()
  if (profileErr || !profile || profile.role !== 'admin') {
    return jsonResponse(401, { error: 'forbidden_not_admin' })
  }

  // Layer 3 — optional allowlist (defense-in-depth)
  if (!isAllowlistedEmail(adminUser.email || '')) {
    return jsonResponse(401, { error: 'forbidden_not_allowlisted' })
  }

  // Layer 4 — master flag check (DB-driven, replaces VITE_FINANCING_ENABLED
  // redeploy class — admin can flip live without a CI run)
  const { data: flagRow, error: flagErr } = await admin
    .from('feature_flags')
    .select('value')
    .eq('key', 'financing_enabled')
    .maybeSingle()
  if (flagErr) {
    return jsonResponse(500, { error: 'flag_check_failed' })
  }
  if (!flagRow || flagRow.value !== true) {
    return jsonResponse(503, { error: 'financing_disabled', flag: 'financing_enabled' })
  }

  // Parse + validate body
  let body: ActionBody
  try {
    body = (await req.json()) as ActionBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }
  if (body.action !== 'create-approval') {
    return jsonResponse(400, { error: 'unknown_action' })
  }
  if (!isValidEmail(body.customerEmail || '')) {
    return jsonResponse(400, { error: 'invalid_customer_email' })
  }
  if (typeof body.lenderName !== 'string' || body.lenderName.trim().length === 0) {
    return jsonResponse(400, { error: 'invalid_lender_name' })
  }
  if (
    !Number.isInteger(body.envelopeCents) ||
    body.envelopeCents < MIN_ENVELOPE_CENTS ||
    body.envelopeCents > MAX_ENVELOPE_CENTS
  ) {
    return jsonResponse(400, { error: 'invalid_envelope_cents', min: MIN_ENVELOPE_CENTS, max: MAX_ENVELOPE_CENTS })
  }
  if (
    !Number.isInteger(body.aprBps) ||
    body.aprBps < MIN_APR_BPS ||
    body.aprBps > MAX_APR_BPS
  ) {
    return jsonResponse(400, { error: 'invalid_apr_bps', min: MIN_APR_BPS, max: MAX_APR_BPS })
  }
  if (
    !Number.isInteger(body.termMonths) ||
    body.termMonths < MIN_TERM_MONTHS ||
    body.termMonths > MAX_TERM_MONTHS
  ) {
    return jsonResponse(400, { error: 'invalid_term_months', min: MIN_TERM_MONTHS, max: MAX_TERM_MONTHS })
  }
  if (!isValidIsoDate(body.expiresAt)) {
    return jsonResponse(400, { error: 'invalid_expires_at_must_be_future_iso' })
  }

  // Layer 5 — partner validation against AS-SHIPPED lenders
  // (lower(name) match per unique index; no category-branch hardcoding because
  // WF re-categorization is pending Rod post-launch admin action)
  const { data: lenderRow, error: lenderErr } = await admin
    .from('lenders')
    .select('id, name, category, active, deleted_at')
    .ilike('name', body.lenderName.trim())
    .is('deleted_at', null)
    .eq('active', true)
    .maybeSingle()
  if (lenderErr) {
    return jsonResponse(500, { error: 'lender_lookup_failed' })
  }
  if (!lenderRow) {
    return jsonResponse(404, { error: 'lender_not_found_or_inactive', lender: body.lenderName })
  }

  // Resolve target customer
  const { data: customerRow } = await admin
    .from('profiles')
    .select('id')
    .eq('email', body.customerEmail)
    .maybeSingle()
  if (!customerRow?.id) {
    return jsonResponse(404, { error: 'customer_not_found' })
  }
  const customerId: string = customerRow.id

  const ip = getClientIp(req)
  const userAgent = req.headers.get('user-agent')
  const highValue = body.envelopeCents >= HIGH_VALUE_CONFIRM_CENTS

  // Audit log row BEFORE the privileged sequence (spec §audit-log).
  // Holds before_json (null — new approval) + intended after_json + status='pending'.
  // We update the audit row to 'success'/'error' after the writes resolve so
  // the row is always present regardless of where the sequence fails.
  const intendedAfter = {
    customer_id: customerId,
    customer_email: body.customerEmail,
    lender_id: lenderRow.id,
    lender_name: lenderRow.name,
    lender_category: lenderRow.category,
    envelope_cents: body.envelopeCents,
    apr_bps: body.aprBps,
    term_months: body.termMonths,
    expires_at: body.expiresAt,
    bc_application_ref: body.bcApplicationRef ?? null,
    high_value: highValue,
  }

  const { data: auditRow, error: auditInsertErr } = await admin
    .from('audit_log')
    .insert({
      actor_id: adminUser.id,
      actor_email: adminUser.email ?? '',
      action: 'admin_create_approval',
      target_table: 'financing_approvals',
      target_id: null,
      before_json: null,
      after_json: intendedAfter,
      status: 'pending',
      ip,
      user_agent: userAgent,
    })
    .select('id')
    .single()
  if (auditInsertErr || !auditRow) {
    return jsonResponse(500, { error: 'audit_log_write_failed' })
  }
  const auditId: string = auditRow.id

  async function failAudit(reason: string, detail?: string): Promise<Response> {
    await admin
      .from('audit_log')
      .update({ status: 'error', error_reason: reason, error_detail: detail ?? null })
      .eq('id', auditId)
    return jsonResponse(500, { error: reason, audit_id: auditId, detail: detail ?? null })
  }

  // Write 1 — financing_applications (admin-created on customer's behalf;
  // service_role bypasses RLS for the customer-id INSERT)
  const { data: appRow, error: appInsertErr } = await admin
    .from('financing_applications')
    .insert({
      customer_id: customerId,
      lender_id: lenderRow.id,
      status: 'approved',
      created_via: 'admin_manual',
      created_by_admin_id: adminUser.id,
    })
    .select('id')
    .single()
  if (appInsertErr || !appRow) {
    return failAudit('financing_applications_insert_failed', appInsertErr?.message)
  }
  const appId: string = appRow.id

  // Write 2 — financing_approvals (envelope/APR/term/expires; service_role-only
  // writeable per spec §RLS / hermes-confirmed pg_policies)
  const { data: apprRow, error: apprInsertErr } = await admin
    .from('financing_approvals')
    .insert({
      application_id: appId,
      lender_id: lenderRow.id,
      approved_cents: body.envelopeCents,
      apr_bps: body.aprBps,
      term_months: body.termMonths,
      expires_at: body.expiresAt,
      issued_by_admin_id: adminUser.id,
      source: 'admin_manual',
    })
    .select('id')
    .single()
  if (apprInsertErr || !apprRow) {
    // Manual rollback — drop the orphan application (audit_log keeps the trail)
    await admin.from('financing_applications').delete().eq('id', appId)
    return failAudit('financing_approvals_insert_failed', apprInsertErr?.message)
  }
  const apprId: string = apprRow.id

  // Write 3 — customer_financing_profile UPSERT (cfp-precedence: latest
  // approval wins; frozen until next approval or expiry per spec §cfp-precedence)
  const { error: cfpErr } = await admin
    .from('customer_financing_profile')
    .upsert(
      {
        customer_id: customerId,
        last_known_status: 'approved',
        last_approved_application_id: appId,
        last_approved_approval_id: apprId,
        last_approved_at: new Date().toISOString(),
      },
      { onConflict: 'customer_id' },
    )
  if (cfpErr) {
    // cfp failure leaves application+approval banked but cfp stale — admin
    // can re-fire safely (cfp-precedence will rewrite). Surface but don't
    // unwind the prior writes; the approval IS legitimate.
    await admin
      .from('audit_log')
      .update({
        status: 'partial_success',
        target_id: apprId,
        error_reason: 'cfp_upsert_failed',
        error_detail: cfpErr.message,
      })
      .eq('id', auditId)
    return jsonResponse(207, {
      ok: false,
      partial: true,
      application_id: appId,
      approval_id: apprId,
      audit_id: auditId,
      warning: 'cfp_upsert_failed_approval_banked',
      detail: cfpErr.message,
    })
  }

  // All three writes landed — close out the audit row
  await admin
    .from('audit_log')
    .update({ status: 'success', target_id: apprId })
    .eq('id', auditId)

  return jsonResponse(200, {
    ok: true,
    action: 'create-approval',
    application_id: appId,
    approval_id: apprId,
    audit_id: auditId,
    high_value: highValue,
  })
})
