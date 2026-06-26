// stripe-connect-external-account-attach Edge Function
// Flow-B (banking-flowb) Phase 2 — in-app bank-update path for active Connect
// accounts. Replaces the embedded ConnectAccountManagement iframe ("Update
// Details" CTA) with a BuildConnect-chrome form that tokenizes routing/account
// via Stripe.js stripe.createToken('bank_account',...) and POSTs btok_ here.
//
// Item-4 extension (Rod "Add payout bank" → must accept a DEBIT card):
// admits a discriminated kind="card" branch alongside the original bank
// branch. Card branch tokenizes via stripe.createToken({type:"card",
// currency:"usd"}) on the FE, POSTs tok_ here, server validates debit-only
// funding + lazy-requests the card_payouts capability on first attempt.
//
// COMPLIANCE BOUNDARY: First-time KYC (SSN/EIN/DOB on Express accounts) STAYS
// on ConnectOnboardingDialog (federal AML, non-removable). This fn handles the
// bank-account / debit-card attach/swap ONLY — no KYC fields touched, no PII
// collected.
//
// REPLACE SEMANTICS (v1): swap-by-redefault — accounts.createExternalAccount
// with default_for_currency=true reassigns the default; old external_account
// lingers as non-default until manual cleanup or a follow-up detach fn. No
// detach-first complexity in v1 per kratos msg 1782432903335 (orphaned-bank
// clutter is acceptable risk; add detach later only if it matters). Confirmed
// cross-kind for item-4 per kratos Q4c — card EA can coexist with a prior
// bank EA on the same Connect account; default_for_currency is per-(account,
// currency).
//
// Request:
//   POST { partyType: 'vendor' | 'homeowner' | 'rep',
//          kind?: 'bank' | 'card',   // default 'bank' (backward-compat)
//          token_id: 'btok_xxx' (kind=bank) | 'tok_xxx' (kind=card),
//          setDefault: boolean       // default true }
//
// Response (200):
//   { ok: true, external_account_id: 'ba_xxx' | 'card_xxx',
//     last4: '1234',
//     bank_name: 'Chase' | null,  // null on kind=card
//     brand: 'Visa' | null,       // null on kind=bank
//     currency: 'usd', default_for_currency: true }
//
// Errors (400/401/403/409/500/502):
//   { ok: false, code: 'invalid_token' | 'connect_account_not_eligible' |
//                       'missing_bearer_token' | 'invalid_or_expired_token' |
//                       'card_payouts_not_enabled' |
//                       'card_payouts_pending_verification' |
//                       'debit_required' |
//                       'stripe_error' | 'internal', error: '<human>' }
//
// Flow (bank branch — unchanged from v1):
//   1. JWT verify → caller.id
//   2. Validate body { partyType, token_id (btok_*), setDefault }
//   3. SELECT escrow_accounts WHERE party_id=caller.id AND party_type=partyType
//   4. Eligibility: status IN ('active','pending_verification','restricted')
//   5. stripe.accounts.createExternalAccount(stripe_account_id, {
//        external_account: btok_, default_for_currency: setDefault })
//   6. UPDATE escrow_accounts SET external_account_id, _last4, _bank_name,
//        _brand=NULL, updated_at = now() WHERE id = existing.id
//   7. Return display fields + Stripe ba_xxx id
//
// Flow (card branch — item-4):
//   1-4. Same as bank, but token_id must start with tok_ (not btok_).
//   5a. stripe.tokens.retrieve(token_id) — server-side re-validate
//       token.card.funding === 'debit'. Reject 400 debit_required if not.
//   5b. stripe.accounts.retrieve(stripe_account_id) — gate requires
//       capabilities.card_payouts === 'active' AND
//       capabilities.transfers === 'active'.
//   5c. If card_payouts !== 'active': stripe.accounts.update to request
//       (B2 lazy backfill per kratos contract-close). Re-retrieve. Branch:
//       - now 'active' → proceed
//       - 'pending' → 409 card_payouts_pending_verification
//       - 'inactive' / still absent → 400 card_payouts_not_enabled
//   5d. stripe.accounts.createExternalAccount(stripe_account_id, {
//         external_account: tok_, default_for_currency: setDefault })
//   6. UPDATE escrow_accounts SET external_account_id, _last4=card.last4,
//        _bank_name=NULL, _brand=card.brand, updated_at = now()
//   7. Return display fields + Stripe card_xxx id + brand

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

type AttachKind = 'bank' | 'card'

type AttachBody = {
  partyType: 'vendor' | 'homeowner' | 'rep'
  kind?: AttachKind
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
const ALLOWED_KINDS = new Set<AttachKind>(['bank', 'card'])

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
  // kind defaults to 'bank' for backward-compat with FE callers that predate
  // the item-4 extension.
  const kind: AttachKind = body.kind ?? 'bank'
  if (!ALLOWED_KINDS.has(kind)) {
    return jsonResponse(400, { ok: false, code: 'invalid_kind', error: 'kind must be bank|card' })
  }
  if (typeof body.token_id !== 'string') {
    return jsonResponse(400, { ok: false, code: 'invalid_token', error: 'token_id is required' })
  }
  if (kind === 'bank' && !body.token_id.startsWith('btok_')) {
    return jsonResponse(400, {
      ok: false,
      code: 'invalid_token',
      error: 'token_id must be a Stripe bank-account token (btok_*) for kind=bank',
    })
  }
  if (kind === 'card' && !body.token_id.startsWith('tok_')) {
    return jsonResponse(400, {
      ok: false,
      code: 'invalid_token',
      error: 'token_id must be a Stripe card token (tok_*) for kind=card',
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

  // Layer 3 — Stripe client
  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-09-30.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  // Layer 3a (card branch only) — funding revalidate + capability gate.
  // We do these BEFORE the createExternalAccount call so a rejection costs
  // exactly one tokens.retrieve + one accounts.retrieve (+ maybe one
  // accounts.update on first-debit-attach), never touches the EA attach.
  if (kind === 'card') {
    // Server-side debit-funding revalidate (FE guard is convenience).
    // tokens.retrieve returns token.card.funding ∈ {credit,debit,prepaid,unknown}.
    let tokenObj: Stripe.Token
    try {
      tokenObj = await stripe.tokens.retrieve(body.token_id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse(502, { ok: false, code: 'stripe_error', error: `tokens.retrieve failed: ${msg}` })
    }
    if (!tokenObj.card) {
      return jsonResponse(400, {
        ok: false,
        code: 'invalid_token',
        error: 'token has no card payload (expected stripe.createToken type:card)',
      })
    }
    if (tokenObj.card.funding !== 'debit') {
      return jsonResponse(400, {
        ok: false,
        code: 'debit_required',
        error: 'Only debit cards are accepted for payouts.',
        hint: `Card funding=${tokenObj.card.funding}, must be debit.`,
      })
    }

    // Capability precheck: card_payouts + transfers both 'active'.
    // B2 lazy backfill: if card_payouts is absent/inactive on this account,
    // request it via accounts.update, re-retrieve, branch on resulting state.
    let acct: Stripe.Account
    try {
      acct = await stripe.accounts.retrieve(existing.stripe_account_id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse(502, { ok: false, code: 'stripe_error', error: `accounts.retrieve failed: ${msg}` })
    }
    const transfersState = acct.capabilities?.transfers
    if (transfersState !== 'active') {
      return jsonResponse(400, {
        ok: false,
        code: 'connect_account_not_eligible',
        error: `Connect account transfers capability not active (state=${transfersState ?? 'absent'}).`,
      })
    }
    let cardPayoutsState = acct.capabilities?.card_payouts
    if (cardPayoutsState !== 'active') {
      // B2 lazy backfill — fires only on a partyType actually attempting a
      // debit-card attach, never on accounts that only use bank-account EAs.
      // Independent of (A) onboarding-proactive request: belt-and-suspenders
      // for accounts onboarded without card_payouts (legacy, partyType not
      // in onboarding (A) gate, or pre-extension accounts).
      try {
        const updated = await stripe.accounts.update(existing.stripe_account_id, {
          capabilities: { card_payouts: { requested: true } },
        })
        cardPayoutsState = updated.capabilities?.card_payouts
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return jsonResponse(502, {
          ok: false,
          code: 'stripe_error',
          error: `accounts.update (request card_payouts) failed: ${msg}`,
        })
      }
      if (cardPayoutsState === 'pending') {
        return jsonResponse(409, {
          ok: false,
          code: 'card_payouts_pending_verification',
          error: 'Debit-card payout is pending Stripe verification — typically minutes to hours; try again once active.',
        })
      }
      if (cardPayoutsState !== 'active') {
        return jsonResponse(400, {
          ok: false,
          code: 'card_payouts_not_enabled',
          error: `Debit-card payouts not available on this account (capability state=${cardPayoutsState ?? 'absent'}).`,
        })
      }
    }
  }

  // Layer 4 — Stripe createExternalAccount (both branches funnel here).
  // Stripe accepts btok_* and tok_* via the same endpoint; the result.object
  // discriminates ('bank_account' vs 'card') and we narrow accordingly.
  let externalAccount: Stripe.BankAccount | Stripe.Card
  try {
    const result = await stripe.accounts.createExternalAccount(existing.stripe_account_id, {
      external_account: body.token_id,
      default_for_currency: setDefault,
    })
    const expectedObject = kind === 'card' ? 'card' : 'bank_account'
    if (result.object !== expectedObject) {
      return jsonResponse(500, {
        ok: false,
        code: 'stripe_unexpected_object',
        error: `Expected ${expectedObject}, got ${result.object}`,
      })
    }
    externalAccount = result as Stripe.BankAccount | Stripe.Card
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(502, { ok: false, code: 'stripe_error', error: msg })
  }

  // Layer 5 — persist display metadata. Source-of-truth is Stripe; these
  // cols are the cached view the FE renders without a Stripe round-trip.
  // bank branch: bank_name set, brand null. card branch: brand set, bank_name null.
  const isCard = kind === 'card'
  const bankAccount = !isCard ? (externalAccount as Stripe.BankAccount) : null
  const card = isCard ? (externalAccount as Stripe.Card) : null
  const last4 = (bankAccount?.last4 ?? card?.last4) ?? null
  const currency = (bankAccount?.currency ?? card?.currency) ?? null
  const { error: updateErr } = await admin
    .from('escrow_accounts')
    .update({
      external_account_id: externalAccount.id,
      external_account_last4: last4,
      external_account_bank_name: bankAccount?.bank_name ?? null,
      external_account_brand: card?.brand ?? null,
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
    last4,
    bank_name: bankAccount?.bank_name ?? null,
    brand: card?.brand ?? null,
    currency,
    default_for_currency: externalAccount.default_for_currency ?? false,
  })
})
