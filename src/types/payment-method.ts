// Neutral payment-method types — extracted from stores/vendor-billing-store
// so non-vendor consumers (homeowner banking-payouts square, admin/contractor
// profile dialogs once the in-app payment-method dialog generalizes) can pull
// the type without dragging a vendor-specific store import.
//
// Back-compat: vendor-billing-store re-exports every symbol here so existing
// vendor call sites (auth/register, vendor/banking, vendor/membership) keep
// resolving without a single import update. Rename pass is deferred per
// kratos msg 1782432473739 — strictly-additive staging.

// Pre-M3 kinds included 'credit_card' and 'debit_card' from legacy mock
// data. M3 writes only emit 'card' | 'checking', but the type retains the
// older variants so any in-flight pre-M3 cached row that briefly survives
// the localStorage clear can still be rendered without runtime cast errors.
export type VendorPaymentMethodKind = 'card' | 'checking' | 'credit_card' | 'debit_card'

// Purpose enum currently covers the vendor split (membership / commissions /
// both). The payment-method dialog accepts a purposeOptions prop so non-vendor
// consumers can pass a subset or a single value; the type stays the union of
// all known purposes so a future homeowner-or-admin purpose can be added here
// without touching the dialog's type surface.
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
