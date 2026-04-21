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

export type VendorPaymentMethodKind = 'credit_card' | 'debit_card' | 'checking'

export interface VendorPaymentMethod {
  kind: VendorPaymentMethodKind
  last4: string
  holder: string
  // Credit/debit only — MM/YY.
  expiry?: string
  // Checking only — bank name + routing last 4.
  bankName?: string
  routingLast4?: string
  addedAt: string
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

// Display label per kind — used by the payment dialog tabs + settings
// card. Keeps vocabulary aligned across consumers.
export const PAYMENT_METHOD_LABELS: Record<VendorPaymentMethodKind, string> = {
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  checking: 'Checking Account',
}
