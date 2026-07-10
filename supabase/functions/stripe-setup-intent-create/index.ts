// stripe-setup-intent-create Edge Function
//
// Flow A of the banking-consolidation track — Pay-IN side. Caller is the
// VendorPaymentDialog opening to save a new payment method (card or
// us_bank_account). This fn:
//   1. Verifies the caller's JWT.
//   2. Gets-or-creates a Stripe Customer for the caller (1:1 mapping into the
//      stripe_customers table; idempotent via UPSERT on user_id).
//   3. Creates a Stripe SetupIntent with the requested payment_method_types
//      and (for ACH) the requested verification path (financial_connections
//      or microdeposits). SetupIntent.client_secret returned to the client
//      for stripe.confirmSetup() inside Elements.
//
// PCI boundary:
//   - Server NEVER receives the PAN / account number / routing / CVV. Those
//     stay inside the Stripe Elements iframe. Client posts only the
//     {kind, purpose} pair; Stripe issues the client_secret bound to the
//     SetupIntent it just created server-side.
//
// Idempotency:
//   - Customer creation uses stable idempotency key 'sc:create:<user_id>'
//     so retries during the same user-flow don't dupe Customers.
//   - SetupIntent creation uses ephemeral idempotency key
//     'si:<user_id>:<purpose>:<kind>:<verification_method?>:<minute_bucket>'
//     — coarse-grained enough to dedupe accidental double-clicks but fresh
//     enough to allow a deliberate retry minutes later.
//
// Request body:
//   {
//     kind: 'card' | 'us_bank_account',
//     purpose: 'membership' | 'commissions' | 'both'
//   }
//
// ACH verification path is server-controlled: when kind = us_bank_account we
// always pass financial_connections permissions + verification_method =
// 'automatic' so PaymentElement renders FC-primary with microdeposit
// fallback in a single iframe. The actual verification path used is
// determined post-confirm by finalize fn reading the PaymentMethod shape
// (financial_connections_account populated → FC, otherwise → microdeposits).
//
// Response (200):
//   {
//     ok: true,
//     setup_intent_id: string,
//     client_secret: string,
//     customer_id: string,
//     publishable_key_hint: 'configured' | 'missing'  // for client diag only
//   }
//
// Notes for the finalize / confirm path:
//   After client confirmSetup() succeeds, the SetupIntent.payment_method is
//   the canonical handle (pm_xxx). A separate fn (stripe-payment-method-
//   finalize, M2) reads the confirmed SetupIntent server-side via JWT-verified
//   GET and writes the payment_methods row. We do NOT trust the client to
//   self-report success — server re-reads Stripe to confirm before persisting.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

type Kind = 'card' | 'us_bank_account'
type Purpose = 'membership' | 'commissions' | 'both'

interface RequestBody {
  kind: Kind
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

function isValidKind(v: unknown): v is Kind {
  return v === 'card' || v === 'us_bank_account'
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
    return jsonResponse(503, {
      error: 'stripe_not_configured',
      hint: 'Set STRIPE_SECRET_KEY via supabase secrets set (server-side, never client-side).',
    })
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

  // Layer 1 — JWT verify
  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { error: 'invalid_or_expired_token' })
  }
  const caller = userResult.user
  const callerEmail = caller.email || ''
  if (!callerEmail) {
    return jsonResponse(400, { error: 'caller_email_missing' })
  }

  // Parse + validate body
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }
  if (!isValidKind(body.kind)) {
    return jsonResponse(400, { error: 'invalid_kind' })
  }
  if (!isValidPurpose(body.purpose)) {
    return jsonResponse(400, { error: 'invalid_purpose' })
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-09-30.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  // Get-or-create Stripe Customer for this user.
  // 1. Look up local stripe_customers row.
  // 2. If absent → create Stripe Customer (idempotency-keyed by user_id) +
  //    insert local row.
  // 3. If present → use it.
  let stripeCustomerId: string
  {
    const { data: existingCustomer, error: customerLookupErr } = await admin
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', caller.id)
      .maybeSingle()
    if (customerLookupErr) {
      return jsonResponse(500, {
        error: 'stripe_customer_lookup_failed',
        detail: customerLookupErr.message,
      })
    }

    if (existingCustomer?.stripe_customer_id) {
      stripeCustomerId = existingCustomer.stripe_customer_id
    } else {
      try {
        const customer = await stripe.customers.create(
          {
            email: callerEmail,
            metadata: {
              buildconnect_user_id: caller.id,
              buildconnect_origin: 'stripe-setup-intent-create',
            },
          },
          {
            idempotencyKey: `sc:create:${caller.id}`,
          },
        )
        stripeCustomerId = customer.id

        const { error: insertErr } = await admin.from('stripe_customers').insert({
          user_id: caller.id,
          stripe_customer_id: customer.id,
        })
        if (insertErr) {
          // Race: another in-flight request inserted before us. Re-read.
          const { data: raced } = await admin
            .from('stripe_customers')
            .select('stripe_customer_id')
            .eq('user_id', caller.id)
            .maybeSingle()
          if (raced?.stripe_customer_id) {
            stripeCustomerId = raced.stripe_customer_id
          } else {
            return jsonResponse(500, {
              error: 'stripe_customer_insert_failed',
              detail: insertErr.message,
              leaked_stripe_customer_id: customer.id,
            })
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return jsonResponse(502, { error: 'stripe_customer_create_failed', detail: msg })
      }
    }
  }

  // Build the SetupIntent. payment_method_types narrows what the client
  // Elements PaymentElement can render; for ACH we also pass
  // payment_method_options.us_bank_account.verification_method to lock the
  // client into either Financial Connections or microdeposits.
  // Idempotency key buckets at the minute granularity so accidental
  // double-clicks dedupe but deliberate retries (e.g. after closing the
  // dialog and reopening 2 min later) get a fresh SetupIntent.
  const minuteBucket = Math.floor(Date.now() / 60_000)
  const idempotencyKey = `si:${caller.id}:${body.purpose}:${body.kind}:${minuteBucket}`

  try {
    // Card-tab PMC narrows the iframe to card-only AND disables Link "Save my
    // information" / wallets. Bank-tab keeps payment_method_types narrowing
    // (PMC and payment_method_types are mutually exclusive per Stripe API).
    // If STRIPE_PMC_CARD_ONLY_NO_LINK is unset, fall back to previous behavior.
    const cardPmc = Deno.env.get('STRIPE_PMC_CARD_ONLY_NO_LINK')
    // deno-lint-ignore no-explicit-any
    const setupIntentParams: any = {
      customer: stripeCustomerId,
      usage: 'off_session', // we'll charge later for membership / commission
      metadata: {
        buildconnect_user_id: caller.id,
        buildconnect_purpose: body.purpose,
        buildconnect_kind: body.kind,
        buildconnect_origin: 'stripe-setup-intent-create',
      },
    }
    if (body.kind === 'card' && cardPmc) {
      setupIntentParams.payment_method_configuration = cardPmc
    } else {
      setupIntentParams.payment_method_types = [body.kind]
    }

    if (body.kind === 'us_bank_account') {
      // Server-controlled ACH verification path: always pass FC permissions +
      // verification_method='automatic'. PaymentElement then renders FC-primary
      // with microdeposit fallback in one iframe — Stripe picks the path based
      // on whether the user's bank supports FC. Finalize fn discriminates via
      // payment_method.us_bank_account.financial_connections_account presence.
      setupIntentParams.payment_method_options = {
        us_bank_account: {
          verification_method: 'automatic',
          financial_connections: {
            permissions: ['payment_method'],
          },
        },
      }
    }

    const setupIntent = await stripe.setupIntents.create(setupIntentParams, {
      idempotencyKey,
    })

    if (!setupIntent.client_secret) {
      return jsonResponse(500, {
        error: 'setup_intent_missing_client_secret',
        detail: 'Stripe returned a SetupIntent with no client_secret — unexpected.',
        setup_intent_id: setupIntent.id,
      })
    }

    return jsonResponse(200, {
      ok: true,
      setup_intent_id: setupIntent.id,
      client_secret: setupIntent.client_secret,
      customer_id: stripeCustomerId,
      publishable_key_hint: 'configured',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(502, { error: 'stripe_setup_intent_create_failed', detail: msg })
  }
})
