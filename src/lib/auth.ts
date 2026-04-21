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

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
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
