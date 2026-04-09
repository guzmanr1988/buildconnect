import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  // TODO: Verify Stripe webhook signature
  // const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
  // const event = stripe.webhooks.constructEvent(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!)

  const event = JSON.parse(body)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  switch (event.type) {
    case 'invoice.paid': {
      // Record subscription payment
      const vendorId = event.data.object.metadata?.vendor_id
      if (vendorId) {
        await supabase.from('transactions').insert({
          type: 'membership',
          vendor_id: vendorId,
          company: event.data.object.customer_name || '',
          detail: 'Monthly Subscription',
          amount: event.data.object.amount_paid / 100,
          status: 'paid',
        })
      }
      break
    }
    case 'invoice.payment_failed': {
      // TODO: Handle failed payment — notify vendor, update status
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
