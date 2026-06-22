// stripe-connect-account-session-create Edge Function
// Flow-B (banking-flowb) — replaces the hosted-redirect onboarding with
// Stripe Connect Embedded Components (in-app KYC iframe).
//
// Mints a short-TTL AccountSession client_secret for the caller's
// Connected Account, scoped to two embedded components:
//   - account_onboarding   (KYC for not_connected / pending / restricted)
//   - account_management   ("Update Details" for active accounts)
//
// One session covers both components; the client mounts whichever the
// current state-machine state demands.
//
// Mirrors stripe-connect-onboarding's auth + escrow lookup/create logic.
// Does NOT mint AccountLink — that path stays available on the legacy fn
// for emergency rollback during the transition (M4 cleanup deletes it).
//
// Request:
//   POST { partyType: 'vendor' | 'homeowner' }
//
// Response (200):
//   { ok: true,
//     client_secret: string,    // mount via loadConnectAndInitialize
//     expires_at: number,       // ~1min from creation per Stripe
//     account_id: string,
//     status: 'pending_verification' | 'active' | 'restricted' | 'rejected',
//     created: boolean }        // true if escrow_accounts row was just created
//
// Flow:
//   1. Auth caller (Bearer JWT) → resolve auth.users.id
//   2. SELECT escrow_accounts WHERE party_id=caller AND party_type=partyType
//      a. If exists → reuse existing stripe_account_id
//      b. If absent → stripe.accounts.create + INSERT new escrow_accounts row
//   3. stripe.accountSessions.create({ account, components }) →
//      { client_secret, expires_at }
//   4. Return for client to pass to loadConnectAndInitialize({ fetchClientSecret })
//
// Test-mode readiness mirrors stripe-connect-onboarding: gates on
// STRIPE_SECRET_KEY non-empty, 503 stripe_not_configured otherwise.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

type RequestBody = {
  partyType: 'vendor' | 'homeowner'
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
      hint: 'Set STRIPE_SECRET_KEY via supabase secrets set (server-side, never client-side).',
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

  // Layer 1 — JWT verify
  const { data: userResult, error: getUserErr } = await admin.auth.getUser(token)
  if (getUserErr || !userResult?.user) {
    return jsonResponse(401, { error: 'invalid_or_expired_token' })
  }
  const caller = userResult.user
  const callerEmail = caller.email || ''
  if (!callerEmail) {
    return jsonResponse(400, { error: 'caller_email_missing' })
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }
  if (body.partyType !== 'vendor' && body.partyType !== 'homeowner') {
    return jsonResponse(400, { error: 'invalid_party_type' })
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-09-30.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  // Look up existing escrow_account for (party_type, caller.id)
  const { data: existing, error: lookupErr } = await admin
    .from('escrow_accounts')
    .select('id, stripe_account_id, status')
    .eq('party_type', body.partyType)
    .eq('party_id', caller.id)
    .maybeSingle()
  if (lookupErr) {
    return jsonResponse(500, { error: 'escrow_account_lookup_failed', detail: lookupErr.message })
  }

  let accountId: string
  let status: string
  let created = false

  if (existing?.stripe_account_id) {
    accountId = existing.stripe_account_id
    status = existing.status || 'pending_verification'
  } else {
    // Create path: new Connected Account on Stripe + DB row.
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: callerEmail,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          party_type: body.partyType,
          party_id: caller.id,
          buildconnect_origin: 'stripe-connect-account-session-create',
        },
      })
      accountId = account.id
      created = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse(502, { error: 'stripe_account_create_failed', detail: msg })
    }

    const { error: insertErr } = await admin
      .from('escrow_accounts')
      .insert({
        party_type: body.partyType,
        party_id: caller.id,
        stripe_account_id: accountId,
        status: 'pending_verification',
      })
    if (insertErr) {
      // Stripe account created but DB write failed; surface for operator.
      // Same recovery semantics as stripe-connect-onboarding insert path.
      return jsonResponse(500, {
        error: 'escrow_account_insert_failed_after_stripe_create',
        detail: insertErr.message,
        leaked_stripe_account_id: accountId,
      })
    }
    status = 'pending_verification'
  }

  // Mint AccountSession for embedded components.
  // external_account_collection=true lets the user attach a bank account
  // inside the onboarding iframe (required for payouts).
  try {
    const session = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
        account_management: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
      },
    })
    return jsonResponse(200, {
      ok: true,
      client_secret: session.client_secret,
      expires_at: session.expires_at,
      account_id: accountId,
      status,
      created,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(502, { error: 'stripe_account_session_create_failed', detail: msg })
  }
})
