// bank-webhook-handler — STUB Edge Function. Receives partner-bank
// webhook callbacks (approval, denial, terms-accepted). Dispatches to
// the active adapter's handleWebhook(). manual_referral has no webhook
// so this short-circuits 204 for that adapter.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (req) => {
  const enabled = Deno.env.get('FINANCING_ENABLED') === 'true'
  if (!enabled) {
    return new Response(
      JSON.stringify({ error: 'financing disabled', flag: 'FINANCING_ENABLED' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )
  }

  const bank = Deno.env.get('FINANCING_BANK') ?? 'manual_referral'
  if (bank === 'manual_referral') {
    return new Response(null, { status: 204 })
  }

  // TODO(phase-2-impl):
  //   1. verify webhook signature per adapter (HMAC headers vary by bank)
  //   2. parse body via adapter.handleWebhook()
  //   3. UPDATE customer_financing_applications with new status
  //   4. fire customer-notification (helios denial-financing-v1 template
  //      on denied; approval-financing-v1 on approved)

  const rawBody = await req.text()
  void rawBody // suppress unused until impl lands

  return new Response(
    JSON.stringify({ error: 'not implemented', stage: 'phase-2-stub', adapter: bank }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  )
})
