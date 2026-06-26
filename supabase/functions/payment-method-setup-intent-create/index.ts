// payment-method-setup-intent-create Edge Function
// Tier-1 cards-on-file save flow — STEP 1 of 2 (FE confirmSetup is STEP 2).
//
// Rod-directive (via kratos msg 1782448311392): homeowner saves pay-in method
// ONCE in profile, so Step 3 checkout is a single "Pay $250" button instead of
// the full PaymentElement tab-strip.
//
// REQUEST:
//   POST {
//     kind: 'card' | 'us_bank_account',
//     purpose?: 'service_pay_in' (default; reserved for future expansion)
//   }
//
// SEMANTICS:
//   1. Verify Bearer JWT → caller profile (any authenticated user).
//   2. Look up stripe_customers row for caller.user_id. If none, call
//      stripe.customers.create({ metadata: { user_id, role } }) and INSERT.
//   3. Call stripe.setupIntents.create({
//        customer,
//        payment_method_types: [kind],
//        usage: 'on_session',
//        metadata: { user_id, purpose }
//      })
//   4. Return { client_secret, customer_id, setup_intent_id, kind }
//
//   The actual PaymentMethod row in public.payment_methods is INSERTed by the
//   stripe-webhook handler on `setup_intent.succeeded`, NOT here — so that a
//   user who abandons the FE confirmSetup doesn't leave a half-saved PM row.
//
// RESPONSE (200):
//   { ok: true, client_secret, customer_id, setup_intent_id, kind }
//
// ERRORS (400/401/500):
//   missing_bearer_token | invalid_or_expired_token | invalid_json_body |
//   invalid_kind | stripe_customer_create_failed | stripe_setup_intent_failed
//
// COMPLIANCE:
//   - Authenticated users only (any role). Role-gating happens at the
//     create-rep-request consumer site, not at PM-save time (vendor/rep can
//     also save PMs for membership/commissions via separate purpose values).
//   - Stripe test-mode keys are read from SUPABASE secrets per CLAUDE.md
//     guidance — NEVER persisted in DB rows.
//   - mig 111 must be APPLIED before this fn admits service_pay_in purpose.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.177.0'

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

type Body = {
  kind: 'card' | 'us_bank_account'
  purpose?: 'service_pay_in'
}

serve(async (req: Request) => {
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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })

  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { ok: false, code: 'invalid_or_expired_token', error: 'JWT verify failed' })
  }
  const caller = userResult.user

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return jsonResponse(400, { ok: false, code: 'invalid_json_body', error: 'Body must be valid JSON' })
  }
  if (body.kind !== 'card' && body.kind !== 'us_bank_account') {
    return jsonResponse(400, { ok: false, code: 'invalid_kind', error: "kind must be 'card' or 'us_bank_account'" })
  }
  const purpose = body.purpose ?? 'service_pay_in'

  // Look up or create the stripe_customers row.
  let { data: customerRow } = await admin
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', caller.id)
    .maybeSingle()

  let stripeCustomerId = customerRow?.stripe_customer_id ?? null

  if (!stripeCustomerId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role, name, email')
      .eq('id', caller.id)
      .maybeSingle()

    try {
      const customer = await stripe.customers.create({
        email: caller.email ?? undefined,
        name: profile?.name ?? undefined,
        metadata: { user_id: caller.id, role: profile?.role ?? 'unknown' },
      })
      stripeCustomerId = customer.id
      await admin.from('stripe_customers').insert({
        user_id: caller.id,
        stripe_customer_id: customer.id,
      })
    } catch (e) {
      return jsonResponse(500, {
        ok: false,
        code: 'stripe_customer_create_failed',
        error: (e as Error).message,
      })
    }
  }

  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: [body.kind],
      usage: 'on_session',
      metadata: { user_id: caller.id, purpose },
    })
    return jsonResponse(200, {
      ok: true,
      client_secret: setupIntent.client_secret,
      customer_id: stripeCustomerId,
      setup_intent_id: setupIntent.id,
      kind: body.kind,
    })
  } catch (e) {
    return jsonResponse(500, {
      ok: false,
      code: 'stripe_setup_intent_failed',
      error: (e as Error).message,
    })
  }
})
