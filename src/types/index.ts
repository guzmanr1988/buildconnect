export type UserRole = 'homeowner' | 'vendor' | 'admin' | 'account_rep'

// Ship #171 (task_1776662387601_014): 'cancelled' split from 'rejected'.
// Ship #75 Phase A collapsed homeowner-cancellation-approved into the
// 'rejected' bucket because schema divergence was Tranche-2 work; now
// reusing that bucket is no longer the default. New cancellations emit
// 'cancelled'; pre-#171 persisted 'rejected' entries with
// cancellationRequest.status='approved' are still surfaced as cancelled
// via the vendor-dashboard isCancelledLead back-compat predicate.
export type LeadStatus = 'pending' | 'confirmed' | 'rejected' | 'rescheduled' | 'completed' | 'cancelled'

export type TransactionType = 'commission' | 'membership' | 'payout'

export type TransactionStatus = 'pending' | 'closed' | 'paid'

export type BugPriority = 'high' | 'medium' | 'low'

export type BugStatus = 'open' | 'in_progress' | 'resolved'

export type ServiceCategory =
  | 'roofing'
  | 'windows_doors'
  | 'pool'
  | 'driveways'
  | 'pergolas'
  | 'air_conditioning'
  | 'kitchen'
  | 'bathroom'
  | 'wall_paneling'
  | 'garage'
  | 'house_painting'
  | 'blinds'

export type CatalogUnit = 'per_sq_ft' | 'per_unit' | 'per_linear_ft' | 'flat_rate'

export interface SecondaryAddress {
  id: string
  label: string // e.g. "Guest House", "Rental Unit", "Vacation Home"
  street: string
  city: string
  state?: string
  zip: string
}

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
  // Ship #333 Phase A — parent-vendor FK for account_rep role. Set only
  // on account_rep profiles; null for homeowner / vendor / admin. Phase B
  // rep-dashboard render-layer filter resolves the rep's parent vendor
  // via this FK to scope chain output. Per CHAIN IS GOD: rep-scope at
  // consumer-render-layer NOT chain-layer.
  account_rep_for_vendor_id?: string
  phone: string
  address: string
  // Ship #246 — geo-match Phase 1. Optional lat/lng for distance filter
  // on vendor-compare. Fixture-seeded for demo vendors/homeowners; real
  // values land when Tranche-2 geocoding goes live (Supabase Edge Fn +
  // Mapbox/Google). Missing coord → unfiltered-by-distance fall-through.
  latitude?: number
  longitude?: number
  // Additional properties beyond the primary address. A homeowner managing
  // multiple properties can reach them from the per-service configurator
  // address selector. Zustand-only / mock-bridged for now — Supabase JSONB
  // column + RLS land in Tranche-2 (Phase B3).
  additional_addresses?: SecondaryAddress[]
  company?: string
  avatar_color: string
  // Base64 data URL for uploaded avatar image. If present, renders instead
  // of initials fallback (ship #115 per kratos msg 1776720328611 + extension
  // 1776720343679). Mock-side for v1; Tranche-2 moves to Supabase Storage
  // bucket + image moderation.
  avatar_url?: string
  // Initials field is optional going forward. AvatarInitials auto-derives
  // from name when initials is absent/empty (ship #164 per task_1776721365362
  // _726; rename-residue prevention). Legacy fixtures may still hardcode
  // initials as an explicit override — those continue to take precedence.
  initials?: string
  status: 'active' | 'pending' | 'suspended'
  created_at: string
  // Ship #270 — Non-circumvention agreement signature audit. Profile-
  // level (not Vendor-level) per banked widen-reads-narrow-writes:
  // future role-specific agreements (e.g. homeowner ToS Phase 2) reuse
  // the same field-shape without interface rework. Only vendors
  // populate today; gate at vendor-layout.tsx checks
  // noncircumvention_agreement_version against CURRENT_AGREEMENT_VERSION.
  noncircumvention_agreement_signed_at?: string
  noncircumvention_agreement_signed_name?: string
  noncircumvention_agreement_version?: string
  // Frozen body of the agreement at sign-time. Lets admin view show
  // exactly what the vendor agreed to, even if AGREEMENT_TEXT later
  // gets updated to a new version.
  noncircumvention_agreement_text_snapshot?: string
  noncircumvention_agreement_signature_metadata?: {
    ip?: string
    ua?: string
  }
}

export interface Lead {
  id: string
  homeowner_id: string
  vendor_id: string
  project: string
  value: number
  status: LeadStatus
  slot: string
  permit_choice: boolean
  service_category: ServiceCategory
  pack_items: Record<string, string[]>
  sq_ft: number
  financing: boolean
  address: string
  phone: string
  email: string
  homeowner_name: string
  received_at: string
  // Ship #246 — geo-match Phase 1; optional demo-seeded lat/lng.
  latitude?: number
  longitude?: number
  // Rep-scoped assignment. When set, only the account_rep whose
  // profile.id matches sees this lead. Absent = vendor-admin visible only.
  account_rep_id?: string
}

export interface ClosedSale {
  id: string
  lead_id: string
  vendor_id: string
  homeowner_id: string
  sale_amount: number
  vendor_share: number
  commission: number
  commission_paid: boolean
  commission_paid_at?: string
  closed_at: string
  homeowner_name: string
  project: string
}

export interface CatalogItem {
  id: string
  vendor_id: string
  category: ServiceCategory
  name: string
  description: string
  unit: CatalogUnit
  price: number
  active: boolean
  multiplier: number
}

export interface Message {
  id: string
  lead_id: string
  sender_id: string
  content: string
  message_type: 'text' | 'quote'
  quote_data?: QuoteData
  created_at: string
}

export interface QuoteData {
  items: { name: string; price: number }[]
  total: number
  monthly_estimate?: number
}

export interface Transaction {
  id: string
  type: TransactionType
  vendor_id: string
  company: string
  detail: string
  customer?: string
  amount: number
  date: string
  status: TransactionStatus
}

export interface BankAccount {
  id: string
  vendor_id: string
  bank_name: string
  account_holder: string
  routing_last4: string
  account_last4: string
  account_type: 'checking' | 'savings'
  linked_at: string
}

export interface AppSettings {
  revenue_share_pct: number
  subscription_fee: number
  payout_day: number
  maintenance_mode: boolean
  ar_mode: boolean
  phase2_enabled: boolean
  financing_enabled: boolean
}

export interface Bug {
  id: string
  reporter_id: string
  description: string
  priority: BugPriority
  status: BugStatus
  created_at: string
}

// Ship #336 Phase A — preset price-line-item per service-type per
// Rodolfo "that will be aready preset in overhall price for the project
// choosen by the homeowner". Variable-shape across service-types
// (windows_doors gets [Product / Permit / Install Windows / Install Doors];
// roofing gets [Material / Permit / Tear-off / Install]; etc). Source
// is SERVICE_CATALOG entry; snapshotted onto SentProject.priceLineItems
// at sendProject time per banked feedback_immutable_ledger_freeze_at_write
// so price-detail LOCKS at intake-snapshot regardless of future catalog
// updates.
//
// Ship #343 Phase A — added originalAmount + source fields per Rodolfo
// "make sure when ever job is sold on admin and admin puts a higher
// number sold to add a line extra and amount" + "auto populated to
// what the vendor outputs". originalAmount is immutable from snapshot
// (audit-trail per banked feedback_immutable_ledger_freeze_at_write);
// source distinguishes preset-original from auto-injected adjustment
// (Phase A) and from vendor-edited (Phase B / #344).
export type PriceLineItemSource = 'preset' | 'preset_calculated' | 'vendor_edit' | 'auto_sold_adjustment'

export interface PriceLineItem {
  id: string
  label: string
  amount: number
  // Immutable original amount snapshotted at sendProject time. Phase B
  // vendor-edit-arrows (#344) renders red ▲ / green ▼ when amount !==
  // originalAmount. Auto-sold-adjustment lines have originalAmount = 0
  // (delta-only) so the EXTRA $ line surfaces without a paired arrow.
  originalAmount?: number
  // Source of the line. preset = from PRICE_LINE_ITEM_PRESETS at
  // sendProject snapshot. preset_calculated = computed from vendor's
  // unit rate × homeowner measured quantity (roofing sqft/linear_ft).
  // vendor_edit = vendor-modified amount in #344 Phase B.
  // auto_sold_adjustment = injected by markSold when sold-final
  // exceeds sum-of-preset-originals.
  source?: PriceLineItemSource
  // Unit-rate breakdown for preset_calculated lines. Frozen at sendProject
  // time per immutable-ledger-freeze-at-write: vendor price changes after
  // booking don't retroactively alter old line items.
  priceUnit?: 'square' | 'sqft' | 'linear_ft'
  unitRate?: number   // vendor's rate in dollars (e.g. 8 = $8/sqft)
  unitQuantity?: number  // homeowner's measured quantity
}

export interface VendorRep {
  id: string       // stable per-rep id within a vendor (not a Supabase UUID)
  name: string
  role?: string    // e.g. "Senior Project Manager", "Lead Installer"
  phone?: string
  email?: string
}

export interface Vendor extends Profile {
  company: string
  service_categories: ServiceCategory[]
  rating: number
  response_time: string
  verified: boolean
  financing_available: boolean
  total_reviews: number
  commission_pct: number
  // Vendor field reps that can be assigned to a customer lead at Confirm time.
  // Mock-scoped for now; Supabase vendor_reps table lands in Tranche-2 with the
  // rest of the vendor-profile wiring.
  reps?: VendorRep[]
}

export interface ServiceConfig {
  id: ServiceCategory
  name: string
  badge?: string
  badgeColor?: string
  tagline: string
  description: string
  features: string[]
  stat: { label: string; value: string }
  optionGroups: OptionGroup[]
  phase2?: boolean
}

export interface ServiceOption {
  id: string
  label: string
  description?: string
  subGroups?: OptionGroup[]
}

export interface OptionGroup {
  id: string
  label: string
  required: boolean
  type: 'single' | 'multi'
  options: ServiceOption[]
  // Only render + count-toward-progress once the referenced group has a matching
  // selection. With `equals`, reveal only when the referenced group contains that
  // specific option id (useful for "Install → sub-group reveals; No Install → stays
  // hidden"). Without `equals`, any selection in the gate-group triggers reveal.
  revealsOn?: { group: string; equals?: string }
}
