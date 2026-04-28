// Ship #325 — feature-flags inventory schema-of-truth.
//
// Per banked feedback_format_sot_shared_helper: when N admin-toggleable
// per-feature flags need a single canonical list (keys + labels +
// descriptions + defaults), the inventory lives in one helper module so
// the store + admin UI + future consumers all read from the same source.
//
// Convention:
// - camelCase keys (matches zustand-store convention; existing
//   AppSettings snake_case stays alone for back-compat per #325 Decision D)
// - All defaults OFF per Decision E (user-respect-discipline; vendors and
//   homeowners don't see broken half-ready features until admin enables)
// - Categories group by primary surface; admin UI can render grouped
//   (vendor / homeowner / admin / platform) for scannability
// - Each entry is independently consumed; consumer-side integration
//   happens incrementally per Tranche-2 ship as each feature lands

export type FeatureCategory = 'vendor' | 'homeowner' | 'admin' | 'platform'

export interface FeatureFlagDefinition {
  key: string
  label: string
  description: string
  category: FeatureCategory
  defaultEnabled: boolean
}

export const FEATURE_FLAGS_INVENTORY: FeatureFlagDefinition[] = [
  {
    key: 'vendorRealtimeNotifications',
    label: 'Vendor SMS / Email Notifications',
    description: 'Send real SMS and email alerts to vendors when a new lead arrives.',
    category: 'vendor',
    defaultEnabled: false,
  },
  {
    key: 'realGeocoding',
    label: 'Real Address Geocoding',
    description: 'Use a mapping API to geocode homeowner addresses for real distance-based vendor matching.',
    category: 'platform',
    defaultEnabled: false,
  },
  {
    key: 'imageModeration',
    label: 'Image Moderation Pipeline',
    description: 'Run uploaded vendor / homeowner images through automated moderation before they go live.',
    category: 'platform',
    defaultEnabled: false,
  },
  {
    key: 'adminResetPassword',
    label: 'Admin Password Reset',
    description: 'Allow admin to send a password-reset link to any user from the admin panel.',
    category: 'admin',
    defaultEnabled: false,
  },
  {
    key: 'vendorAdminDetailPage',
    label: 'Per-Vendor Admin Detail (God-View)',
    description: 'Full per-vendor detail page with leads, sales, payouts, employees, and history.',
    category: 'admin',
    defaultEnabled: false,
  },
  {
    key: 'vendorCalendarOverrides',
    label: 'Vendor Calendar Lead Overrides',
    description: 'Vendors can flip lead status (confirm / reschedule / reject) directly from the calendar view.',
    category: 'vendor',
    defaultEnabled: false,
  },
  {
    key: 'activityLogPersistence',
    label: 'Persistent Activity Log',
    description: 'Keep activity log entries across sessions and surface them in the admin activity feed.',
    category: 'admin',
    defaultEnabled: false,
  },
  {
    key: 'realPaymentProcessing',
    label: 'Live Payment Processing',
    description: 'Process vendor subscription and homeowner deposit payments through a live payment gateway.',
    category: 'platform',
    defaultEnabled: false,
  },
  {
    key: 'vendorOptionPricesPercent',
    label: 'Percent-Based Option Pricing',
    description: 'Allow vendors to set option add-ons as a percent of the base service price (vs flat amount only).',
    category: 'vendor',
    defaultEnabled: false,
  },
  {
    key: 'realTimeReviewQueue',
    label: 'Real-Time Review Queue',
    description: 'Live-update the admin review queue when new sold projects come in (no manual refresh needed).',
    category: 'admin',
    defaultEnabled: false,
  },
]

export const FEATURE_CATEGORY_LABEL: Record<FeatureCategory, string> = {
  vendor: 'Vendor',
  homeowner: 'Homeowner',
  admin: 'Admin',
  platform: 'Platform',
}

export const FEATURE_CATEGORY_ORDER: FeatureCategory[] = [
  'vendor',
  'homeowner',
  'admin',
  'platform',
]

export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = Object.fromEntries(
  FEATURE_FLAGS_INVENTORY.map((f) => [f.key, f.defaultEnabled]),
)
