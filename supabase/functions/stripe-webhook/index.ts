import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

// Derive escrow_accounts.status from a Stripe account.updated payload.
// Mirrors the state machine in src/lib/financing/escrow/constants.ts —
// stripe-side facts → DB status enum the FE reads via useConnectAccount.
//   active               charges + payouts both enabled, no disabled_reason
//   rejected             disabled_reason starts with 'rejected.'
//   restricted           any other disabled_reason set (listed / under_review /
//                        platform_paused / requirements.* past_due, etc.)
//   pending_verification onboarding in flight (default)
function deriveStatus(account: {
  charges_enabled?: boolean
  payouts_enabled?: boolean
  requirements?: { disabled_reason?: string | null } | null
}): 'pending_verification' | 'active' | 'restricted' | 'rejected' {
  const disabled = account.requirements?.disabled_reason ?? null
  if (disabled && disabled.startsWith('rejected.')) return 'rejected'
  if (disabled) return 'restricted'
  if (account.charges_enabled && account.payouts_enabled) return 'active'
  return 'pending_verification'
}

serve(async (req) => {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  // Signature verification — anything mutating escrow_accounts (status /
  // charges_enabled / payouts_enabled) MUST be proven to come from Stripe.
  // constructEventAsync uses Web Crypto (Deno-compatible); the sync variant
  // requires Node crypto and will not run here. Reject on missing header,
  // missing secrets, or signature mismatch — never fall through to parse.
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
  if (!stripeKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: 'stripe_not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!sig) {
    return new Response(JSON.stringify({ error: 'missing_stripe_signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('stripe webhook signature verification failed', msg)
    return new Response(JSON.stringify({ error: 'invalid_signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  switch (event.type) {
    // ─── BuildConnect Concierge Rep Request handlers ───
    // These four events handle the $250 visit-fee lifecycle (insert-pending-
    // payment → charge → optional refund). Matching rows are located by
    // metadata.rep_request_id (preferred) with fallback to charge_id /
    // payment_intent_id for refund events.

    case 'charge.succeeded': {
      // Flip pending_payment → new + stamp charge_id + charge_status=charged.
      const charge = event.data.object as Stripe.Charge & {
        metadata?: Record<string, string> | null
      }
      const repRequestId = charge.metadata?.rep_request_id
      if (!repRequestId) break

      const nowIso = new Date().toISOString()
      const { data: rr, error: rrLookupErr } = await supabase
        .from('rep_requests')
        .select('id, status')
        .eq('id', repRequestId)
        .maybeSingle()
      if (rrLookupErr || !rr) {
        console.warn('charge.succeeded for unknown rep_request_id', repRequestId)
        break
      }
      if (rr.status !== 'pending_payment') {
        // Already advanced (replay) — skip the flip but still log forensically.
        await supabase.from('rep_request_events').insert({
          rep_request_id: repRequestId,
          event_type: 'charge_succeeded',
          payload: {
            stripe_charge_id: charge.id,
            replay: true,
            status_at_event: rr.status,
          },
        })
        break
      }

      await supabase
        .from('rep_requests')
        .update({
          status: 'new',
          charge_status: 'charged',
          stripe_charge_id: charge.id,
          charged_at: nowIso,
        })
        .eq('id', repRequestId)

      await supabase.from('rep_request_events').insert({
        rep_request_id: repRequestId,
        event_type: 'charge_succeeded',
        from_status: 'pending_payment',
        to_status: 'new',
        payload: {
          stripe_charge_id: charge.id,
          amount_cents: charge.amount,
        },
      })
      break
    }

    case 'charge.failed': {
      // Flip pending_payment → charge_failed (terminal). No money moved.
      const charge = event.data.object as Stripe.Charge & {
        metadata?: Record<string, string> | null
      }
      const repRequestId = charge.metadata?.rep_request_id
      if (!repRequestId) break

      const { data: rr } = await supabase
        .from('rep_requests')
        .select('id, status')
        .eq('id', repRequestId)
        .maybeSingle()
      if (!rr) break
      if (rr.status !== 'pending_payment') {
        // Replay or out-of-order; just append the event.
        await supabase.from('rep_request_events').insert({
          rep_request_id: repRequestId,
          event_type: 'charge_failed',
          payload: {
            stripe_charge_id: charge.id,
            failure_code: charge.failure_code,
            failure_message: charge.failure_message,
            replay: true,
            status_at_event: rr.status,
          },
        })
        break
      }

      await supabase
        .from('rep_requests')
        .update({
          status: 'charge_failed',
          charge_status: 'not_charged',
          stripe_charge_id: charge.id,
        })
        .eq('id', repRequestId)

      await supabase.from('rep_request_events').insert({
        rep_request_id: repRequestId,
        event_type: 'charge_failed',
        from_status: 'pending_payment',
        to_status: 'charge_failed',
        payload: {
          stripe_charge_id: charge.id,
          failure_code: charge.failure_code,
          failure_message: charge.failure_message,
        },
      })
      break
    }

    case 'charge.refunded': {
      // The cancel-rep-request edge fn already flipped status=cancelled +
      // charge_status=refund_pending + stamped stripe_refund_id. This webhook
      // just flips charge_status refund_pending → refunded + stamps refunded_at.
      const charge = event.data.object as Stripe.Charge & {
        metadata?: Record<string, string> | null
      }
      // Prefer metadata.rep_request_id; fall back to stripe_charge_id lookup.
      let repRequestId = charge.metadata?.rep_request_id
      if (!repRequestId) {
        const { data: viaCharge } = await supabase
          .from('rep_requests')
          .select('id')
          .eq('stripe_charge_id', charge.id)
          .maybeSingle()
        if (viaCharge) repRequestId = viaCharge.id
      }
      if (!repRequestId) {
        console.warn('charge.refunded could not resolve rep_request_id', charge.id)
        break
      }

      const nowIso = new Date().toISOString()
      await supabase
        .from('rep_requests')
        .update({
          charge_status: 'refunded',
          refunded_at: nowIso,
        })
        .eq('id', repRequestId)

      // Stripe attaches the refund to charge.refunds.data[]; pick the latest.
      const latestRefund = charge.refunds?.data?.[0]
      await supabase.from('rep_request_events').insert({
        rep_request_id: repRequestId,
        event_type: 'refund_succeeded',
        payload: {
          stripe_charge_id: charge.id,
          stripe_refund_id: latestRefund?.id ?? null,
          amount_refunded_cents: charge.amount_refunded,
        },
      })
      break
    }

    case 'refund.failed': {
      // Stripe refund attempt failed post-acceptance. The cancel-rep-request
      // edge fn already set charge_status=refund_pending; we leave the status
      // there (admin manual intervention required) and log the failure.
      const refund = event.data.object as Stripe.Refund & {
        metadata?: Record<string, string> | null
      }
      let repRequestId = refund.metadata?.rep_request_id as string | undefined
      if (!repRequestId && refund.charge) {
        const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge.id
        const { data: viaCharge } = await supabase
          .from('rep_requests')
          .select('id')
          .eq('stripe_charge_id', chargeId)
          .maybeSingle()
        if (viaCharge) repRequestId = viaCharge.id
      }
      if (!repRequestId) {
        console.warn('refund.failed could not resolve rep_request_id', refund.id)
        break
      }

      await supabase.from('rep_request_events').insert({
        rep_request_id: repRequestId,
        event_type: 'refund_failed',
        payload: {
          stripe_refund_id: refund.id,
          failure_reason: refund.failure_reason,
          status: refund.status,
        },
      })
      break
    }

    case 'invoice.paid': {
      // Record subscription payment
      const invoice = event.data.object as Stripe.Invoice & {
        metadata?: Record<string, string> | null
        customer_name?: string | null
      }
      const vendorId = invoice.metadata?.vendor_id
      if (vendorId) {
        await supabase.from('transactions').insert({
          type: 'membership',
          vendor_id: vendorId,
          company: invoice.customer_name || '',
          detail: 'Monthly Subscription',
          amount: (invoice.amount_paid ?? 0) / 100,
          status: 'paid',
        })
      }
      break
    }
    case 'invoice.payment_failed': {
      // TODO: Handle failed payment — notify vendor, update status
      break
    }
    case 'account.updated': {
      // Stripe Connect account state change. Flip escrow_accounts row
      // to track charges/payouts/requirements + derived status. Onboarded_at
      // stamps on first transition to 'active' and is left alone after.
      const account = event.data.object as Stripe.Account
      if (!account?.id) break

      const status = deriveStatus(account)
      const chargesEnabled = !!account.charges_enabled
      const payoutsEnabled = !!account.payouts_enabled

      // Persist the full requirements blob (not just status) — currently_due
      // and disabled_reason are the load-bearing pieces for both the UI
      // recovery path (re-link button) and operator triage.
      const requirements = account.requirements
        ? {
            currently_due: account.requirements.currently_due ?? [],
            past_due: account.requirements.past_due ?? [],
            eventually_due: account.requirements.eventually_due ?? [],
            pending_verification: account.requirements.pending_verification ?? [],
            disabled_reason: account.requirements.disabled_reason ?? null,
          }
        : null

      // Look up the existing row first so we can decide onboarded_at —
      // first transition to 'active' stamps; subsequent updates leave it.
      const { data: existing, error: lookupErr } = await supabase
        .from('escrow_accounts')
        .select('id, status, onboarded_at')
        .eq('stripe_account_id', account.id)
        .maybeSingle()

      if (lookupErr) {
        console.error('escrow_accounts lookup failed', lookupErr.message)
        break
      }
      if (!existing) {
        // No row for this stripe_account_id — onboarding flow never
        // persisted it, or the event is for an account we didn't create.
        // Don't manufacture a row here; the create path owns insertion.
        console.warn('account.updated received for unknown stripe_account_id', account.id)
        break
      }

      const onboardedAt =
        existing.onboarded_at ?? (status === 'active' ? new Date().toISOString() : null)

      const { error: updateErr } = await supabase
        .from('escrow_accounts')
        .update({
          charges_enabled: chargesEnabled,
          payouts_enabled: payoutsEnabled,
          requirements,
          status,
          onboarded_at: onboardedAt,
        })
        .eq('id', existing.id)

      if (updateErr) {
        console.error('escrow_accounts update failed', updateErr.message)
      }
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
