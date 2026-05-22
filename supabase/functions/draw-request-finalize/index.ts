// draw-request-finalize Edge Function
//
// SERVICE_ROLE-only. Cron-triggered (1h interval) OR per-draw via {draw_request_id}.
// Sweeps draw_requests where status=approved AND dispute_window_ends_at < NOW();
// transitions status → paid, INSERTs commission_ledger row with draw_request_id FK,
// sets paid_at = NOW().
//
// Body: { draw_request_id?: uuid }  — optional. If absent: batch sweep.
// Auth: service_role only (caller token must equal SUPABASE_SERVICE_ROLE_KEY).
//
// Out of scope v1: actual payout dispatch (Stripe/ACH). status=paid is the
// surface signal; downstream payout pipeline reads commission_ledger.
//
// 7-step Rod constraint coverage:
//   #4 48h dispute window                            — handler filter
//   #5 per-draw commission % off-the-top             — ledger INSERT
//   #6 master-flag gate                              — handler step 3

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLATFORM_COMMISSION_PCT = 10

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

type FinalizeBody = { draw_request_id?: string }

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
  if (token !== serviceRoleKey) {
    return jsonResponse(401, { error: 'service_role_required' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: flagRow, error: flagErr } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'financing_enabled')
    .maybeSingle()
  if (flagErr) return jsonResponse(500, { error: 'flag_check_failed' })
  if (!flagRow || flagRow.enabled !== true) {
    return jsonResponse(503, { error: 'financing_disabled', flag: 'financing_enabled' })
  }

  let body: FinalizeBody = {}
  try {
    const raw = await req.text()
    if (raw.length > 0) body = JSON.parse(raw) as FinalizeBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }

  const nowIso = new Date().toISOString()

  // Build candidate set: single (if id provided) OR batch sweep (window-elapsed)
  let query = admin
    .from('draw_requests')
    .select('id, financing_application_id, sent_project_id, vendor_id, amount_cents, commission_cents, vendor_payout_cents, dispute_window_ends_at')
    .eq('status', 'approved')
  if (body.draw_request_id) {
    query = query.eq('id', body.draw_request_id)
  } else {
    query = query.lt('dispute_window_ends_at', nowIso)
  }

  const { data: candidates, error: candidateErr } = await query
  if (candidateErr) return jsonResponse(500, { error: 'candidate_lookup_failed' })
  if (!candidates || candidates.length === 0) {
    return jsonResponse(200, {
      ok: true,
      finalized_count: 0,
      finalized_ids: [],
      total_commission_cents: 0,
      total_vendor_payout_cents: 0,
    })
  }

  // Single-row guard for explicit draw_request_id targeting (still must be window-elapsed)
  if (body.draw_request_id) {
    const target = candidates[0]
    if (new Date(target.dispute_window_ends_at).getTime() > Date.now()) {
      return jsonResponse(409, {
        error: 'dispute_window_not_elapsed',
        dispute_window_ends_at: target.dispute_window_ends_at,
      })
    }
  }

  const finalizedIds: string[] = []
  let totalCommission = 0
  let totalVendorPayout = 0

  for (const c of candidates) {
    // Atomic status-bump (conditional UPDATE guards against double-finalize race)
    const { data: bumped, error: bumpErr } = await admin
      .from('draw_requests')
      .update({ status: 'paid', paid_at: nowIso })
      .eq('id', c.id)
      .eq('status', 'approved')
      .select('id')
      .maybeSingle()
    if (bumpErr || !bumped) continue

    // commission_ledger INSERT (Option A additive: draw_request_id FK + per-draw row)
    const { error: ledgerErr } = await admin
      .from('commission_ledger')
      .insert({
        financing_application_id: c.financing_application_id,
        sent_project_id: c.sent_project_id,
        vendor_id: c.vendor_id,
        draw_request_id: c.id,
        state: 'realized',
        envelope_amount_cents: c.amount_cents,
        vendor_commission_pct: PLATFORM_COMMISSION_PCT,
        reserved_commission_amount_cents: c.commission_cents,
        final_commission_amount_cents: c.commission_cents,
        net_to_vendor_cents: c.vendor_payout_cents,
      })
    if (ledgerErr) {
      console.log(JSON.stringify({
        event: 'commission_ledger_insert_failed',
        draw_request_id: c.id,
        detail: ledgerErr.message,
      }))
      continue
    }

    finalizedIds.push(c.id)
    totalCommission += c.commission_cents
    totalVendorPayout += c.vendor_payout_cents
  }

  return jsonResponse(200, {
    ok: true,
    finalized_count: finalizedIds.length,
    finalized_ids: finalizedIds,
    total_commission_cents: totalCommission,
    total_vendor_payout_cents: totalVendorPayout,
  })
})
