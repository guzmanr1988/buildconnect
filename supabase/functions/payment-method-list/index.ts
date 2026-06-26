// payment-method-list Edge Function
// Tier-1 cards-on-file — list saved PMs for the authenticated caller.
//
// REQUEST:
//   POST {
//     purpose?: 'service_pay_in' | 'membership' | 'commissions' | 'both' (filter)
//   }
//
// SEMANTICS:
//   1. Verify Bearer JWT.
//   2. SELECT from public.payment_methods WHERE user_id = caller.id
//      [AND purpose = body.purpose if provided] AND status = 'active'.
//   3. Augment each row with `is_default` by reading
//      stripe.customers.retrieve(customer).invoice_settings.default_payment_method
//      and comparing against stripe_payment_method_id.
//
// RESPONSE (200):
//   { ok: true, payment_methods: [
//     { id, kind, brand, last4, exp_month, exp_year, bank_name, routing_last4,
//       purpose, status, is_default, created_at }
//   ] }
//
// ERRORS: missing_bearer_token | invalid_or_expired_token | invalid_purpose
//
// COMPLIANCE: read-only, no DML; safe to call repeatedly from Step 3 mount.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.177.0'

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

const ALLOWED_PURPOSES = new Set(['service_pay_in', 'membership', 'commissions', 'both'])

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, code: 'method_not_allowed', error: 'POST only' })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) {
    return jsonResponse(401, { ok: false, code: 'missing_bearer_token', error: 'Authorization Bearer required' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })

  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { ok: false, code: 'invalid_or_expired_token', error: 'JWT verify failed' })
  }
  const caller = userResult.user

  let filterPurpose: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.purpose) {
      if (!ALLOWED_PURPOSES.has(body.purpose)) {
        return jsonResponse(400, { ok: false, code: 'invalid_purpose', error: 'Unknown purpose' })
      }
      filterPurpose = body.purpose
    }
  } catch { /* empty body OK */ }

  let query = admin
    .from('payment_methods')
    .select('id, kind, brand, last4, exp_month, exp_year, bank_name, routing_last4, purpose, status, stripe_customer_id, stripe_payment_method_id, created_at')
    .eq('user_id', caller.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (filterPurpose) query = query.eq('purpose', filterPurpose)

  const { data: rows, error: selErr } = await query
  if (selErr) {
    return jsonResponse(500, { ok: false, code: 'payment_methods_query_failed', error: selErr.message })
  }
  if (!rows || rows.length === 0) {
    return jsonResponse(200, { ok: true, payment_methods: [] })
  }

  const customerIds = Array.from(new Set(rows.map(r => r.stripe_customer_id)))
  const defaultPMByCustomer: Record<string, string | null> = {}
  for (const cid of customerIds) {
    try {
      const customer = await stripe.customers.retrieve(cid)
      if (!customer.deleted) {
        defaultPMByCustomer[cid] =
          (customer.invoice_settings?.default_payment_method as string | null) ?? null
      }
    } catch { defaultPMByCustomer[cid] = null }
  }

  const payment_methods = rows.map(r => ({
    id: r.id,
    kind: r.kind,
    brand: r.brand,
    last4: r.last4,
    exp_month: r.exp_month,
    exp_year: r.exp_year,
    bank_name: r.bank_name,
    routing_last4: r.routing_last4,
    purpose: r.purpose,
    status: r.status,
    is_default: defaultPMByCustomer[r.stripe_customer_id] === r.stripe_payment_method_id,
    created_at: r.created_at,
  }))

  return jsonResponse(200, { ok: true, payment_methods })
})
