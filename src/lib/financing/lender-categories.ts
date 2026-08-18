// Canonical lender-category constants. Consumed by admin/financing.tsx,
// apply.tsx, and vendor/financing.tsx. Prior to this module the same three
// constants were duplicated across those files and had drifted — admin
// carried 5 categories (incl. credit_unions), apply/vendor carried 4 — so
// flipping credit_unions ON in admin produced an admin toggle for a
// category the homeowner catalog could not render. Extracting to one
// source makes the next divergence impossible.

export type LenderCategory =
  | 'contractor_pos'
  | 'personal_loans'
  | 'solar_hi_specialty'
  | 'pace'
  | 'credit_unions'

export const MASTER_KEY = 'financing_enabled'

export const CATEGORY_LABELS: Record<LenderCategory, string> = {
  contractor_pos: 'Contractor POS',
  personal_loans: 'Personal Loans',
  solar_hi_specialty: 'Solar & HI Specialty',
  pace: 'PACE Financing',
  credit_unions: 'Credit Unions',
}

export const CATEGORY_KEYS: Record<LenderCategory, string> = {
  contractor_pos: 'financing_category_contractor_pos',
  personal_loans: 'financing_category_personal_loans',
  solar_hi_specialty: 'financing_category_solar_hi_specialty',
  pace: 'financing_category_pace',
  credit_unions: 'financing_category_credit_unions',
}

// Renderable-category order per surface. The reachability hook iterates
// HOMEOWNER_CATEGORY_ORDER, so a category becomes "reachable" only when
// it also appears in this array — flipping credit_unions ON in admin
// does not surface a homeowner CTA until credit_unions is added here too.
// That coupling is intentional: it prevents the exact bug that motivated
// this module (admin toggle promising a category the catalog cannot serve).

export const HOMEOWNER_CATEGORY_ORDER: readonly LenderCategory[] = [
  'contractor_pos',
  'personal_loans',
  'solar_hi_specialty',
  'pace',
]

export const VENDOR_CATEGORY_ORDER: readonly LenderCategory[] = [
  'contractor_pos',
  'personal_loans',
  'solar_hi_specialty',
  'pace',
]

export const ADMIN_CATEGORY_ORDER: readonly LenderCategory[] = [
  'contractor_pos',
  'personal_loans',
  'solar_hi_specialty',
  'pace',
  'credit_unions',
]
