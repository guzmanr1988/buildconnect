// stripe-connect-onboarding Edge Function
// Phase 2 of stripe-connect-preview track — task_1781574203261_132 directive #1.
//
// Creates a Stripe Connect Express Connected Account for the calling user
// (vendor or homeowner), persists the stripe_account_id to escrow_accounts,
// and returns a short-TTL AccountLink URL for hosted Stripe onboarding.
//
// Pattern: mirrors admin-create-approval auth layers + stripe-webhook env
// reads. Express + US-only + test-mode-only per kratos Phase 1 scope-approval
// (msg 1781569611114-kratos-rt7wo); same defaults documented in
// src/lib/financing/escrow/constants.ts.
//
// Request:
//   POST { action: 'create-or-link', partyType: 'vendor' | 'homeowner',
//          returnUrl: string, refreshUrl: string,
//          businessName?: string  // optional, vendor onboarding pre-fill
//        }
//
// Response (200):
//   { ok: true, accountId: string, url: string, expiresAt: number,
//     status: 'pending_verification' | 'active' | 'restricted' | 'rejected',
//     created: boolean  // true if account just created, false if re-link }
//
// Flow:
//   1. Auth caller (Bearer JWT) → resolve auth.users.id
//   2. SELECT escrow_accounts WHERE party_id=caller AND party_type=partyType
//      a. If exists + status='active' → 200 with account_already_active flag
//         (UI can decide whether to surface a re-link button)
//      b. If exists + status != 'active' → create new AccountLink only (refresh)
//      c. If absent → stripe.accounts.create + INSERT + create AccountLink
//   3. Return { url, expiresAt } for client redirect to Stripe-hosted onboarding
//
// Test-mode readiness:
//   STRIPE_SECRET_KEY env var resolved via `supabase secrets set`. Function
//   gates on the var being non-empty and returns 503 stripe_not_configured
//   if missing. No live API calls fire until the key lands.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

type ActionBody = {
  action: 'create-or-link'
  partyType: 'vendor' | 'homeowner'
  returnUrl: string
  refreshUrl: string
  businessName?: string
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
    return u.protocol === 'https:' || u.protocol === 'http:' // localhost dev
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
    // Test-mode readiness: function ships callable but inert until the key
    // lands via `supabase secrets set STRIPE_SECRET_KEY=sk_test_…`.
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

  // Parse + validate body
  let body: ActionBody
  try {
    body = (await req.json()) as ActionBody
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }
  if (body.action !== 'create-or-link') {
    return jsonResponse(400, { error: 'unknown_action' })
  }
  if (body.partyType !== 'vendor' && body.partyType !== 'homeowner') {
    return jsonResponse(400, { error: 'invalid_party_type' })
  }
  if (!isValidHttpsUrl(body.returnUrl) || !isValidHttpsUrl(body.refreshUrl)) {
    return jsonResponse(400, { error: 'invalid_return_or_refresh_url' })
  }

  // Phase 2 self-authorization check: caller authorizes onboarding for THEIR
  // OWN party slot only. Admin-initiated onboarding for a different party
  // would go through a separate admin-only function (not built in v1).

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-09-30.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  // Look up existing escrow_account for (party_type, caller.id)
  const { data: existing, error: lookupErr } = await admin
    .from('escrow_accounts')
    .select('id, stripe_account_id, status, charges_enabled, payouts_enabled')
    .eq('party_type', body.partyType)
    .eq('party_id', caller.id)
    .maybeSingle()
  if (lookupErr) {
    return jsonResponse(500, { error: 'escrow_account_lookup_failed', detail: lookupErr.message })
  }

  let accountId: string
  let created = false

  if (existing?.stripe_account_id) {
    // Re-link path: account already exists; just mint a fresh AccountLink.
    accountId = existing.stripe_account_id

    if (existing.status === 'active') {
      // Already onboarded; surface that to client. UI can decide whether to
      // open the dashboard link instead of the onboarding link.
      try {
        const link = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: body.refreshUrl,
          return_url: body.returnUrl,
          type: 'account_onboarding',
        })
        return jsonResponse(200, {
          ok: true,
          accountId,
          url: link.url,
          expiresAt: link.expires_at,
          status: existing.status,
          created: false,
          accountAlreadyActive: true,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return jsonResponse(502, { error: 'stripe_account_link_create_failed', detail: msg })
      }
    }
  } else {
    // Create path: new Connected Account on Stripe + DB row.
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US', // kratos default — US-only preview
        email: callerEmail,
        capabilities: {
          transfers: { requested: true },
        },
        business_profile: body.businessName
          ? { name: body.businessName }
          : undefined,
        metadata: {
          party_type: body.partyType,
          party_id: caller.id,
          buildconnect_origin: 'stripe-connect-onboarding',
        },
      })
      accountId = account.id
      created = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse(502, { error: 'stripe_account_create_failed', detail: msg })
    }

    // Persist to escrow_accounts. Status starts 'pending_verification' per
    // migration 069 default; account.updated webhook will flip to 'active'
    // once Stripe finishes verification.
    const { error: insertErr } = await admin
      .from('escrow_accounts')
      .insert({
        party_type: body.partyType,
        party_id: caller.id,
        stripe_account_id: accountId,
        status: 'pending_verification',
      })
    if (insertErr) {
      // Stripe account already created but DB write failed. Don't try to
      // delete the Stripe account — it's recoverable on retry (lookup will
      // see the row missing and try insert again; Stripe account create on
      // the same email could 409 or create duplicate, but Express accounts
      // can have multiple per merchant identity, so safer to leave + alert).
      // Surface the leak in the error so an operator can investigate.
      return jsonResponse(500, {
        error: 'escrow_account_insert_failed_after_stripe_create',
        detail: insertErr.message,
        leaked_stripe_account_id: accountId,
      })
    }
  }

  // Mint AccountLink for hosted onboarding (or re-link if non-active).
  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: body.refreshUrl,
      return_url: body.returnUrl,
      type: 'account_onboarding',
    })
    return jsonResponse(200, {
      ok: true,
      accountId,
      url: link.url,
      expiresAt: link.expires_at,
      status: existing?.status || 'pending_verification',
      created,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(502, { error: 'stripe_account_link_create_failed', detail: msg })
  }
})
