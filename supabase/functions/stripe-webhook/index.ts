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
