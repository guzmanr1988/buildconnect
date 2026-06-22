// Types + display labels for the vendor payment-method UI.
//
// Pre-M3, this file owned a Zustand-persisted store backed by browser
// localStorage that held mock card / checking entries. M3 (2026-06-22)
// switched the source of truth to the `payment_methods` DB table (Stripe-
// token-backed rows hydrated via usePaymentMethods()). The persisted
// store is removed; only the shape types + display constants remain so
// consumer components keep their existing import + render code.
//
// The legacy localStorage key `buildconnect-vendor-billing` is cleared
// idempotently on first hydrate of usePaymentMethods() — client-side
// only, no DB row removal. See src/lib/hooks/use-payment-methods.ts.

// Pre-M3 kinds included 'credit_card' and 'debit_card' from legacy mock
// data. M3 writes only emit 'card' | 'checking', but the type retains the
// older variants so any in-flight pre-M3 cached row that briefly survives
// the localStorage clear can still be rendered without runtime cast errors.
export type VendorPaymentMethodKind = 'card' | 'checking' | 'credit_card' | 'debit_card'

export type VendorPaymentPurpose = 'membership' | 'commissions' | 'both'

export interface VendorPaymentMethod {
  id: string
  purpose: VendorPaymentPurpose
  kind: VendorPaymentMethodKind
  last4: string
  holder: string
  brand?: string
  expiry?: string
  bankName?: string
  routingLast4?: string
  addedAt: string
}

// Lightweight IIN-prefix-based brand detection — kept for the legacy
// manual-input path inside the mock dialog (pre-M2). Live Stripe Elements
// derives brand server-side from the PaymentMethod object, so new writes
// don't go through this. Retained because a few admin display paths still
// call it from the cached row shape.
export function detectCardBrand(rawNumber: string): string | null {
  const digits = rawNumber.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('4')) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'AmEx'
  if (/^(6011|65|64[4-9])/.test(digits)) return 'Discover'
  if (/^3(0[0-5]|[689])/.test(digits)) return 'Diners Club'
  if (/^35(2[89]|[3-8][0-9])/.test(digits)) return 'JCB'
  return null
}

export const PAYMENT_METHOD_LABELS: Record<VendorPaymentMethodKind, string> = {
  card: 'Card',
  checking: 'Checking Account',
  credit_card: 'Card',
  debit_card: 'Card',
}

export const PAYMENT_PURPOSE_LABELS: Record<VendorPaymentPurpose, string> = {
  membership: 'Membership',
  commissions: 'Commissions',
  both: 'All Payments',
}
