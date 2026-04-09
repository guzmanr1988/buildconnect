import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { leadId, saleAmount } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Use the database function to close the sale
  const { data: saleId, error } = await supabase.rpc('close_lead_sale', {
    p_lead_id: leadId,
    p_sale_amount: saleAmount,
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }

  // TODO: Send commission due notification to vendor
  // TODO: Send sale confirmation to homeowner

  return new Response(JSON.stringify({ saleId }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
