// payment-method-set-default Edge Function
// Tier-1 cards-on-file — set a saved PM as the customer default.
//
// REQUEST: POST { payment_method_id: <public.payment_methods.id> (uuid) }
//
// SEMANTICS:
//   1. Verify Bearer JWT.
//   2. Look up the PM row by uuid + owner check (user_id == caller.id, status='active').
//   3. Call stripe.customers.update(stripe_customer_id, {
//        invoice_settings: { default_payment_method: stripe_payment_method_id }
//      }).
//   4. Return { ok: true, default_payment_method_id }.
//
// COMPLIANCE: Stripe is the source of truth for default-PM; we don't mirror
// the default flag in our DB to avoid drift. The list fn computes is_default
// at read time by retrieving customer.invoice_settings.

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

  let body: { payment_method_id?: string }
  try { body = await req.json() } catch {
    return jsonResponse(400, { ok: false, code: 'invalid_json_body', error: 'Body must be valid JSON' })
  }
  if (typeof body.payment_method_id !== 'string' || body.payment_method_id.length < 8) {
    return jsonResponse(400, { ok: false, code: 'invalid_payment_method_id', error: 'payment_method_id required' })
  }

  const { data: pmRow, error: lookupErr } = await admin
    .from('payment_methods')
    .select('id, user_id, stripe_customer_id, stripe_payment_method_id, status')
    .eq('id', body.payment_method_id)
    .maybeSingle()
  if (lookupErr) {
    return jsonResponse(500, { ok: false, code: 'lookup_failed', error: lookupErr.message })
  }
  if (!pmRow || pmRow.user_id !== caller.id) {
    return jsonResponse(404, { ok: false, code: 'payment_method_not_found', error: 'No PM with that id under caller' })
  }
  if (pmRow.status !== 'active') {
    return jsonResponse(400, { ok: false, code: 'payment_method_inactive', error: `status=${pmRow.status}` })
  }

  try {
    await stripe.customers.update(pmRow.stripe_customer_id, {
      invoice_settings: { default_payment_method: pmRow.stripe_payment_method_id },
    })
    return jsonResponse(200, { ok: true, default_payment_method_id: pmRow.stripe_payment_method_id })
  } catch (e) {
    return jsonResponse(500, { ok: false, code: 'stripe_set_default_failed', error: (e as Error).message })
  }
})
