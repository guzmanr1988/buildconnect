// BuildConnect transactional email sender.
// Flag-gated Resend wrapper around iris's renderEmail() contract.
//
// Flag: EMAILS_TRANSACTIONAL_ENABLED (default 'false' = park, log-only, no send).
// Flip to 'true' ONLY during the coordinated launch flip, after Rod approves
// the daedalus preview at src/lib/emails/preview/index.html and the ONE
// test email to guzmanr@buildc.net lands in the inbox as expected.
//
// Env required for live send (irrelevant while flag is false):
//   RESEND_API_KEY  — full-access key on buildc.net domain
//   RESEND_FROM     — defaults to 'BuildConnect <noreply@buildc.net>'
//
// From-address must be on the verified domain root (buildc.net), NOT the
// send.buildc.net subdomain where the SPF/DKIM records live. Resend rejects
// from=*@send.buildc.net with 403 "domain not verified" because the
// verified domain entity is the bare root.

import { renderEmail, type EmailPayload } from './transactional-render.ts'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'BuildConnect <noreply@buildc.net>'

export type SendResult =
  | { sent: true; id: string }
  | { sent: false; reason: 'flag-off' | 'no-api-key'; logged: boolean }
  | { sent: false; reason: 'resend-error'; status: number; body: string }

function flagOn(): boolean {
  return (Deno.env.get('EMAILS_TRANSACTIONAL_ENABLED') ?? 'false') === 'true'
}

export async function sendTransactionalEmail(
  to: string,
  payload: EmailPayload,
): Promise<SendResult> {
  const { subject, html } = renderEmail(payload)

  if (!flagOn()) {
    console.log(`[email-park] would send to=${to} type=${payload.type} subject="${subject}"`)
    return { sent: false, reason: 'flag-off', logged: true }
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.error('[email-send] EMAILS_TRANSACTIONAL_ENABLED=true but RESEND_API_KEY missing')
    return { sent: false, reason: 'no-api-key', logged: true }
  }

  const from = Deno.env.get('RESEND_FROM') ?? DEFAULT_FROM
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[email-send] resend error status=${res.status} body=${body}`)
    return { sent: false, reason: 'resend-error', status: res.status, body }
  }

  const { id } = (await res.json()) as { id: string }
  console.log(`[email-send] sent to=${to} type=${payload.type} id=${id}`)
  return { sent: true, id }
}
