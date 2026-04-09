import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { lead, vendorId } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Create the lead
  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({ ...lead, vendor_id: vendorId })
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }

  // TODO: Send notification to vendor via Twilio/SendGrid
  // TODO: Generate Project Pack PDF and upload to Supabase Storage

  return new Response(JSON.stringify({ lead: newLead }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
