// admin-create-approval Edge Function
// Phase 1 Admin Financing — task_1779054206392_927
// Wires the /admin/financing manual approval-set surface to the AS-SHIPPED
// financing_core + admin_financing_surface schema:
//   - migration 047_financing_core_tables.sql (financing_applications,
//     financing_approvals, customer_financing_profile, commission_ledger)
//   - migration 048_admin_financing_surface.sql (lenders, feature_flags, audit_log)
//   - migration 049 + 050 (lenders seed: 32 rows AS-SHIPPED)
//
// Action: create-approval — given (customerEmail, lenderName, envelopeCents,
//   aprBps, termMonths, expiresAt), perform a 3-write sequence:
//     1. financing_applications INSERT (status='approved', adapter='admin_manual')
//     2. financing_approvals    INSERT (status='approved', envelope_amount_cents,
//        apr_bps, term_months, expires_at)
//     3. customer_financing_profile UPSERT (has_financing=true, source='adapter',
//        approval_partner=lender.name, last_known_status='approved',
//        last_known_amount_cents=envelope, approval_expires_at=expiresAt)
//   Audit row written post-action with full outcome captured in notes/after_json.
//
// Defense layers (mirror admin-reset-password 5-layer canonical pattern):
//   1. JWT verify via supabase.auth.getUser(token) — signature-fail → 401
//   2. profiles.role === 'admin' claim check (single-admin model)
//   3. Optional ADMIN_EMAIL_ALLOWLIST — second-layer defense
//   4. feature_flags.enabled === true gate (key='financing_enabled') → 503 on OFF
//   5. Partner validation: lenders.name ilike + active + deleted_at IS NULL
//      (name-only — placement-transparent to WF AS-SHIPPED in personal_loans sort=5)
//   6. Body validation: envelope/apr/term/expires bounds + email shape
//   7. Audit row written AFTER action settles (success or post-rollback);
//      AS-SHIPPED audit_log lacks pending-lifecycle columns so we capture
//      outcome shape in notes/after_json instead
//   8. Full rollback on any write failure per spec L244 (FK-ordered:
//      approvals → applications); errors normalized
//
// Coordination notes (post hermes + hephaestus sibling-axis source-read +
// kratos plan-change msg 1779056062285 locked-in via 1779056185880):
//   - audit_log.action = 'admin_create_approval' per hermes 051 enum-widen
//     (queryable/indexable filter axis beats notes-text retrofit cost long-term;
//     matches future-employee admin filter UX). Migration 051 adds the value
//     via ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'admin_create_approval'.
//   - audit_log.target_id is TEXT (not UUID)
//   - service_role bypasses RLS, so fa_insert_homeowner_own status='applied'
//     constraint does not apply — we insert status='approved' directly
//   - financing_applications.adapter is NOT NULL with no default — must supply
//     ('admin_manual' marks the manual-set provenance)
//   - financing_approvals.status enum is {approved, denied}; must supply explicit
//     (no DEFAULT — defaults on enum status fields drift downstream behaviors
//      per hermes axis verdict)
//   - customer_financing_profile.source enum is {self_attest, adapter};
//     admin manual creation uses 'adapter' per hermes msg 1779055610342
//   - Rollback DELETEs themselves wrapped via safeRollbackDelete() —
//     rollback_failure_<table> keys captured in audit after_json on partial leak

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_ENVELOPE_CENTS = 5_000_000_00 // $5M ceiling
const MIN_ENVELOPE_CENTS = 100_00       // $100 floor
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

function isValidFutureIsoDate(s: string): boolean {
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

  // Layer 4 — master flag check (DB-driven; column is `enabled` per migration 048)
  const { data: flagRow, error: flagErr } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'financing_enabled')
    .maybeSingle()
  if (flagErr) {
    return jsonResponse(500, { error: 'flag_check_failed' })
  }
  if (!flagRow || flagRow.enabled !== true) {
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
  if (!isValidFutureIsoDate(body.expiresAt)) {
    return jsonResponse(400, { error: 'invalid_expires_at_must_be_future_iso' })
  }

  // Layer 5 — partner validation against AS-SHIPPED lenders (name-only ilike
  // per unique index lower(name); no category branches because WF placement
  // in personal_loans is LOCKED AS-SHIPPED per kratos rescind 22:23Z)
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

  // Build audit context (written post-action with outcome captured in notes/after_json).
  // AS-SHIPPED audit_log columns: id, ts, actor_id, actor_role, action (enum:
  // insert|update|delete|toggle|login|export), target_table, target_id (text),
  // before_json, after_json, notes. No status / ip / user_agent / actor_email
  // columns — those ride in notes JSON payload.
  const auditCtx = {
    actor_email: adminUser.email ?? null,
    ip,
    user_agent: userAgent,
    high_value: highValue,
    lender_name: lenderRow.name,
    lender_category: lenderRow.category,
    customer_email: body.customerEmail,
    envelope_cents: body.envelopeCents,
    apr_bps: body.aprBps,
    term_months: body.termMonths,
    expires_at: body.expiresAt,
    bc_application_ref: body.bcApplicationRef ?? null,
  }

  async function writeAuditOutcome(
    outcome: 'success' | 'rollback',
    targetId: string | null,
    afterJson: Record<string, unknown>,
    errorReason?: string,
    errorDetail?: string,
  ): Promise<void> {
    const notes = JSON.stringify({
      ...auditCtx,
      outcome,
      ...(errorReason ? { error_reason: errorReason, error_detail: errorDetail ?? null } : {}),
    })
    await admin.from('audit_log').insert({
      actor_id: adminUser.id,
      actor_role: 'admin',
      action: 'admin_create_approval',
      target_table: 'financing_approvals',
      target_id: targetId,
      before_json: null,
      after_json: afterJson,
      notes,
    })
  }

  // Rollback DELETEs themselves can fail (FK race, RLS surprise, network). Per
  // kratos plan-change msg 1779056062285 / lock-in 1779056185880 (hermes axis
  // verdict): wrap each rollback DELETE in error-capture so partial-state leak
  // is at minimum auditable. Failed-rollback shows up as rollback_failure_<table>
  // keys in the audit row's after_json.
  async function safeRollbackDelete(table: string, id: string): Promise<string | null> {
    const { error } = await admin.from(table).delete().eq('id', id)
    return error ? error.message : null
  }

  // Write 1 — financing_applications (admin-created on customer's behalf via
  // service_role; status='approved' direct-set; adapter='admin_manual' marks
  // the manual provenance per spec §audit-log)
  const { data: appRow, error: appInsertErr } = await admin
    .from('financing_applications')
    .insert({
      homeowner_id: customerId,
      adapter: 'admin_manual',
      adapter_application_id: body.bcApplicationRef ?? null,
      status: 'approved',
    })
    .select('id')
    .single()
  if (appInsertErr || !appRow) {
    await writeAuditOutcome(
      'rollback',
      null,
      { ...auditCtx, write_failed_at: 'financing_applications_insert' },
      'financing_applications_insert_failed',
      appInsertErr?.message,
    )
    return jsonResponse(500, { error: 'financing_applications_insert_failed', detail: appInsertErr?.message })
  }
  const appId: string = appRow.id

  // Write 2 — financing_approvals (service_role-only writes per migration 047
  // RLS pattern; status='approved' explicit per enum {approved,denied}; envelope
  // + APR + term as cents/bps/int per migration 047 *_cents convention)
  const { data: apprRow, error: apprInsertErr } = await admin
    .from('financing_approvals')
    .insert({
      financing_application_id: appId,
      status: 'approved',
      envelope_amount_cents: body.envelopeCents,
      apr_bps: body.aprBps,
      term_months: body.termMonths,
      expires_at: body.expiresAt,
    })
    .select('id')
    .single()
  if (apprInsertErr || !apprRow) {
    // FK-ordered manual rollback per spec L244 (no PostgREST cross-call txn)
    const appDelErr = await safeRollbackDelete('financing_applications', appId)
    await writeAuditOutcome(
      'rollback',
      null,
      {
        ...auditCtx,
        write_failed_at: 'financing_approvals_insert',
        rolled_back_application_id: appId,
        ...(appDelErr ? { rollback_failure_financing_applications: appDelErr } : {}),
      },
      'financing_approvals_insert_failed',
      apprInsertErr?.message,
    )
    return jsonResponse(500, { error: 'financing_approvals_insert_failed', detail: apprInsertErr?.message })
  }
  const apprId: string = apprRow.id

  // Write 3 — customer_financing_profile UPSERT (cfp-precedence: latest
  // approval wins; frozen until next approval or expiry per spec §cfp-precedence)
  // AS-SHIPPED cols: has_financing, last_known_status, last_known_amount_cents,
  // source (enum {self_attest,adapter}), approval_partner, approval_expires_at
  const { error: cfpErr } = await admin
    .from('customer_financing_profile')
    .upsert(
      {
        customer_id: customerId,
        has_financing: true,
        last_known_status: 'approved',
        last_known_amount_cents: body.envelopeCents,
        source: 'adapter',
        approval_partner: lenderRow.name,
        approval_expires_at: body.expiresAt,
      },
      { onConflict: 'customer_id' },
    )
  if (cfpErr) {
    // Full rollback per spec L244: approvals first (FK to applications), then app
    const apprDelErr = await safeRollbackDelete('financing_approvals', apprId)
    const appDelErr = await safeRollbackDelete('financing_applications', appId)
    await writeAuditOutcome(
      'rollback',
      null,
      {
        ...auditCtx,
        write_failed_at: 'cfp_upsert',
        rolled_back_approval_id: apprId,
        rolled_back_application_id: appId,
        ...(apprDelErr ? { rollback_failure_financing_approvals: apprDelErr } : {}),
        ...(appDelErr ? { rollback_failure_financing_applications: appDelErr } : {}),
      },
      'cfp_upsert_failed_all_rolled_back',
      cfpErr.message,
    )
    return jsonResponse(500, { error: 'cfp_upsert_failed_all_rolled_back', detail: cfpErr.message })
  }

  // All three writes landed — capture success audit with full final state
  await writeAuditOutcome(
    'success',
    apprId,
    {
      ...auditCtx,
      application_id: appId,
      approval_id: apprId,
    },
  )

  return jsonResponse(200, {
    ok: true,
    action: 'create-approval',
    application_id: appId,
    approval_id: apprId,
    high_value: highValue,
  })
})
