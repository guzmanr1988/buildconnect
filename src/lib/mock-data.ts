import type { Profile, Lead, ClosedSale, CatalogItem, Message, Transaction, Vendor, BankAccount, AppSettings, Bug } from '@/types'

// ─── Users ───
export const MOCK_HOMEOWNERS: Profile[] = [
  { id: 'ho-1', email: 'maria@email.com', name: 'Maria Rodriguez', role: 'homeowner', phone: '(305) 555-0101', address: '1234 Coral Way, Miami, FL 33145', avatar_color: '#3b82f6', initials: 'MR', status: 'active', created_at: '2026-01-15T10:00:00Z' },
  { id: 'ho-2', email: 'james@email.com', name: 'James Thompson', role: 'homeowner', phone: '(786) 555-0202', address: '5678 Kendall Dr, Miami, FL 33156', avatar_color: '#8b5cf6', initials: 'JT', status: 'active', created_at: '2026-02-03T14:30:00Z' },
  { id: 'ho-3', email: 'sarah@email.com', name: 'Sarah Chen', role: 'homeowner', phone: '(954) 555-0303', address: '910 Princeton Blvd, Homestead, FL 33032', avatar_color: '#ec4899', initials: 'SC', status: 'active', created_at: '2026-02-20T09:15:00Z' },
]

// Ship #217 — collapsed to ONE demo vendor per Rodolfo directive: "one
// process to know it works how it should and that everything is linked
// homeowner to vendor and admin see all data make it work". Single mock
// vendor tied to the Vendor demo login (vendor@buildc.net) via email-
// match fallback in useVendorScope. Homeowner vendor-compare shows this
// one card; vendor demo login sees the sentProject; admin workflow sees
// everything. Clean end-to-end linkage. Pre-#217 5-vendor fixture
// (Apex/Shield/Paradise/Elite/Cool Breeze) collapsed into this entry.
export const MOCK_VENDORS: Vendor[] = [
  {
    id: 'v-demo',
    email: 'vendor@buildc.net',
    name: 'Sage Demo Contractor',
    role: 'vendor',
    phone: '(305) 555-1000',
    address: '1 Sage Plaza, Miami, FL 33131',
    company: 'Sage Demo Contractors',
    avatar_color: '#0ea5e9',
    initials: 'SD',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    service_categories: ['roofing', 'windows_doors', 'pool', 'driveways', 'pergolas', 'air_conditioning', 'bathroom', 'kitchen'],
    rating: 4.8,
    response_time: '~2 hours',
    verified: true,
    financing_available: true,
    total_reviews: 42,
    commission_pct: 15,
    reps: [
      { id: 'v-demo-rep-1', name: 'Demo Project Manager', role: 'Project Manager', phone: '(305) 555-2001' },
      { id: 'v-demo-rep-2', name: 'Demo Site Lead', role: 'Site Lead', phone: '(305) 555-2002' },
    ],
  },
]

export const MOCK_ADMIN: Profile = { id: 'admin-1', email: 'admin@buildconnect.com', name: 'BuildConnect Admin', role: 'admin', phone: '(305) 555-9999', address: '1 BuildConnect Plaza, Miami, FL 33101', avatar_color: '#1e40af', initials: 'BC', status: 'active', created_at: '2025-10-01T00:00:00Z' }

// ─── Leads ───
// Ship #217 — cleared pre-seeded fixture leads per Rodolfo's "wipe out
// every other lead clean so I can have one process to know it works how
// it should" directive. Prior 8 fixture leads tied to v-1..v-5 vendors
// no longer scope-valid now that MOCK_VENDORS collapsed to v-demo.
// Empty array means no phantom-fixture-notifications fire (addresses the
// feedback_seeded_fixture_notification_mask class at the data layer).
// Rodolfo tests the flow end-to-end by creating a fresh lead via the
// homeowner flow → it's the ONLY lead in the system, easy to verify it
// lands on vendor + admin surfaces correctly.
export const MOCK_LEADS: Lead[] = []

// ─── Closed Sales ───
// Ship #217 — same rationale as MOCK_LEADS above. Pre-seeded closed
// sales tied to v-1/v-3/v-4 vendors no longer scope-valid. Clean slate.
export const MOCK_CLOSED_SALES: ClosedSale[] = []

// ─── Catalog Items ───
export const MOCK_CATALOG: CatalogItem[] = [
  { id: 'ci-1', vendor_id: 'v-1', category: 'roofing', name: 'Architectural Shingle', description: 'GAF Timberline HDZ', unit: 'per_sq_ft', price: 4.50, active: true, multiplier: 1.0 },
  { id: 'ci-2', vendor_id: 'v-1', category: 'roofing', name: 'Barrel Tile', description: 'Eagle Roofing Capistrano', unit: 'per_sq_ft', price: 8.75, active: true, multiplier: 1.0 },
  { id: 'ci-3', vendor_id: 'v-1', category: 'roofing', name: 'Standing Seam Metal', description: '24-gauge galvalume', unit: 'per_sq_ft', price: 12.00, active: true, multiplier: 1.0 },
  { id: 'ci-4', vendor_id: 'v-2', category: 'windows_doors', name: 'Single-Hung Impact Window', description: 'PGT WinGuard', unit: 'per_unit', price: 850, active: true, multiplier: 1.0 },
  { id: 'ci-5', vendor_id: 'v-2', category: 'windows_doors', name: 'Sliding Glass Door', description: 'PGT WinGuard 8ft', unit: 'per_unit', price: 2400, active: true, multiplier: 1.0 },
  { id: 'ci-6', vendor_id: 'v-3', category: 'pool', name: '12×24 Classic Pool', description: 'Gunite construction', unit: 'flat_rate', price: 35000, active: true, multiplier: 1.0 },
  { id: 'ci-7', vendor_id: 'v-3', category: 'pool', name: '16×32 Resort Pool', description: 'Gunite with vanishing edge', unit: 'flat_rate', price: 55000, active: true, multiplier: 1.0 },
  { id: 'ci-8', vendor_id: 'v-4', category: 'driveways', name: 'Interlocking Pavers', description: 'Belgard Catalina', unit: 'per_sq_ft', price: 15.00, active: true, multiplier: 1.0 },
  { id: 'ci-9', vendor_id: 'v-5', category: 'air_conditioning', name: 'Central AC 3 Ton', description: 'Carrier Infinity 24ANB', unit: 'flat_rate', price: 6500, active: true, multiplier: 1.0 },
  { id: 'ci-10', vendor_id: 'v-1', category: 'roofing', name: 'Gutter Installation', description: '5" seamless aluminum', unit: 'per_linear_ft', price: 12.00, active: true, multiplier: 1.0 },
]

// ─── Messages ───
export const MOCK_MESSAGES: Message[] = [
  { id: 'm-1', lead_id: 'L-0001', sender_id: 'ho-1', content: 'Hi, I wanted to confirm the barrel tile option includes removal of the old roof?', message_type: 'text', created_at: '2026-04-07T15:00:00Z' },
  { id: 'm-2', lead_id: 'L-0001', sender_id: 'v-1', content: 'Yes absolutely! Full tear-off, new underlayment, and barrel tile installation are all included. I\'ll also handle the permit filing.', message_type: 'text', created_at: '2026-04-07T15:12:00Z' },
  { id: 'm-3', lead_id: 'L-0001', sender_id: 'v-1', content: '', message_type: 'quote', quote_data: { items: [{ name: 'Barrel Tile Roof (2,100 sq ft)', price: 18375 }, { name: 'Tear-off & Disposal', price: 4200 }, { name: 'Gutter Installation', price: 3600 }, { name: 'Permit & Inspection', price: 2325 }], total: 28500 }, created_at: '2026-04-07T15:15:00Z' },
  { id: 'm-4', lead_id: 'L-0001', sender_id: 'ho-1', content: 'That looks great! See you on the 14th.', message_type: 'text', created_at: '2026-04-07T15:30:00Z' },
  { id: 'm-5', lead_id: 'L-0002', sender_id: 'ho-2', content: 'Do you offer financing for the full home impact window package?', message_type: 'text', created_at: '2026-04-08T10:00:00Z' },
  { id: 'm-6', lead_id: 'L-0002', sender_id: 'v-2', content: 'Yes! We partner with GreenSky for 0% APR for 18 months on qualifying orders over $20,000.', message_type: 'text', created_at: '2026-04-08T10:08:00Z' },
]

// ─── Transactions ───
export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'tx-1', type: 'commission', vendor_id: 'v-4', company: 'Elite Paving Co', detail: 'Stamped Concrete Driveway', customer: 'James Thompson', amount: 1800, date: '2026-04-12T10:00:00Z', status: 'paid' },
  { id: 'tx-2', type: 'commission', vendor_id: 'v-3', company: 'Paradise Pools FL', detail: 'Resort Pool with Spa & LED', customer: 'Sarah Chen', amount: 9750, date: '2026-04-09T12:00:00Z', status: 'pending' },
  { id: 'tx-3', type: 'commission', vendor_id: 'v-1', company: 'Apex Roofing & Solar', detail: 'Full Roof Replacement', customer: 'Maria Rodriguez', amount: 4275, date: '2026-04-08T16:00:00Z', status: 'pending' },
  { id: 'tx-4', type: 'membership', vendor_id: 'v-1', company: 'Apex Roofing & Solar', detail: 'Monthly Subscription', amount: 35, date: '2026-04-01T00:00:00Z', status: 'paid' },
  { id: 'tx-5', type: 'membership', vendor_id: 'v-2', company: 'Shield Impact Windows', detail: 'Monthly Subscription', amount: 35, date: '2026-04-01T00:00:00Z', status: 'paid' },
  { id: 'tx-6', type: 'membership', vendor_id: 'v-3', company: 'Paradise Pools FL', detail: 'Monthly Subscription', amount: 35, date: '2026-04-01T00:00:00Z', status: 'paid' },
  { id: 'tx-7', type: 'membership', vendor_id: 'v-4', company: 'Elite Paving Co', detail: 'Monthly Subscription', amount: 35, date: '2026-04-01T00:00:00Z', status: 'paid' },
  { id: 'tx-8', type: 'payout', vendor_id: 'v-4', company: 'Elite Paving Co', detail: 'Monthly Payout', amount: 10200, date: '2026-04-15T00:00:00Z', status: 'pending' },
]

export const MOCK_BANK_ACCOUNTS: BankAccount[] = [
  { id: 'ba-1', vendor_id: 'v-1', bank_name: 'Chase', account_holder: 'Apex Roofing LLC', routing_last4: '2891', account_last4: '4523', account_type: 'checking', linked_at: '2025-11-15T10:00:00Z' },
  { id: 'ba-2', vendor_id: 'v-4', bank_name: 'Bank of America', account_holder: 'Elite Paving Co Inc', routing_last4: '0067', account_last4: '8901', account_type: 'checking', linked_at: '2026-01-10T14:00:00Z' },
]

export const MOCK_SETTINGS: AppSettings = {
  revenue_share_pct: 15,
  subscription_fee: 35,
  payout_day: 15,
  maintenance_mode: false,
  ar_mode: false,
  phase2_enabled: false,
  financing_enabled: true,
}

export const MOCK_BUGS: Bug[] = [
  { id: 'bug-1', reporter_id: 'admin-1', description: 'Vendor compare page sometimes shows stale pricing after catalog update', priority: 'high', status: 'open', created_at: '2026-04-07T09:00:00Z' },
  { id: 'bug-2', reporter_id: 'v-1', description: 'Calendar slot picker not showing Saturday availability', priority: 'medium', status: 'in_progress', created_at: '2026-04-05T14:30:00Z' },
  { id: 'bug-3', reporter_id: 'ho-1', description: 'Notification badge count doesn\'t reset after reading messages', priority: 'low', status: 'resolved', created_at: '2026-04-03T11:00:00Z' },
]

// ─── Available time slots (for calendar) ───
export const MOCK_AVAILABLE_SLOTS = [
  { date: '2026-04-14', times: ['09:00', '10:00', '11:00', '14:00', '15:00'] },
  { date: '2026-04-15', times: ['09:00', '10:00', '13:00', '14:00'] },
  { date: '2026-04-16', times: ['10:00', '11:00', '14:00', '15:00', '16:00'] },
  { date: '2026-04-17', times: ['09:00', '11:00', '14:00'] },
  { date: '2026-04-18', times: ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'] },
]
