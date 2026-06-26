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

// Type + label re-exports for back-compat.
// Source of truth lives in src/types/payment-method.ts so non-vendor consumers
// (homeowner banking-payouts square once the in-app dialog generalizes) can
// pull the shape without a vendor-store import. All three vendor call sites
// (auth/register, vendor/banking, vendor/membership) keep importing from here
// unchanged.
export type {
  VendorPaymentMethodKind,
  VendorPaymentPurpose,
  VendorPaymentMethod,
} from '@/types/payment-method'

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

export { PAYMENT_METHOD_LABELS, PAYMENT_PURPOSE_LABELS } from '@/types/payment-method'
