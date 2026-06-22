// Stripe.js client-side singleton.
//
// Initializes Stripe with the VITE_STRIPE_PUBLIC_KEY at module-eval time and
// returns the cached promise to every <Elements> wrapper. The publishable key
// is safe to ship in the bundle by design — only the secret key (held in the
// Edge Function env) can charge / move money.
//
// loadStripe() lazy-loads the Stripe.js script tag on first invocation and
// caches the resolved Stripe instance, so multiple <Elements> mounts share
// one network fetch.
//
// Mirrors src/lib/supabase.ts pattern for VITE_ env access (?? {} fallback so
// non-Vite contexts like tsx scripts don't blow up at import time).

import { loadStripe, type Stripe } from '@stripe/stripe-js'

const env = ((import.meta as { env?: Record<string, string | undefined> }).env) ?? {}
const PUBLISHABLE_KEY = env.VITE_STRIPE_PUBLIC_KEY || ''

let cachedPromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (cachedPromise) return cachedPromise
  if (!PUBLISHABLE_KEY) {
    // Returning a resolved null lets consumers render a graceful "Stripe is
    // not configured" state without crashing the dialog. The edge fn will
    // also 503 in this case, so the UI is the right place to handle it.
    cachedPromise = Promise.resolve(null)
    return cachedPromise
  }
  cachedPromise = loadStripe(PUBLISHABLE_KEY)
  return cachedPromise
}

export function isStripeConfigured(): boolean {
  return PUBLISHABLE_KEY.length > 0
}
