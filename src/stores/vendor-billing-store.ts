import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * Vendor billing store — per-vendor stored payment method used for both
 * the membership recurring charge and the commission payout. Ship #179
 * (Rodolfo-direct 2026-04-21): added when the vendor signup flow gained
 * a payment-method dialog right after Create Account. Same pattern as
 * the other admin-moderation-style stores (per-vendor keyed map with
 * zustand persist middleware); mock-side for v1 until Tranche-2 wires
 * a real PCI-compliant processor (Stripe / Plaid).
 *
 * Data intentionally stores only the non-sensitive tail of the method
 * (last4, holder, expiry) — never full card PAN or account number, even
 * in mock. A real integration would swap the `last4 + holder` tuple for
 * a processor-issued token.
 */

// Ship #185 (Rodolfo-direct 2026-04-21): Credit Card + Debit Card merged
// into a single 'card' kind since there's no current semantic difference
// between them in the codebase (both go through the same card-entry form
// + both would route to the same processor integration when real
// billing lands). The user-visible distinction is the card brand
// (Visa / Mastercard / AmEx / etc.), which the new `brand` field
// captures. Legacy 'credit_card' and 'debit_card' values still parse —
// they remain in the union for back-compat read of pre-#185 persisted
// entries; new writes only produce 'card' | 'checking'.
export type VendorPaymentMethodKind = 'card' | 'checking' | 'credit_card' | 'debit_card'

export interface VendorPaymentMethod {
  kind: VendorPaymentMethodKind
  last4: string
  holder: string
  // Card kind only — detected brand at save time (Visa, Mastercard,
  // AmEx, Discover, Diners Club, JCB). Optional because very short
  // prefixes may not match any known IIN range and we shouldn't block
  // submission — the Membership "Charged to" display falls back to
  // the generic "Card" label when brand is absent.
  brand?: string
  // Card kind only — MM/YY.
  expiry?: string
  // Checking only — bank name + routing last 4.
  bankName?: string
  routingLast4?: string
  addedAt: string
}

// Lightweight IIN-prefix-based brand detection. Covers the common US
// brands Rodolfo called out (Visa / Mastercard / AmEx) plus the usual
// co-travelers. Not a validator — returns null on unknown prefixes so
// the UI shows no brand chip rather than a wrong one.
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

interface VendorBillingState {
  // Vendor id → current stored payment method. One method per vendor;
  // a new method replaces the old on save (edit flow).
  paymentMethodByVendor: Record<string, VendorPaymentMethod>
  setPaymentMethod: (vendorId: string, method: VendorPaymentMethod) => void
  removePaymentMethod: (vendorId: string) => void
  getPaymentMethod: (vendorId: string) => VendorPaymentMethod | undefined
}

export const useVendorBillingStore = create<VendorBillingState>()(
  persist(
    (set, get) => ({
      paymentMethodByVendor: {},

      setPaymentMethod: (vendorId, method) =>
        set((state) => ({
          paymentMethodByVendor: {
            ...state.paymentMethodByVendor,
            [vendorId]: method,
          },
        })),

      removePaymentMethod: (vendorId) =>
        set((state) => {
          const next = { ...state.paymentMethodByVendor }
          delete next[vendorId]
          return { paymentMethodByVendor: next }
        }),

      getPaymentMethod: (vendorId) => get().paymentMethodByVendor[vendorId],
    }),
    { name: 'buildconnect-vendor-billing' },
  ),
)

// Display label per kind. Post-#185 only 'card' and 'checking' are
// written by the UI; the legacy 'credit_card' / 'debit_card' labels
// exist as back-compat aliases so persisted pre-#185 entries render
// correctly under the unified "Card" vocabulary.
export const PAYMENT_METHOD_LABELS: Record<VendorPaymentMethodKind, string> = {
  card: 'Card',
  checking: 'Checking Account',
  credit_card: 'Card',
  debit_card: 'Card',
}
