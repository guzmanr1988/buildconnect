// cancel-rep-request edge fn — uniform $200 refund / $50 retained per Rod §11
// (locked 2026-06-25, kratos msg 1782350922607).
//
// SINGLE BRANCH — no feature-flag alt. The athena spec v1.1 §3 "Canonical
// refund branch" defines this fn:
//   1. Authenticate the caller; load their role.
//   2. Validate rep_request_id + look up current status.
//   3. Authorize per kratos cancel-RLS lock msg 1782351203119:
//        homeowner: allowed iff status IN (new, scheduled, visited, project_ready)
//                   AND homeowner_id = caller.id
//        admin/admin_employee: allowed iff status IN (new, scheduled, visited,
//                                                    project_ready, contractor_selected)
//        otherwise: 403
//   4. UPDATE rep_requests SET status='cancelled', charge_status='refund_pending',
//      cancelled_at=now(), cancelled_by=caller, cancellation_reason=payload.reason.
//      The cancel-transition-guard trigger (mig 101) validates the OLD->NEW
//      transition at DB level (defense-in-depth).
//   5. APPEND event_type=cancelled (from_status, to_status='cancelled',
//      actor_id, actor_role, payload={reason, refund_amount_cents: 20000,
//      retained_cents: 5000}).
//   6. If charge_status was 'charged' (money is actually on Stripe's side):
//        Stripe refunds.create({ charge: stripe_charge_id, amount: 20000,
//                                 idempotency_key: stripe_idempotency_key + '_cancel' }).
//        UPDATE rep_requests SET stripe_refund_id = re.id.
//        APPEND event_type=refund_issued (payload={stripe_refund_id,
//                                                  refund_amount_cents: 20000,
//                                                  retained_cents: 5000}).
//      charge.refunded webhook will later flip charge_status refund_pending→refunded.
//   7. If charge_status was 'not_charged' (rare — admin-cancel of an
//      offline-paid skip_charge row, or a never-completed-payment row):
//      no Stripe refund. Row goes straight to cancelled with charge_status
//      staying 'not_charged'.
//
// IDEMPOTENCY:
//   - Stripe refund call uses idempotency_key = stripe_idempotency_key + '_cancel'.
//     Replays return the same refund object; no double-refund risk.
//   - DB UPDATE is gated by the cancel-transition-guard trigger; replay of
//     this fn on an already-cancelled row would RAISE at the trigger and
//     return 409 from this fn.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import {
  CORS_HEADERS,
  REFUNDABLE_CENTS,
  RETAINED_CENTS,
  type RepRequestStatus,
} from '../_shared/rep-request/index.ts'

interface CancelPayload {
  rep_request_id: string
  reason?: string
}

const HOMEOWNER_CANCELLABLE: RepRequestStatus[] = [
  'new',
  'scheduled',
  'visited',
  'project_ready',
]
const ADMIN_CANCELLABLE: RepRequestStatus[] = [
  ...HOMEOWNER_CANCELLABLE,
  'contractor_selected',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const callerId = userData.user.id

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', callerId)
    .maybeSingle()
  if (!callerProfile) {
    return new Response(JSON.stringify({ error: 'profile_not_found' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const callerRole = callerProfile.role as string

  let payload: CancelPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  if (!payload.rep_request_id) {
    return new Response(JSON.stringify({ error: 'invalid_payload', detail: 'rep_request_id required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const { data: rr, error: rrErr } = await admin
    .from('rep_requests')
    .select('id, homeowner_id, status, charge_status, stripe_charge_id, stripe_idempotency_key')
    .eq('id', payload.rep_request_id)
    .maybeSingle()
  if (rrErr || !rr) {
    return new Response(JSON.stringify({ error: 'rep_request_not_found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const currentStatus = rr.status as RepRequestStatus

  // Authorization branch (kratos cancel-RLS lock msg 1782351203119).
  const isHomeowner = callerRole === 'homeowner' && rr.homeowner_id === callerId
  const isAdmin = callerRole === 'admin' || callerRole === 'admin_employee'

  if (!isHomeowner && !isAdmin) {
    return new Response(JSON.stringify({ error: 'forbidden_role' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const allowedOrigins = isAdmin ? ADMIN_CANCELLABLE : HOMEOWNER_CANCELLABLE
  if (!allowedOrigins.includes(currentStatus)) {
    return new Response(
      JSON.stringify({
        error: 'cancel_not_allowed_from_status',
        detail: `caller role=${callerRole} cannot cancel from status=${currentStatus}; allowed origins=${allowedOrigins.join(',')}`,
      }),
      {
        status: 409,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    )
  }

  const reason = payload.reason ?? null
  const nowIso = new Date().toISOString()
  const chargeStatusBefore = rr.charge_status as string
  const willRefund = chargeStatusBefore === 'charged' && !!rr.stripe_charge_id

  // UPDATE the row. cancel-transition-guard trigger validates OLD->NEW.
  const { error: updateErr } = await admin
    .from('rep_requests')
    .update({
      status: 'cancelled',
      cancelled_at: nowIso,
      cancelled_by: callerId,
      cancellation_reason: reason,
      charge_status: willRefund ? 'refund_pending' : chargeStatusBefore,
    })
    .eq('id', rr.id)

  if (updateErr) {
    console.error('rep_requests cancel update failed', updateErr.message)
    return new Response(JSON.stringify({ error: 'update_failed', detail: updateErr.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  await admin.from('rep_request_events').insert({
    rep_request_id: rr.id,
    actor_id: callerId,
    actor_role: callerRole,
    event_type: 'cancelled',
    from_status: currentStatus,
    to_status: 'cancelled',
    payload: {
      reason,
      refund_amount_cents: willRefund ? REFUNDABLE_CENTS : 0,
      retained_cents: willRefund ? RETAINED_CENTS : 0,
      will_refund: willRefund,
    },
  })

  // Fire the Stripe refund (uniform $200, retained $50 per Rod §11 Q3 lock).
  if (willRefund) {
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'stripe_not_configured' }), {
        status: 503,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })
    const refundIdempotencyKey = `${rr.stripe_idempotency_key}_cancel`

    let refund: Stripe.Refund
    try {
      refund = await stripe.refunds.create(
        {
          charge: rr.stripe_charge_id as string,
          amount: REFUNDABLE_CENTS,
          metadata: {
            rep_request_id: rr.id,
            cancelled_by: callerId,
            retained_cents: String(RETAINED_CENTS),
          },
        },
        { idempotencyKey: refundIdempotencyKey }
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('stripe refunds.create failed', msg)
      await admin.from('rep_request_events').insert({
        rep_request_id: rr.id,
        event_type: 'refund_failed',
        payload: { stripe_error: msg, stage: 'refunds.create' },
      })
      return new Response(
        JSON.stringify({ error: 'stripe_refund_failed', detail: msg }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      )
    }

    await admin
      .from('rep_requests')
      .update({ stripe_refund_id: refund.id })
      .eq('id', rr.id)

    await admin.from('rep_request_events').insert({
      rep_request_id: rr.id,
      event_type: 'refund_issued',
      payload: {
        stripe_refund_id: refund.id,
        refund_amount_cents: REFUNDABLE_CENTS,
        retained_cents: RETAINED_CENTS,
      },
    })
  }

  return new Response(
    JSON.stringify({
      rep_request_id: rr.id,
      status: 'cancelled',
      refund_issued: willRefund,
      refund_amount_cents: willRefund ? REFUNDABLE_CENTS : 0,
      retained_cents: willRefund ? RETAINED_CENTS : 0,
    }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  )
})
