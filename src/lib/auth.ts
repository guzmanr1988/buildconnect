import { supabase } from '@/lib/supabase'
import type { UserRole, Profile } from '@/types'

export async function signUp(email: string, password: string, metadata: { name: string; role: UserRole; phone?: string; address?: string; company?: string }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  })
  if (error) throw error
  return data
}

// PR-254 (Rod-direct 2026-05-17) — UX timeout race to close the
// "permanent hang" appearance during CF→Supabase /auth/v1/* edge-pinning
// windows (N=3 same-day: apollo 16:25Z + 16:30Z + Rod 17:40Z, banked as
// feedback_cf_supabase_auth_edge_pinning_class). Pre-fix the demo flow
// took ~24s with no upper bound when the edge stalled — visible as a
// dead button. 12s ceiling lets the user retry or switch networks; the
// thrown Error bubbles to LoginPage's onSubmit/demoLogin catch which
// already toasts via friendlyAuthError fallback.
const SIGN_IN_TIMEOUT_MS = 12_000

export async function signIn(email: string, password: string) {
  const result = await Promise.race([
    supabase.auth.signInWithPassword({ email, password }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Sign-in is taking longer than expected. Please check your connection or try again.')),
        SIGN_IN_TIMEOUT_MS,
      ),
    ),
  ])
  const { data, error } = result
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data as Profile
}

// Draft (#475 latency profile) — bloat-column list excluded from the
// critical-path slim fetch. Each can carry KB–MB per row (base64 data
// URLs or large JSONB snapshots). On CF→Supabase edge-pinning windows
// the row-payload transfer dominates the 17s getProfile measurement.
// Trimming these from the login critical path drops the wire payload
// from MB to <1KB for typical rows.
const PROFILE_BLOAT_COLUMNS = [
  'id_document_url',
  'noncircumvention_agreement_text_snapshot',
  'noncircumvention_agreement_signature_metadata',
  'contractor_licenses',
] as const

// All Profile columns minus the bloat list above. Enumerated explicitly
// so a future schema add lands on this side intentionally (vs accidental
// inclusion via select('*')).
const PROFILE_LITE_COLUMNS = [
  'id',
  'email',
  'name',
  'role',
  'account_rep_for_vendor_id',
  'phone',
  'address',
  'latitude',
  'longitude',
  'additional_addresses',
  'company',
  'avatar_color',
  'avatar_url',
  'initials',
  'status',
  'created_at',
  'noncircumvention_agreement_signed_at',
  'noncircumvention_agreement_signed_name',
  'noncircumvention_agreement_version',
  'financing_available',
].join(', ')

export type ProfileLite = Omit<Profile, typeof PROFILE_BLOAT_COLUMNS[number]>

// Critical-path slim fetch. Returns everything navigation + first-paint
// UI needs (role, name, avatar, address, NCA-signed-at gate). The bloat
// columns (id document, NCA snapshot, license images) are filled in by
// a follow-up getProfileBloat() fire-and-forget after navigate.
export async function getProfileLite(userId: string): Promise<ProfileLite> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_LITE_COLUMNS)
    .eq('id', userId)
    .single()
  if (error) throw error
  return data as unknown as ProfileLite
}

// Follow-up bloat-column fetch. Only surfaces that actually need these
// (admin ID-review, NCA review, vendor license panel) consume them, and
// none are on the login → first-paint critical path.
export async function getProfileBloat(userId: string): Promise<Partial<Profile>> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_BLOAT_COLUMNS.join(', '))
    .eq('id', userId)
    .single()
  if (error) throw error
  return data as unknown as Partial<Profile>
}

/*
 * Ship #182 (Rodolfo-direct 2026-04-21) — map Supabase auth errors to
 * plain-English copy. Raw Supabase strings like "email rate limit
 * exceeded" read as "broken" to users; mapped copy explains what's
 * happening and whether to retry. Falls back to the original message
 * when the pattern is unrecognized so we never swallow a novel error.
 */
export function friendlyAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const lower = raw.toLowerCase()

  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return "You've tried to create accounts several times in a short window. Please wait a few minutes and try again."
  }
  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('already been registered')) {
    return 'An account with that email already exists. Log in instead, or use a different email.'
  }
  if (lower.includes('invalid email') || lower.includes('email_address_invalid')) {
    return 'That email address doesn\'t look right. Double-check the format and try again.'
  }
  if (lower.includes('password') && (lower.includes('weak') || lower.includes('short') || lower.includes('6 characters'))) {
    return 'Your password needs to be at least 6 characters long.'
  }
  if (lower.includes('signup is disabled') || lower.includes('signups not allowed')) {
    return 'Account creation is temporarily paused. Please check back shortly.'
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return "We couldn't reach our servers. Check your internet connection and try again."
  }
  // Unknown shape — surface the original message rather than swallow it,
  // but prepend a generic framing so it doesn't look like a stack trace.
  return raw ? `Something went wrong: ${raw}` : 'Something went wrong creating your account. Please try again.'
}
