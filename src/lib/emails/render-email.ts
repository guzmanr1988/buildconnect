// BuildConnect transactional email renderer.
// Produces email-safe HTML (table layout, inline styles, absolute URLs).
// Consumed by hermes _shared/emails send call sites.

const LOGO_URL = 'https://buildc.net/logo-v2.png'
const BASE_URL = 'https://buildc.net'

// ── Brand tokens (email-safe hex; matches index.css oklch values) ──────────
const C = {
  primary: '#2d4ea8',       // oklch(0.395 0.145 260) — Deep Navy
  primaryLight: '#e8edf8',  // tinted primary bg for header accent
  bodyBg: '#f0f2f7',        // page wrapper background
  cardBg: '#ffffff',        // email card surface
  footerBg: '#1a2647',      // dark navy footer
  footerText: '#a8b4cc',    // muted text on dark
  textDark: '#191e36',      // oklch(0.165 0.022 260)
  textMuted: '#5c6480',     // oklch(0.425 0.018 255)
  border: '#dde0ea',        // oklch(0.908 0.008 250)
  amber: '#c9871e',         // oklch(0.795 0.155 75) — accent
  amberLight: '#fdf3e0',
  success: '#1a7a45',       // oklch(0.495 0.175 155)
  successLight: '#e4f5ec',
}

// ── Shared shell ─────────────────────────────────────────────────────────────
function shell(subject: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${subject}</title>
<style>
  @media only screen and (max-width: 600px) {
    .email-wrapper { padding: 16px 0 !important; }
    .email-card { border-radius: 0 !important; }
    .email-body { padding: 28px 20px !important; }
    .btn { width: 100% !important; display: block !important; text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.bodyBg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" class="email-wrapper" style="background-color:${C.bodyBg};padding:40px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;" class="email-card">

        <!-- HEADER -->
        <tr>
          <td style="background-color:${C.cardBg};border-radius:12px 12px 0 0;padding:28px 40px 20px;border-bottom:1px solid ${C.border};">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle">
                  <img src="${LOGO_URL}" alt="BuildConnect" width="40" height="40"
                    style="border-radius:8px;display:inline-block;vertical-align:middle;" />
                  <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:20px;font-weight:700;color:${C.textDark};letter-spacing:-0.3px;">
                    Build<span style="color:${C.primary};">Connect</span>
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td class="email-body" style="background-color:${C.cardBg};padding:36px 40px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color:${C.footerBg};border-radius:0 0 12px 12px;padding:28px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:13px;color:${C.footerText};line-height:1.6;">
                  <strong style="color:#ffffff;">BuildConnect</strong><br />
                  South Florida home services, simplified.<br />
                  <a href="https://buildc.net" style="color:${C.footerText};text-decoration:none;">buildc.net</a>
                  &nbsp;&middot;&nbsp;
                  <a href="mailto:support@buildc.net" style="color:${C.footerText};text-decoration:none;">support@buildc.net</a>
                  &nbsp;&middot;&nbsp;Serving South Florida
                </td>
              </tr>
              <tr>
                <td style="padding-top:16px;font-size:11px;color:#6b7a99;">
                  You received this email because you have an account at BuildConnect.
                  All contractors independently licensed &amp; insured.
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

// ── Button helper ─────────────────────────────────────────────────────────────
function ctaButton(label: string, href: string, color = C.primary): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
  <tr>
    <td>
      <a href="${href}" class="btn"
        style="display:inline-block;background-color:${color};color:#ffffff;font-size:15px;font-weight:600;
               text-decoration:none;padding:13px 28px;border-radius:8px;letter-spacing:0.1px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`
}

// ── Divider ───────────────────────────────────────────────────────────────────
const divider = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr><td style="border-top:1px solid ${C.border};"></td></tr>
</table>`

// ── Info row helper ───────────────────────────────────────────────────────────
function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:14px;color:${C.textMuted};width:140px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:${C.textDark};font-weight:500;">${value}</td>
  </tr>`
}

// ── 1. Welcome ────────────────────────────────────────────────────────────────
export interface WelcomePayload {
  firstName: string
  loginUrl: string
}

function renderWelcome(data: WelcomePayload): string {
  const body = `
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:${C.textDark};letter-spacing:-0.4px;">
      Welcome, ${data.firstName}!
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:${C.textMuted};line-height:1.6;">
      Your BuildConnect account is ready. You can now request quotes, compare contractors,
      and manage your home improvement projects — all in one place.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:${C.primaryLight};border-radius:10px;padding:20px 24px;margin-bottom:4px;">
      <tr>
        <td>
          <p style="margin:0;font-size:14px;color:${C.primary};font-weight:600;">What you can do next</p>
          <ul style="margin:10px 0 0;padding-left:20px;font-size:14px;color:${C.textDark};line-height:1.8;">
            <li>Browse services and get instant quotes</li>
            <li>Compare licensed, insured South Florida contractors</li>
            <li>Track your project from booking to completion</li>
          </ul>
        </td>
      </tr>
    </table>
    ${ctaButton('Get Started', data.loginUrl)}
    ${divider}
    <p style="margin:0;font-size:13px;color:${C.textMuted};line-height:1.6;">
      Questions? Reply to this email or reach us at
      <a href="mailto:support@buildc.net" style="color:${C.primary};">support@buildc.net</a>.
    </p>`
  return shell('Welcome to BuildConnect', body)
}

// ── 1b. Welcome (auth-flow) — no firstName token; used for Supabase confirm-signup ──
export interface WelcomeAuthPayload {
  loginUrl: string
}

function renderWelcomeAuth(data: WelcomeAuthPayload): string {
  const body = `
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:${C.textDark};letter-spacing:-0.4px;">
      Welcome to BuildConnect!
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:${C.textMuted};line-height:1.6;">
      Your account is ready. You can now request quotes, compare contractors,
      and manage your home improvement projects — all in one place.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:${C.primaryLight};border-radius:10px;padding:20px 24px;margin-bottom:4px;">
      <tr>
        <td>
          <p style="margin:0;font-size:14px;color:${C.primary};font-weight:600;">What you can do next</p>
          <ul style="margin:10px 0 0;padding-left:20px;font-size:14px;color:${C.textDark};line-height:1.8;">
            <li>Browse services and get instant quotes</li>
            <li>Compare licensed, insured South Florida contractors</li>
            <li>Track your project from booking to completion</li>
          </ul>
        </td>
      </tr>
    </table>
    ${ctaButton('Get Started', data.loginUrl)}
    ${divider}
    <p style="margin:0;font-size:13px;color:${C.textMuted};line-height:1.6;">
      Questions? Reply to this email or reach us at
      <a href="mailto:support@buildc.net" style="color:${C.primary};">support@buildc.net</a>.
    </p>`
  return shell('Welcome to BuildConnect', body)
}

// ── 2. Password Reset ─────────────────────────────────────────────────────────
export interface PasswordResetPayload {
  resetUrl: string
  expiresInMinutes: number
}

function renderPasswordReset(data: PasswordResetPayload): string {
  const body = `
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:${C.textDark};letter-spacing:-0.4px;">
      Reset your password
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:${C.textMuted};line-height:1.6;">
      We received a request to reset the password for your BuildConnect account.
      Click the button below to choose a new password.
    </p>
    ${ctaButton('Reset Password', data.resetUrl)}
    <p style="margin:20px 0 0;font-size:13px;color:${C.textMuted};line-height:1.6;">
      This link expires in <strong style="color:${C.textDark};">${data.expiresInMinutes} minutes</strong>.
      If you did not request a password reset, you can safely ignore this email —
      your password will not change.
    </p>
    ${divider}
    <p style="margin:0;font-size:12px;color:${C.textMuted};line-height:1.6;">
      For security, never share this link with anyone. If you need help, contact
      <a href="mailto:support@buildc.net" style="color:${C.primary};">support@buildc.net</a>.
    </p>`
  return shell('Reset your BuildConnect password', body)
}

// ── 3. Quote Received ─────────────────────────────────────────────────────────
export interface QuoteReceivedPayload {
  homeownerFirstName: string
  contractorName: string
  serviceName: string
  quoteAmount: string   // pre-formatted, e.g. "$2,500"
  quoteUrl: string
}

function renderQuoteReceived(data: QuoteReceivedPayload): string {
  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:${C.amberLight};border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0;font-size:13px;font-weight:600;color:${C.amber};text-transform:uppercase;letter-spacing:0.5px;">
            New Quote
          </p>
        </td>
      </tr>
    </table>
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:${C.textDark};letter-spacing:-0.4px;">
      You received a quote
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:${C.textMuted};line-height:1.6;">
      Hi ${data.homeownerFirstName}, <strong style="color:${C.textDark};">${data.contractorName}</strong>
      has submitted a quote for your project.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid ${C.border};border-radius:10px;padding:20px 24px;">
      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${infoRow('Service', data.serviceName)}
            ${infoRow('Contractor', data.contractorName)}
            ${infoRow('Quote Amount', `<span style="font-size:18px;font-weight:700;color:${C.primary};">${data.quoteAmount}</span>`)}
          </table>
        </td>
      </tr>
    </table>
    ${ctaButton('Review Quote', data.quoteUrl, C.primary)}
    ${divider}
    <p style="margin:0;font-size:13px;color:${C.textMuted};line-height:1.6;">
      All BuildConnect contractors are independently licensed and insured.
      Questions? <a href="mailto:support@buildc.net" style="color:${C.primary};">support@buildc.net</a>
    </p>`
  return shell(`New quote from ${data.contractorName}`, body)
}

// ── 4. Booking Confirmation ───────────────────────────────────────────────────
export interface BookingConfirmationPayload {
  homeownerFirstName: string
  contractorName: string
  serviceName: string
  scheduledDate: string   // pre-formatted, e.g. "June 10, 2026"
  bookingUrl: string
}

function renderBookingConfirmation(data: BookingConfirmationPayload): string {
  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:${C.successLight};border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0;font-size:13px;font-weight:600;color:${C.success};text-transform:uppercase;letter-spacing:0.5px;">
            Booking Confirmed
          </p>
        </td>
      </tr>
    </table>
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:${C.textDark};letter-spacing:-0.4px;">
      Your booking is confirmed
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:${C.textMuted};line-height:1.6;">
      Hi ${data.homeownerFirstName}, your project has been booked. Here is a summary:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid ${C.border};border-radius:10px;padding:20px 24px;">
      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${infoRow('Service', data.serviceName)}
            ${infoRow('Contractor', data.contractorName)}
            ${infoRow('Scheduled Date', `<span style="font-weight:600;color:${C.textDark};">${data.scheduledDate}</span>`)}
          </table>
        </td>
      </tr>
    </table>
    ${ctaButton('View Booking', data.bookingUrl, C.success)}
    ${divider}
    <p style="margin:0;font-size:13px;color:${C.textMuted};line-height:1.6;">
      Need to make changes? Visit your
      <a href="${BASE_URL}/dashboard" style="color:${C.primary};">dashboard</a>
      or contact <a href="mailto:support@buildc.net" style="color:${C.primary};">support@buildc.net</a>.
      All contractors are independently licensed and insured.
    </p>`
  return shell(`Booking confirmed — ${data.serviceName}`, body)
}

// ── 5. Referral Invite ────────────────────────────────────────────────────────
export interface ReferralInvitePayload {
  friendName: string    // {{friendName}}
  referrerName: string  // {{referrerName}}
  signupUrl: string     // {{signupUrl}}
}

function renderReferralInvite(data: ReferralInvitePayload): string {
  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:${C.primaryLight};border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0;font-size:13px;font-weight:600;color:${C.primary};text-transform:uppercase;letter-spacing:0.5px;">
            You're Invited
          </p>
        </td>
      </tr>
    </table>
    <h1 style="margin:0 0 10px;font-size:26px;font-weight:700;color:${C.textDark};letter-spacing:-0.4px;">
      You've been invited to BuildConnect
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:${C.textMuted};line-height:1.6;">
      Hi ${data.friendName}, <strong style="color:${C.textDark};">${data.referrerName}</strong> thinks
      you'd love BuildConnect — the easiest way to find trusted, licensed contractors for any home project in South Florida.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid ${C.border};border-radius:10px;padding:20px 24px;margin-bottom:8px;">
      <tr>
        <td>
          <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:${C.textDark};">
            What you get with BuildConnect
          </p>
          <ul style="margin:0;padding-left:20px;font-size:14px;color:${C.textDark};line-height:1.9;">
            <li>Get quotes from vetted, insured contractors — fast</li>
            <li>Compare prices and reviews in one place</li>
            <li>Track your project from booking to completion</li>
            <li>No sales pressure, no hidden fees</li>
          </ul>
        </td>
      </tr>
    </table>
    ${ctaButton('Join BuildConnect', data.signupUrl)}
    ${divider}
    <p style="margin:0;font-size:13px;color:${C.textMuted};line-height:1.6;">
      You received this invitation because ${data.referrerName} shared your contact with us.
      If you did not expect this email, you can safely ignore it — no account has been created.
    </p>`
  return shell(`${data.referrerName} invited you to BuildConnect`, body)
}

// ── Public API ────────────────────────────────────────────────────────────────
export type EmailPayload =
  | { type: 'welcome'; data: WelcomePayload }
  | { type: 'welcome-auth'; data: WelcomeAuthPayload }
  | { type: 'password-reset'; data: PasswordResetPayload }
  | { type: 'quote-received'; data: QuoteReceivedPayload }
  | { type: 'booking-confirmation'; data: BookingConfirmationPayload }
  | { type: 'referral-invite'; data: ReferralInvitePayload }

export function renderEmail(payload: EmailPayload): { subject: string; html: string } {
  switch (payload.type) {
    case 'welcome':
      return {
        subject: `Welcome to BuildConnect, ${payload.data.firstName}!`,
        html: renderWelcome(payload.data),
      }
    case 'welcome-auth':
      return {
        subject: 'Welcome to BuildConnect!',
        html: renderWelcomeAuth(payload.data),
      }
    case 'password-reset':
      return {
        subject: 'Reset your BuildConnect password',
        html: renderPasswordReset(payload.data),
      }
    case 'quote-received':
      return {
        subject: `New quote from ${payload.data.contractorName} — ${payload.data.serviceName}`,
        html: renderQuoteReceived(payload.data),
      }
    case 'booking-confirmation':
      return {
        subject: `Booking confirmed — ${payload.data.serviceName}`,
        html: renderBookingConfirmation(payload.data),
      }
    case 'referral-invite':
      return {
        subject: `${payload.data.referrerName} invited you to BuildConnect`,
        html: renderReferralInvite(payload.data),
      }
  }
}
