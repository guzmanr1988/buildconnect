// create-rep-request-on-behalf edge fn — admin chokepoint path.
//
// Mirrors the stripe-setup-intent-create admin-create pattern from migration
// 095 (admin acts as a service-role-trusted caller; the homeowner_id is the
// TARGET, not the caller). Used when an admin / admin_employee submits a rep
// request on behalf of a homeowner — distinguishable from self-submit by
// (created_by != homeowner_id) on the resulting row.
//
// FLOW:
//   1. Authenticate the caller from JWT; require role IN (admin, admin_employee).
//   2. Validate payload — same shape as create-rep-request PLUS homeowner_id
//      (the target homeowner) PLUS optional skip_charge flag (admin-only escape
//      hatch for offline-paid arrangements — sets status='new' directly and
//      skips Stripe PI.create). Default: charge as normal.
//   3. Derive service_tz, expand visit_window_picks (same as self-submit).
//   4. INSERT rep_requests row with homeowner_id=target, created_by=caller,
//      status=pending_payment (or 'new' if skip_charge=true).
//   5. APPEND event_type=created (actor_id=caller, actor_role=admin/_employee,
//      payload={source: 'admin_on_behalf', address_zip, skip_charge}).
//   6. If skip_charge: skip Stripe PI; return rep_request_id only.
//      Else: Stripe PI.create + UPDATE pi.id + APPEND charge_attempted.
//   7. Return { rep_request_id, client_secret? } — admin may hand client_secret
//      to homeowner via separate FE flow for completion.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import {
  CORS_HEADERS,
  STATE_TO_TZ,
  VISIT_FEE_CENTS,
  bucketToWindow,
  type VisitWindowBucket,
} from '../_shared/rep-request/index.ts'

interface CreateOnBehalfPayload {
  homeowner_id: string
  address: {
    line1: string
    line2?: string | null
    city: string
    state: string
    zip: string
  }
  contact_phone: string
  visit_window_picks: Array<{
    bucket: VisitWindowBucket
    iso_date: string
  }>
  description?: string
  access_notes?: string
  skip_charge?: boolean
}

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
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) {
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

  const { data: callerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', callerId)
    .maybeSingle()
  if (profileErr || !callerProfile) {
    return new Response(JSON.stringify({ error: 'profile_not_found' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  if (!['admin', 'admin_employee'].includes(callerProfile.role as string)) {
    return new Response(JSON.stringify({ error: 'forbidden_role', detail: 'admin/admin_employee only' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let payload: CreateOnBehalfPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const { homeowner_id, address, contact_phone, visit_window_picks, skip_charge } = payload
  if (
    !homeowner_id ||
    !address || !address.line1 || !address.city || !address.state || !address.zip ||
    !contact_phone ||
    !Array.isArray(visit_window_picks) || visit_window_picks.length === 0
  ) {
    return new Response(JSON.stringify({ error: 'invalid_payload' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Target homeowner role check (trigger will also enforce this, but explicit
  // 400 with detail is more debuggable for admins than a generic 500).
  const { data: targetProfile, error: targetErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', homeowner_id)
    .maybeSingle()
  if (targetErr || !targetProfile) {
    return new Response(JSON.stringify({ error: 'homeowner_not_found' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  if (targetProfile.role !== 'homeowner') {
    return new Response(JSON.stringify({ error: 'target_not_homeowner', detail: `target role=${targetProfile.role}` }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const serviceTz = STATE_TO_TZ[address.state.toUpperCase()]
  if (!serviceTz) {
    return new Response(JSON.stringify({ error: 'unsupported_state' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const requestedWindows = []
  for (const pick of visit_window_picks) {
    const window = bucketToWindow(pick.bucket, pick.iso_date, serviceTz)
    if (!window) {
      return new Response(JSON.stringify({ error: 'invalid_visit_window', detail: `bucket=${pick.bucket} date=${pick.iso_date}` }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    requestedWindows.push({
      window_start_utc: window.window_start_utc,
      window_end_utc: window.window_end_utc,
      service_tz: serviceTz,
      bucket_label: pick.bucket,
    })
  }

  // INSERT with the chosen status. skip_charge=true short-circuits the Stripe
  // path entirely — useful for offline-paid arrangements but should be rare
  // and audited.
  const initialStatus = skip_charge ? 'new' : 'pending_payment'
  const initialChargeStatus = skip_charge ? 'not_charged' : 'not_charged'

  const { data: inserted, error: insertErr } = await admin
    .from('rep_requests')
    .insert({
      homeowner_id,
      created_by: callerId,
      address,
      contact_phone,
      requested_visit_times: requestedWindows,
      description: payload.description ?? null,
      access_notes: payload.access_notes ?? null,
      status: initialStatus,
      charge_status: initialChargeStatus,
    })
    .select('id, stripe_idempotency_key')
    .single()

  if (insertErr || !inserted) {
    console.error('rep_requests insert (on_behalf) failed', insertErr?.message)
    return new Response(JSON.stringify({ error: 'insert_failed', detail: insertErr?.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const repRequestId = inserted.id as string
  const idempotencyKey = inserted.stripe_idempotency_key as string

  await admin.from('rep_request_events').insert({
    rep_request_id: repRequestId,
    actor_id: callerId,
    actor_role: callerProfile.role,
    event_type: 'created',
    payload: {
      source: 'admin_on_behalf',
      address_zip: address.zip,
      skip_charge: !!skip_charge,
      target_homeowner_id: homeowner_id,
    },
  })

  if (skip_charge) {
    // Offline-paid; no Stripe PI created. Status starts at 'new' (charge
    // wasn't part of the flow). admin assumes responsibility for any
    // money side-channel reconciliation.
    return new Response(
      JSON.stringify({
        rep_request_id: repRequestId,
        client_secret: null,
        amount_cents: 0,
        skip_charge: true,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'stripe_not_configured' }), {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })

  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount: VISIT_FEE_CENTS,
        currency: 'usd',
        capture_method: 'automatic',
        description: 'BuildConnect Concierge — Rep Visit (admin-created)',
        metadata: {
          rep_request_id: repRequestId,
          homeowner_id,
          created_by: callerId,
        },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('stripe paymentIntents.create (on_behalf) failed', msg)
    await admin.from('rep_request_events').insert({
      rep_request_id: repRequestId,
      event_type: 'charge_failed',
      payload: { stripe_error: msg, stage: 'paymentIntents.create' },
    })
    return new Response(JSON.stringify({ error: 'stripe_create_failed', detail: msg }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  await admin
    .from('rep_requests')
    .update({ stripe_payment_intent_id: pi.id })
    .eq('id', repRequestId)

  await admin.from('rep_request_events').insert({
    rep_request_id: repRequestId,
    event_type: 'charge_attempted',
    payload: {
      stripe_payment_intent_id: pi.id,
      idempotency_key: idempotencyKey,
      amount_cents: VISIT_FEE_CENTS,
      created_by: callerId,
    },
  })

  return new Response(
    JSON.stringify({
      rep_request_id: repRequestId,
      client_secret: pi.client_secret,
      amount_cents: VISIT_FEE_CENTS,
    }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  )
})
