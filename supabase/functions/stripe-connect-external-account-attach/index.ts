// stripe-connect-external-account-attach Edge Function
// Flow-B (banking-flowb) Phase 2 — in-app bank-update path for active Connect
// accounts. Replaces the embedded ConnectAccountManagement iframe ("Update
// Details" CTA) with a BuildConnect-chrome form that tokenizes routing/account
// via Stripe.js stripe.createToken('bank_account',...) and POSTs btok_ here.
//
// COMPLIANCE BOUNDARY: First-time KYC (SSN/EIN/DOB on Express accounts) STAYS
// on ConnectOnboardingDialog (federal AML, non-removable). This fn handles the
// bank-account attach/swap ONLY — no KYC fields touched, no PII collected.
//
// REPLACE SEMANTICS (v1): swap-by-redefault — accounts.createExternalAccount
// with default_for_currency=true reassigns the default; old external_account
// lingers as non-default until manual cleanup or a follow-up detach fn. No
// detach-first complexity in v1 per kratos msg 1782432903335 (orphaned-bank
// clutter is acceptable risk; add detach later only if it matters).
//
// Request:
//   POST { partyType: 'vendor' | 'homeowner' | 'rep',
//          token_id: 'btok_xxx',
//          setDefault: boolean  // default true }
//
// Response (200):
//   { ok: true, external_account_id: 'ba_xxx', last4: '1234',
//     bank_name: 'Chase', currency: 'usd', default_for_currency: true }
//
// Errors (400/401/403/500/502):
//   { ok: false, code: 'invalid_token' | 'connect_account_not_eligible' |
//                       'missing_bearer_token' | 'invalid_or_expired_token' |
//                       'stripe_error' | 'internal', error: '<human>' }
//
// Flow:
//   1. JWT verify → caller.id
//   2. Validate body { partyType, token_id, setDefault }
//   3. SELECT escrow_accounts WHERE party_id=caller.id AND party_type=partyType
//   4. Eligibility: status IN ('active','pending_verification','restricted')
//      - 'active' is the Rod-hit case (Update Details on connected acct)
//      - 'pending_verification' + 'restricted' admitted for KYC-race safety
//        when dialog opens mid-state-transition
//      - 'not_connected'/'rejected' → 400 connect_account_not_eligible
//   5. stripe.accounts.createExternalAccount(stripe_account_id, {
//        external_account: token_id, default_for_currency: setDefault })
//   6. UPDATE escrow_accounts SET external_account_id, _last4, _bank_name,
//        updated_at = now() WHERE id = existing.id
//   7. Return display fields + Stripe ba_xxx id

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

type AttachBody = {
  partyType: 'vendor' | 'homeowner' | 'rep'
  token_id: string
  setDefault?: boolean
}

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

const ELIGIBLE_STATUSES = new Set(['active', 'pending_verification', 'restricted'])
const ALLOWED_PARTY_TYPES = new Set(['vendor', 'homeowner', 'rep'])

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, code: 'method_not_allowed', error: 'POST only' })
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  if (!stripeKey) {
    return jsonResponse(503, {
      ok: false,
      code: 'stripe_not_configured',
      error: 'STRIPE_SECRET_KEY env missing — set via supabase secrets set.',
    })
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

  // Layer 1 — JWT verify
  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { ok: false, code: 'invalid_or_expired_token', error: 'JWT verify failed' })
  }
  const caller = userResult.user

  // Parse + validate body
  let body: AttachBody
  try {
    body = (await req.json()) as AttachBody
  } catch {
    return jsonResponse(400, { ok: false, code: 'invalid_json_body', error: 'Body must be valid JSON' })
  }
  if (!ALLOWED_PARTY_TYPES.has(body.partyType)) {
    return jsonResponse(400, { ok: false, code: 'invalid_party_type', error: 'partyType must be vendor|homeowner|rep' })
  }
  if (typeof body.token_id !== 'string' || !body.token_id.startsWith('btok_')) {
    return jsonResponse(400, {
      ok: false,
      code: 'invalid_token',
      error: 'token_id must be a Stripe bank-account token (btok_*)',
    })
  }
  const setDefault = body.setDefault !== false // default true

  // Layer 2 — escrow_accounts row + eligibility
  const { data: existing, error: lookupErr } = await admin
    .from('escrow_accounts')
    .select('id, stripe_account_id, status')
    .eq('party_type', body.partyType)
    .eq('party_id', caller.id)
    .maybeSingle()
  if (lookupErr) {
    return jsonResponse(500, {
      ok: false,
      code: 'escrow_account_lookup_failed',
      error: lookupErr.message,
    })
  }
  if (!existing?.stripe_account_id) {
    return jsonResponse(400, {
      ok: false,
      code: 'connect_account_not_eligible',
      error: 'No Connect account on file — complete KYC onboarding first.',
    })
  }
  if (!ELIGIBLE_STATUSES.has(existing.status)) {
    return jsonResponse(400, {
      ok: false,
      code: 'connect_account_not_eligible',
      error: `status=${existing.status} not eligible for bank attach (need active|pending_verification|restricted)`,
    })
  }

  // Layer 3 — Stripe call
  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-09-30.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  let externalAccount: Stripe.BankAccount
  try {
    const result = await stripe.accounts.createExternalAccount(existing.stripe_account_id, {
      external_account: body.token_id,
      default_for_currency: setDefault,
    })
    // External account here is bank_account (we rejected non-btok_ at body parse).
    // Stripe's union return type is BankAccount | Card; narrow by object field.
    if (result.object !== 'bank_account') {
      return jsonResponse(500, {
        ok: false,
        code: 'stripe_unexpected_object',
        error: `Expected bank_account, got ${result.object}`,
      })
    }
    externalAccount = result as Stripe.BankAccount
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(502, { ok: false, code: 'stripe_error', error: msg })
  }

  // Layer 4 — persist display metadata. Source-of-truth is Stripe; these
  // cols are the cached view the FE renders without a Stripe round-trip.
  const { error: updateErr } = await admin
    .from('escrow_accounts')
    .update({
      external_account_id: externalAccount.id,
      external_account_last4: externalAccount.last4 ?? null,
      external_account_bank_name: externalAccount.bank_name ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)

  if (updateErr) {
    // Stripe-side attach succeeded but DB cache write failed. Return the
    // Stripe id in the error so an operator can manually backfill, and so
    // the FE can show the success state from the Stripe response anyway.
    return jsonResponse(500, {
      ok: false,
      code: 'escrow_account_update_failed_after_stripe_attach',
      error: updateErr.message,
      stripe_external_account_id: externalAccount.id,
    })
  }

  return jsonResponse(200, {
    ok: true,
    external_account_id: externalAccount.id,
    last4: externalAccount.last4 ?? null,
    bank_name: externalAccount.bank_name ?? null,
    currency: externalAccount.currency ?? null,
    default_for_currency: externalAccount.default_for_currency ?? false,
  })
})
