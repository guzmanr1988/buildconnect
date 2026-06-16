// referral-invite Edge Function
// task_1781590755570_689 — Phase 2 referral-program email pipeline.
//
// Called by the homeowner Refer-a-Friend modal (iris) AFTER the referral row
// is persisted to referral_codes / referral_attributions. Sends a branded
// invitation email via Resend from the verified buildc.net domain.
//
// Ships LIVE per Rod: this is NOT flag-gated behind EMAILS_TRANSACTIONAL_ENABLED
// (that flag governs the financing approval/denial pipeline, a separate
// surface). Referral invites must deliver on first request so Rod can test
// end-to-end via real friend-email delivery.
//
// Brand-shell discipline: subject + HTML come from the SHARED
// _shared/emails/transactional-render.ts via renderEmail({ type: 'referral-invite' }).
// iris owns the copy slot; this fn owns the invoke contract + Resend POST.
// One source of brand truth.
//
// Request:
//   POST { friendEmail: string, friendName: string,
//          referrerName: string, referralId: string }
//
// Response (200):
//   { ok: true, id: string }   // id = Resend email-send id (auditable)
//
// Response (4xx/5xx):
//   { error: string, hint?: string }
//
// Env:
//   RESEND_API_KEY — full-access on buildc.net domain
//   RESEND_FROM    — defaults to 'BuildConnect <hello@buildc.net>'
//                    (override per env; must be on verified domain root)
//   PUBLIC_APP_URL — defaults to 'https://buildc.net'; signup CTA target

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { renderEmail } from '../_shared/emails/transactional-render.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'BuildConnect <hello@buildc.net>'
const DEFAULT_APP_URL = 'https://buildc.net'

type InvitePayload = {
  friendEmail: string
  friendName: string
  referrerName: string
  referralId: string
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function isValidEmail(s: unknown): boolean {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' })
  }

  const apiKey = Deno.env.get('RESEND_API_KEY') || ''
  if (!apiKey) {
    return jsonResponse(503, {
      error: 'resend_not_configured',
      hint: 'Set RESEND_API_KEY via supabase secrets set (server-side, never client-side).',
    })
  }

  let body: InvitePayload
  try {
    body = (await req.json()) as InvitePayload
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  if (!isValidEmail(body.friendEmail)) {
    return jsonResponse(400, { error: 'invalid_friend_email' })
  }
  if (typeof body.referralId !== 'string' || body.referralId.length === 0 || body.referralId.length > 128) {
    return jsonResponse(400, { error: 'invalid_referral_id' })
  }
  if (typeof body.referrerName !== 'string' || body.referrerName.length === 0 || body.referrerName.length > 128) {
    return jsonResponse(400, { error: 'invalid_referrer_name' })
  }
  if (typeof body.friendName !== 'string' || body.friendName.length > 128) {
    return jsonResponse(400, { error: 'invalid_friend_name' })
  }

  const appUrl = Deno.env.get('PUBLIC_APP_URL') || DEFAULT_APP_URL
  const signupUrl = `${appUrl}/signup?ref=${encodeURIComponent(body.referralId)}`

  const { subject, html } = renderEmail({
    type: 'referral-invite',
    data: {
      friendName: body.friendName || 'there',
      referrerName: body.referrerName,
      signupUrl,
    },
  })

  const from = Deno.env.get('RESEND_FROM') || DEFAULT_FROM

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: body.friendEmail, subject, html }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[referral-invite] resend error status=${res.status} body=${errBody}`)
    return jsonResponse(502, { error: 'resend_send_failed', status: res.status })
  }

  const { id } = (await res.json()) as { id: string }
  console.log(`[referral-invite] sent to=${body.friendEmail} referralId=${body.referralId} id=${id}`)
  return jsonResponse(200, { ok: true, id })
})
