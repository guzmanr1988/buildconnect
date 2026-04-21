import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * Vendor billing store — per-vendor stored payment methods used for
 * both the membership recurring charge and the commission payout. Ship
 * #189 (Rodolfo-direct 2026-04-21 pivot #11) extends the single-method
 * shape from #179 to a list of methods, each with a dedicated purpose
 * so a vendor can put membership on one card and commissions on
 * another.
 *
 * Data kept mock-side for v1 until Tranche-2 wires a real PCI-compliant
 * processor. Only non-sensitive tails are stored (last4, holder name,
 * bank name, routing-last4). A real integration swaps those for
 * processor-issued tokens.
 */

export type VendorPaymentMethodKind = 'card' | 'checking' | 'credit_card' | 'debit_card'

// Ship #189 — per-method purpose. 'both' is the safest default for
// first-time setup (one method covers everything) and also the
// migration fallback when wrapping pre-#189 single-method entries.
export type VendorPaymentPurpose = 'membership' | 'commissions' | 'both'

export interface VendorPaymentMethod {
  // Ship #189 — stable identifier so edit + delete can target a
  // specific row without relying on index. Generated on add.
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

// Lightweight IIN-prefix-based brand detection — unchanged from #185.
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
  // Ship #189 — array per vendor. First entry matches what the
  // pre-#189 single-method consumers would have seen (via the
  // persist migrate path).
  paymentMethodsByVendor: Record<string, VendorPaymentMethod[]>
  addPaymentMethod: (
    vendorId: string,
    method: Omit<VendorPaymentMethod, 'id'>,
  ) => void
  updatePaymentMethod: (
    vendorId: string,
    methodId: string,
    patch: Omit<VendorPaymentMethod, 'id'>,
  ) => void
  removePaymentMethod: (vendorId: string, methodId: string) => void
  getPaymentMethodsForVendor: (vendorId: string) => VendorPaymentMethod[]
  // Purpose-aware lookup used by /vendor/membership + Pay Commission
  // source-line. Returns the first method whose purpose matches the
  // requested purpose OR is 'both'. Insertion order is preserved so
  // edits don't shuffle which method the downstream flows pick.
  getPaymentMethodForPurpose: (
    vendorId: string,
    purpose: 'membership' | 'commissions',
  ) => VendorPaymentMethod | undefined
}

export const useVendorBillingStore = create<VendorBillingState>()(
  persist(
    (set, get) => ({
      paymentMethodsByVendor: {},

      addPaymentMethod: (vendorId, method) =>
        set((state) => {
          const prior = state.paymentMethodsByVendor[vendorId] ?? []
          const next: VendorPaymentMethod = {
            ...method,
            id: crypto.randomUUID(),
          }
          return {
            paymentMethodsByVendor: {
              ...state.paymentMethodsByVendor,
              [vendorId]: [...prior, next],
            },
          }
        }),

      updatePaymentMethod: (vendorId, methodId, patch) =>
        set((state) => {
          const prior = state.paymentMethodsByVendor[vendorId] ?? []
          const replaced = prior.map((m) =>
            m.id === methodId ? { ...patch, id: m.id } : m,
          )
          return {
            paymentMethodsByVendor: {
              ...state.paymentMethodsByVendor,
              [vendorId]: replaced,
            },
          }
        }),

      removePaymentMethod: (vendorId, methodId) =>
        set((state) => {
          const prior = state.paymentMethodsByVendor[vendorId] ?? []
          const filtered = prior.filter((m) => m.id !== methodId)
          const nextMap = { ...state.paymentMethodsByVendor }
          if (filtered.length === 0) delete nextMap[vendorId]
          else nextMap[vendorId] = filtered
          return { paymentMethodsByVendor: nextMap }
        }),

      getPaymentMethodsForVendor: (vendorId) =>
        get().paymentMethodsByVendor[vendorId] ?? [],

      getPaymentMethodForPurpose: (vendorId, purpose) => {
        const list = get().paymentMethodsByVendor[vendorId] ?? []
        return list.find((m) => m.purpose === purpose || m.purpose === 'both')
      },
    }),
    {
      name: 'buildconnect-vendor-billing',
      // Ship #189 — version 2. Pre-#189 persisted shape was
      // { paymentMethodByVendor: Record<vendorId, VendorPaymentMethod> }
      // with a single method (no id, no purpose). Migration wraps any
      // single-method entry in an array + generates an id + assigns
      // purpose='both' (the safest default since we don't know what
      // the user intended). Zero user action required.
      version: 2,
      migrate: (persistedState: unknown, fromVersion: number) => {
        if (fromVersion >= 2) return persistedState as VendorBillingState
        const old = (persistedState as { paymentMethodByVendor?: Record<string, Omit<VendorPaymentMethod, 'id' | 'purpose'>> })?.paymentMethodByVendor ?? {}
        const next: Record<string, VendorPaymentMethod[]> = {}
        for (const [vendorId, method] of Object.entries(old)) {
          if (!method) continue
          next[vendorId] = [
            {
              ...method,
              id: crypto.randomUUID(),
              purpose: 'both',
            },
          ]
        }
        return { paymentMethodsByVendor: next } as unknown as VendorBillingState
      },
    },
  ),
)

// Display label per kind. Ship #189 retains the post-#185 vocabulary
// (new writes only produce 'card' | 'checking'; legacy 'credit_card'
// and 'debit_card' kinds remain readable under the unified "Card"
// label for pre-#185 data).
export const PAYMENT_METHOD_LABELS: Record<VendorPaymentMethodKind, string> = {
  card: 'Card',
  checking: 'Checking Account',
  credit_card: 'Card',
  debit_card: 'Card',
}

// Short-form purpose label — used by the list row chip + dialog
// segmented toggle. Uppercase tracking via consumer class, not here.
export const PAYMENT_PURPOSE_LABELS: Record<VendorPaymentPurpose, string> = {
  membership: 'Membership',
  commissions: 'Commissions',
  both: 'All Payments',
}
