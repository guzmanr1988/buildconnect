// stripe-payment-method-finalize Edge Function
//
// Companion to stripe-setup-intent-create. After the client calls
// stripe.confirmSetup() inside Elements and that resolves with a succeeded
// (or requires_action / pending verification) SetupIntent, the client invokes
// THIS fn with the SetupIntent.id. We:
//   1. Verify the caller's JWT.
//   2. Read the SetupIntent server-side via Stripe API (DO NOT trust client-
//      reported state — Stripe is the only source of truth).
//   3. Verify it belongs to this caller (matches stripe_customers row).
//   4. Pull the PaymentMethod from Stripe by setupIntent.payment_method.
//   5. UPSERT a row into payment_methods (idempotent on
//      stripe_payment_method_id, so double-finalize doesn't dupe).
//
// Why server-re-read instead of trusting the client:
//   - Client could be fooled / replayed. Stripe's GET is canonical.
//   - SetupIntent transitions are non-trivial (requires_action for ACH
//     microdeposits, processing for FC). Server pulls the live state.
//
// Request body:
//   { setup_intent_id: string, purpose: 'membership' | 'commissions' | 'both' }
//
// Response (200):
//   {
//     ok: true,
//     payment_method_id: <local uuid>,
//     stripe_payment_method_id: string,
//     kind: 'card' | 'us_bank_account',
//     status: 'active' | 'pending_verification',
//     last4: string,
//     brand?: string,
//     bank_name?: string,
//     verification_method?: 'financial_connections' | 'microdeposits'
//   }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

type Purpose = 'membership' | 'commissions' | 'both'

interface RequestBody {
  setup_intent_id: string
  purpose: Purpose
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

function isValidPurpose(v: unknown): v is Purpose {
  return v === 'membership' || v === 'commissions' || v === 'both'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' })
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  if (!stripeKey) {
    return jsonResponse(503, { error: 'stripe_not_configured' })
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
  const caller = userResult.user

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }
  if (typeof body.setup_intent_id !== 'string' || !body.setup_intent_id.startsWith('seti_')) {
    return jsonResponse(400, { error: 'invalid_setup_intent_id' })
  }
  if (!isValidPurpose(body.purpose)) {
    return jsonResponse(400, { error: 'invalid_purpose' })
  }

  // Look up the caller's Stripe Customer for ownership check.
  const { data: customerRow, error: customerLookupErr } = await admin
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', caller.id)
    .maybeSingle()
  if (customerLookupErr || !customerRow?.stripe_customer_id) {
    return jsonResponse(400, {
      error: 'stripe_customer_not_found_for_caller',
      hint: 'Caller has no Stripe Customer yet — call stripe-setup-intent-create first.',
    })
  }
  const callerStripeCustomerId = customerRow.stripe_customer_id

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-09-30.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  // Server-side re-read of the SetupIntent (DO NOT trust client state).
  let setupIntent: Stripe.SetupIntent
  try {
    setupIntent = await stripe.setupIntents.retrieve(body.setup_intent_id, {
      expand: ['payment_method'],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(502, { error: 'stripe_setup_intent_retrieve_failed', detail: msg })
  }

  // Ownership check — the SetupIntent's customer must match this caller.
  if (setupIntent.customer !== callerStripeCustomerId) {
    return jsonResponse(403, {
      error: 'setup_intent_customer_mismatch',
      hint: 'SetupIntent does not belong to caller.',
    })
  }

  // Status discrimination — we accept 'succeeded' (card / FC-instant-verify
  // ACH) and 'requires_action' (ACH microdeposits awaiting verification).
  // 'requires_action' means Stripe sent microdeposits; the PaymentMethod
  // exists but is pending until verifyMicrodeposits succeeds. We DO store
  // the row but with status='pending_verification' so the UI can show it
  // and we can resume verification later.
  const acceptableStatuses = new Set(['succeeded', 'requires_action', 'processing'])
  if (!acceptableStatuses.has(setupIntent.status)) {
    return jsonResponse(409, {
      error: 'setup_intent_not_acceptable_status',
      status: setupIntent.status,
      hint: 'Client may have called finalize before Elements confirmed.',
    })
  }

  const paymentMethod = setupIntent.payment_method
  if (!paymentMethod || typeof paymentMethod === 'string') {
    return jsonResponse(409, {
      error: 'setup_intent_no_expanded_payment_method',
      hint: 'SetupIntent has no PaymentMethod yet — likely confirm not called.',
    })
  }

  // Derive display fields from Stripe PaymentMethod object.
  const kind = paymentMethod.type as string
  if (kind !== 'card' && kind !== 'us_bank_account') {
    return jsonResponse(400, {
      error: 'unsupported_payment_method_type',
      type: kind,
    })
  }

  let last4: string | null = null
  let brand: string | null = null
  let expMonth: number | null = null
  let expYear: number | null = null
  let bankName: string | null = null
  let routingLast4: string | null = null
  let holder: string | null = null

  // card.funding = 'credit' | 'debit' | 'prepaid' | 'unknown' — Stripe derives
  // this from the BIN post-tokenization. We do NOT ask the user; auto-detect
  // and stamp it into SetupIntent.metadata.buildconnect_card_funding for
  // downstream reporting (queryable via Stripe API forever, no DB migration
  // needed under freeze).
  let cardFunding: string | null = null

  if (kind === 'card' && paymentMethod.card) {
    last4 = paymentMethod.card.last4
    brand = paymentMethod.card.brand
    expMonth = paymentMethod.card.exp_month
    expYear = paymentMethod.card.exp_year
    holder = paymentMethod.billing_details?.name ?? null
    cardFunding = paymentMethod.card.funding ?? null
  } else if (kind === 'us_bank_account' && paymentMethod.us_bank_account) {
    last4 = paymentMethod.us_bank_account.last4
    bankName = paymentMethod.us_bank_account.bank_name ?? null
    routingLast4 =
      paymentMethod.us_bank_account.routing_number?.slice(-4) ?? null
    holder = paymentMethod.billing_details?.name ?? null
  }

  if (!last4) {
    return jsonResponse(500, {
      error: 'payment_method_missing_last4',
      detail: 'Stripe returned a PaymentMethod without last4 — unexpected.',
      payment_method_id: paymentMethod.id,
    })
  }

  // Resolve our row status + actual verification path Stripe ended up using.
  //   - card → always 'active' (confirmSetup succeeded means card is usable)
  //   - us_bank_account with financial_connections_account populated → FC
  //     succeeded → 'active'
  //   - us_bank_account without FC account → microdeposits path → either
  //     'requires_action' (waiting for verifyMicrodeposits) or 'processing'
  //     (deposits sent) → 'pending_verification'
  //
  // We discriminate from the PaymentMethod shape, not the SetupIntent options,
  // because SetupIntent was created with verification_method='automatic' — the
  // actual path Stripe picked is observable only on the resulting PaymentMethod.
  let rowStatus: 'active' | 'pending_verification' = 'active'
  let verificationMethod: 'financial_connections' | 'microdeposits' | null = null
  if (kind === 'us_bank_account' && paymentMethod.us_bank_account) {
    const fcAccount = paymentMethod.us_bank_account.financial_connections_account
    verificationMethod = fcAccount ? 'financial_connections' : 'microdeposits'
    if (verificationMethod === 'financial_connections' && setupIntent.status === 'succeeded') {
      rowStatus = 'active'
    } else {
      rowStatus = 'pending_verification'
    }
  }

  // UPSERT — idempotent on stripe_payment_method_id (UNIQUE in schema).
  // If finalize is called twice (e.g., client retry), the second call
  // updates purpose/status without duplicating the row.
  const upsertRow = {
    user_id: caller.id,
    stripe_customer_id: callerStripeCustomerId,
    stripe_payment_method_id: paymentMethod.id,
    stripe_setup_intent_id: setupIntent.id,
    kind,
    purpose: body.purpose,
    brand,
    last4,
    exp_month: expMonth,
    exp_year: expYear,
    bank_name: bankName,
    routing_last4: routingLast4,
    holder,
    status: rowStatus,
    verification_method: verificationMethod,
  }

  const { data: upserted, error: upsertErr } = await admin
    .from('payment_methods')
    .upsert(upsertRow, { onConflict: 'stripe_payment_method_id' })
    .select('id')
    .single()

  if (upsertErr) {
    return jsonResponse(500, {
      error: 'payment_method_upsert_failed',
      detail: upsertErr.message,
    })
  }

  // Best-effort stamp of card.funding into SetupIntent.metadata for reporting.
  // Non-critical: if this fails, the primary upsert already committed and we
  // still return success. Card funding is queryable directly off the
  // PaymentMethod later if this write is lost.
  if (cardFunding && !setupIntent.metadata?.buildconnect_card_funding) {
    try {
      await stripe.setupIntents.update(setupIntent.id, {
        metadata: {
          ...(setupIntent.metadata ?? {}),
          buildconnect_card_funding: cardFunding,
        },
      })
    } catch (_e) {
      // Swallow — reporting metadata is non-load-bearing for the flow.
    }
  }

  return jsonResponse(200, {
    ok: true,
    payment_method_id: upserted.id,
    stripe_payment_method_id: paymentMethod.id,
    kind,
    status: rowStatus,
    last4,
    brand: brand ?? undefined,
    bank_name: bankName ?? undefined,
    verification_method: verificationMethod ?? undefined,
  })
})
