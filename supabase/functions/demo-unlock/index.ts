// Demo-unlock Edge Function (task_1780764924347_535 P2)
// Server-side gate that mints a single-use magic link for one of the 5 demo
// accounts AFTER the caller supplies the DEMO_GATE_PASSCODE.
//
// Why this exists: P1 stripped the in-bundle demoLogin() + VITE_DEMO_*_PW
// values because they leaked to anyone who downloaded the public JS bundle.
// P2 replaces that with a server-side gate so demo access still works without
// any password material reaching the browser. The login page now sends
// { passcode, role } here; if passcode matches, this fn calls
// supabase.auth.admin.generateLink({type:'magiclink'}) and returns the URL
// that the browser follows to land logged in.
//
// Env required:
//   SUPABASE_URL                 — project URL
//   SUPABASE_SERVICE_ROLE_KEY    — server-only, never VITE_ prefixed
//   DEMO_GATE_PASSCODE           — case-sensitive shared secret (e.g. Pool2006$)
//   DEMO_HOMEOWNER_EMAIL         — defaults to homeowner@buildc.net
//   DEMO_VENDOR_EMAIL            — defaults to vendor@buildc.net
//   DEMO_ADMIN_EMAIL             — defaults to admin@buildc.net
//   DEMO_ACCOUNT_REP_EMAIL       — defaults to account_rep@buildc.net
//   DEMO_EMPLOYEE_EMAIL          — defaults to employee@buildc.net
//   DEMO_MAGICLINK_REDIRECT_URL  — landing page after click; defaults to /home

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RATE_LIMIT_PER_MIN_PER_IP = 10

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
}

type DemoRole = 'homeowner' | 'vendor' | 'admin' | 'account_rep' | 'employee'

const VALID_ROLES: ReadonlySet<DemoRole> = new Set([
  'homeowner',
  'vendor',
  'admin',
  'account_rep',
  'employee',
])

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function getClientIp(req: Request): string | null {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  )
}

function emailForRole(role: DemoRole): string {
  const map: Record<DemoRole, string> = {
    homeowner: Deno.env.get('DEMO_HOMEOWNER_EMAIL') || 'homeowner@buildc.net',
    vendor: Deno.env.get('DEMO_VENDOR_EMAIL') || 'vendor@buildc.net',
    admin: Deno.env.get('DEMO_ADMIN_EMAIL') || 'admin@buildc.net',
    account_rep: Deno.env.get('DEMO_ACCOUNT_REP_EMAIL') || 'account_rep@buildc.net',
    employee: Deno.env.get('DEMO_EMPLOYEE_EMAIL') || 'employee@buildc.net',
  }
  return map[role]
}

const ipRateBuckets = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string | null): boolean {
  if (!ip) return true
  const now = Date.now()
  const bucket = ipRateBuckets.get(ip)
  if (!bucket || bucket.resetAt < now) {
    ipRateBuckets.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  bucket.count += 1
  return bucket.count <= RATE_LIMIT_PER_MIN_PER_IP
}

// Timing-safe equality so passcode validation doesn't leak length/prefix
// info via response-time variance to a brute-force attacker.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' })
  }

  const ip = getClientIp(req)
  if (!checkRateLimit(ip)) {
    return jsonResponse(429, { error: 'rate_limit_exceeded', retryAfterSeconds: 60 })
  }

  const passcodeExpected = Deno.env.get('DEMO_GATE_PASSCODE')
  if (!passcodeExpected) {
    console.error('[demo-unlock] DEMO_GATE_PASSCODE not configured')
    return jsonResponse(500, { error: 'gate_not_configured' })
  }

  let body: { passcode?: string; role?: string }
  try {
    body = (await req.json()) as { passcode?: string; role?: string }
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' })
  }
  if (typeof body.passcode !== 'string' || typeof body.role !== 'string') {
    return jsonResponse(400, { error: 'missing_passcode_or_role' })
  }
  if (!VALID_ROLES.has(body.role as DemoRole)) {
    return jsonResponse(400, { error: 'invalid_role' })
  }
  if (!safeEqual(body.passcode, passcodeExpected)) {
    return jsonResponse(401, { error: 'invalid_passcode' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const email = emailForRole(body.role as DemoRole)
  const redirectTo = Deno.env.get('DEMO_MAGICLINK_REDIRECT_URL') || 'https://buildc.net/home'

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })
  if (error || !data?.properties?.action_link || !data?.properties?.hashed_token) {
    console.error(`[demo-unlock] generateLink failed role=${body.role} err=${error?.message}`)
    return jsonResponse(500, { error: 'magic_link_generation_failed' })
  }

  // task_1780776051103_410 Chrome-hang fix: return token_hash so the client
  // can establish the session via supabase.auth.verifyOtp() purely in-JS,
  // bypassing the /auth/v1/verify → /home#hash redirect chain that Chromium
  // supabase-js detectSessionInUrl was failing to consume (apollo dual-engine
  // probe 2026-06-06 confirmed WebKit wrote sb-auth-token, Chromium did not,
  // despite identical hash delivery). magic_link kept as a fallback for any
  // pre-fix client still in the wild during the deploy window.
  return jsonResponse(200, {
    ok: true,
    role: body.role,
    token_hash: data.properties.hashed_token,
    magic_link: data.properties.action_link,
  })
})
