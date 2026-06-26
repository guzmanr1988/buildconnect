// rep-request-payment-confirm Edge Function
//
// Webhook-INDEPENDENT synchronous confirm-read path for the rep_request
// PaymentIntent / charge lifecycle. Companion to create-rep-request and the
// SINGLE authoritative status-flip path for rep_requests.status going from
// 'pending_payment' to 'new' (or to a 3DS hold / failure state).
//
// Why this exists:
//   create-rep-request inserts the rep_requests row at status='pending_payment'
//   and returns { rep_request_id, client_secret, payment_intent_status,
//   requires_action }. The legacy wiring relies on the stripe-webhook handler
//   (charge.succeeded) to flip status → 'new'. Under CAPTURE-A2 (Supabase's
//   Cloudflare bot-management intercepting Stripe webhooks to llybxug), that
//   webhook does not reach the function, so rows sit in pending_payment
//   indefinitely.
//
//   This fn provides the parallel sync rail: FE calls it after the client-side
//   confirmPayment (or after the synchronous payment_intent_status returned by
//   create-rep-request) and we do a server-side PaymentIntents.retrieve to read
//   the canonical Stripe state and perform the same flip the webhook would
//   have done. Pattern is the exact mirror of stripe-payment-method-finalize
//   on the SetupIntent side.
//
// Why server-re-read instead of trusting the client:
//   - Client could be fooled / replayed. Stripe's GET is canonical.
//   - PaymentIntent state transitions are non-trivial — requires_action for
//     3DS, processing for asynchronous PMs. Server pulls the live state.
//
// Idempotency (belt-and-suspenders with webhook backup-rail):
//   - Status guard: flip only if rep_requests.status === 'pending_payment'.
//     If row already in 'new' (webhook landed first), we no-op and emit a
//     replay event mirroring the webhook handler's replay branch.
//   - Status guard on the row, not on stripe_charge_id, because the charge_id
//     is only known after retrieve — but the row state is the canonical guard.
//   - Webhook will use the SAME guard if it eventually fires post-fix, so
//     both rails are safe to land in either order.
//
// Single-responsibility:
//   This fn is the SINGLE authoritative flip path for both immediate-success
//   AND post-3DS. create-rep-request returns payment_intent_status
//   synchronously, but the actual rep_requests.status flip rides through here
//   in all cases. We do not flip inline in create-rep-request.
//
// Request body:
//   { rep_request_id: string (uuid) }
//
// Response (200, succeeded — row flipped):
//   {
//     ok: true,
//     rep_request_id: string,
//     status: 'new',
//     payment_intent_status: 'succeeded',
//     stripe_charge_id: string,
//     amount_cents: number,
//   }
//
// Response (200, processing — async PM, not yet captured):
//   {
//     ok: true,
//     rep_request_id: string,
//     status: 'pending_payment',
//     payment_intent_status: 'processing',
//     status_pending: true,
//   }
//
// Response (200, already-confirmed — row was flipped earlier by webhook
// backup-rail; this is the idempotent replay path):
//   {
//     ok: true,
//     rep_request_id: string,
//     status: <current rep_requests.status>,
//     payment_intent_status: 'succeeded',
//     stripe_charge_id: <id from row>,
//     replay: true,
//   }
//
// Response (409, requires_action — 3DS pending):
//   {
//     error: 'requires_action',
//     payment_intent_status: 'requires_action',
//     client_secret: string,  // echoed back so FE can call handleNextAction
//     hint: 'Call stripe.handleNextAction(client_secret), then re-invoke.',
//   }
//
// Response (409, requires_payment_method — last attempt failed, retry):
//   {
//     error: 'requires_payment_method',
//     payment_intent_status: 'requires_payment_method',
//     hint: 'Last confirm attempt failed; FE should re-collect a PM and retry.',
//   }
//
// Response (409, unacceptable status — canceled / unknown):
//   {
//     error: 'payment_intent_unacceptable_status',
//     payment_intent_status: <pi.status>,
//   }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

interface RequestBody {
  rep_request_id: string
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  if (typeof body.rep_request_id !== 'string' || !UUID_RE.test(body.rep_request_id)) {
    return jsonResponse(400, { error: 'invalid_rep_request_id' })
  }
  const repRequestId = body.rep_request_id

  // Lookup the rep_request row (service-role read — bypasses RLS). We perform
  // the ownership check ourselves below (homeowner_id === caller.id).
  const { data: rr, error: rrLookupErr } = await admin
    .from('rep_requests')
    .select('id, homeowner_id, status, stripe_payment_intent_id, stripe_charge_id, charge_status')
    .eq('id', repRequestId)
    .maybeSingle()

  if (rrLookupErr) {
    return jsonResponse(500, {
      error: 'rep_request_lookup_failed',
      detail: rrLookupErr.message,
    })
  }
  if (!rr) {
    return jsonResponse(404, { error: 'rep_request_not_found' })
  }

  // Ownership: only the homeowner who created the row may confirm. Admin
  // staff have other paths (admin sweep, refund); this fn is homeowner-only.
  if (rr.homeowner_id !== caller.id) {
    return jsonResponse(403, {
      error: 'rep_request_owner_mismatch',
      hint: 'Caller is not the rep_request homeowner.',
    })
  }

  if (!rr.stripe_payment_intent_id) {
    // create-rep-request inserts the row before PI.create. If PI.create failed
    // the row has no PI to confirm against — admin sweep cleans these up.
    return jsonResponse(409, {
      error: 'rep_request_missing_payment_intent',
      hint: 'create-rep-request did not stamp a PI (likely Stripe.create failed).',
    })
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-09-30.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  // Server-side re-read of the PaymentIntent (DO NOT trust client state).
  // Expand latest_charge so we can stamp stripe_charge_id without a second
  // round-trip on the success branch.
  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.retrieve(rr.stripe_payment_intent_id, {
      expand: ['latest_charge'],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(502, {
      error: 'stripe_payment_intent_retrieve_failed',
      detail: msg,
    })
  }

  // Status discrimination (4-state contract — kratos consolidation per
  // argus PR-5 non-blocking note).
  //
  //   succeeded            → flip pending_payment → new + charge_succeeded event
  //   requires_action      → 409 + client_secret echo (FE handleNextAction)
  //   processing           → 200 status_pending (async PM, e.g. ACH)
  //   requires_payment_method → 409 retry-required (last attempt failed)
  //   canceled / other     → 409 unacceptable_status
  switch (pi.status) {
    case 'succeeded': {
      // Pull charge_id from latest_charge (expanded). Stripe guarantees
      // succeeded PIs have a latest_charge.
      const latestCharge = pi.latest_charge as Stripe.Charge | string | null
      let chargeId: string | null = null
      if (typeof latestCharge === 'string') {
        chargeId = latestCharge
      } else if (latestCharge && typeof latestCharge === 'object') {
        chargeId = latestCharge.id
      }
      if (!chargeId) {
        return jsonResponse(500, {
          error: 'succeeded_pi_missing_latest_charge',
          detail: 'Stripe returned succeeded PI without latest_charge — unexpected.',
        })
      }

      // Idempotency guard — only flip if row currently pending_payment.
      // If a webhook backup-rail landed first (post CAPTURE-A2 fix), the row
      // is already 'new' and we no-op + emit a replay event.
      if (rr.status !== 'pending_payment') {
        await admin.from('rep_request_events').insert({
          rep_request_id: repRequestId,
          actor_id: caller.id,
          actor_role: 'homeowner',
          event_type: 'charge_succeeded',
          payload: {
            stripe_charge_id: chargeId,
            source: 'rep_request_payment_confirm',
            replay: true,
            status_at_event: rr.status,
          },
        })
        return jsonResponse(200, {
          ok: true,
          rep_request_id: repRequestId,
          status: rr.status,
          payment_intent_status: 'succeeded',
          stripe_charge_id: rr.stripe_charge_id ?? chargeId,
          replay: true,
        })
      }

      const nowIso = new Date().toISOString()
      const { error: updateErr } = await admin
        .from('rep_requests')
        .update({
          status: 'new',
          charge_status: 'charged',
          stripe_charge_id: chargeId,
          charged_at: nowIso,
        })
        .eq('id', repRequestId)
        .eq('status', 'pending_payment') // double-guard against concurrent webhook flip
      if (updateErr) {
        return jsonResponse(500, {
          error: 'rep_request_flip_failed',
          detail: updateErr.message,
        })
      }

      await admin.from('rep_request_events').insert({
        rep_request_id: repRequestId,
        actor_id: caller.id,
        actor_role: 'homeowner',
        event_type: 'charge_succeeded',
        from_status: 'pending_payment',
        to_status: 'new',
        payload: {
          stripe_charge_id: chargeId,
          amount_cents: pi.amount,
          source: 'rep_request_payment_confirm',
        },
      })

      return jsonResponse(200, {
        ok: true,
        rep_request_id: repRequestId,
        status: 'new',
        payment_intent_status: 'succeeded',
        stripe_charge_id: chargeId,
        amount_cents: pi.amount,
      })
    }

    case 'requires_action': {
      // 3DS challenge pending. FE must call stripe.handleNextAction with the
      // client_secret. We echo it back so FE doesn't have to round-trip through
      // create-rep-request to re-fetch it.
      return jsonResponse(409, {
        error: 'requires_action',
        payment_intent_status: 'requires_action',
        client_secret: pi.client_secret,
        hint: 'Call stripe.handleNextAction(client_secret), then re-invoke.',
      })
    }

    case 'processing': {
      // Async PM (e.g. ACH, BACS). PI will transition to succeeded/failed via
      // webhook later. We do NOT flip status yet — the row stays in
      // pending_payment and the FE shows a "processing" affordance.
      return jsonResponse(200, {
        ok: true,
        rep_request_id: repRequestId,
        status: 'pending_payment',
        payment_intent_status: 'processing',
        status_pending: true,
      })
    }

    case 'requires_payment_method': {
      // Last confirm attempt failed (declined / authentication_failed). PI is
      // still retriable — FE should re-collect a PM and re-confirm.
      return jsonResponse(409, {
        error: 'requires_payment_method',
        payment_intent_status: 'requires_payment_method',
        hint: 'Last confirm attempt failed; FE should re-collect a PM and retry.',
      })
    }

    default: {
      // canceled / requires_capture / requires_confirmation / unknown
      return jsonResponse(409, {
        error: 'payment_intent_unacceptable_status',
        payment_intent_status: pi.status,
      })
    }
  }
})
