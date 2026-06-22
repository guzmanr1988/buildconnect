// stripe-connect-refresh Edge Function
// Phase 2 of stripe-connect-preview track — task_1781574203261_132 directive #1.
//
// Mints a fresh AccountLink for an existing Connected Account when the prior
// onboarding link has expired (Stripe AccountLinks have a short TTL — ~30min).
// Called by client when Stripe redirects to the configured refresh_url, or
// when the user returns to the Banking square after the onboarding link has
// timed out.
//
// Pattern: same auth layers as stripe-connect-onboarding; only difference is
// this function REQUIRES an existing escrow_account row (no Stripe account
// creation here). If no row exists, returns 404 — caller should hit
// stripe-connect-onboarding instead.
//
// Request:
//   POST { partyType: 'vendor' | 'homeowner', returnUrl: string, refreshUrl: string }
//
// Response (200):
//   { ok: true, accountId: string, url: string, expiresAt: number,
//     status: 'pending_verification' | 'active' | 'restricted' | 'rejected' }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

type ActionBody = {
  partyType: 'vendor' | 'homeowner'
  returnUrl: string
  refreshUrl: string
}

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

function isValidHttpsUrl(s: unknown): boolean {
  if (typeof s !== 'string') return false
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' })
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  if (!stripeKey) {
    return jsonResponse(503, {
      error: 'stripe_not_configured',
      hint: 'Set STRIPE_SECRET_KEY via supabase secrets set.',
    })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) {
    return jsonResponse(401, { error: 'missing_bearer_token' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { error: 'invalid_or_expired_token' })
  }
  const caller = userResult.user

  let body: ActionBody
  try {
    body = (await req.json()) as ActionBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }
  if (body.partyType !== 'vendor' && body.partyType !== 'homeowner') {
    return jsonResponse(400, { error: 'invalid_party_type' })
  }
  if (!isValidHttpsUrl(body.returnUrl) || !isValidHttpsUrl(body.refreshUrl)) {
    return jsonResponse(400, { error: 'invalid_return_or_refresh_url' })
  }

  // Look up existing account — must exist for refresh.
  const { data: existing, error: lookupErr } = await admin
    .from('escrow_accounts')
    .select('stripe_account_id, status')
    .eq('party_type', body.partyType)
    .eq('party_id', caller.id)
    .maybeSingle()
  if (lookupErr) {
    return jsonResponse(500, { error: 'escrow_account_lookup_failed', detail: lookupErr.message })
  }
  if (!existing?.stripe_account_id) {
    return jsonResponse(404, {
      error: 'no_existing_connected_account',
      hint: 'Call stripe-connect-onboarding first to create the account.',
    })
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-09-30.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  try {
    const link = await stripe.accountLinks.create({
      account: existing.stripe_account_id,
      refresh_url: body.refreshUrl,
      return_url: body.returnUrl,
      type: 'account_onboarding',
    })
    return jsonResponse(200, {
      ok: true,
      accountId: existing.stripe_account_id,
      url: link.url,
      expiresAt: link.expires_at,
      status: existing.status,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(502, { error: 'stripe_account_link_create_failed', detail: msg })
  }
})
