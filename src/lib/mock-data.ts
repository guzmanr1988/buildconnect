import type { Profile, Lead, ClosedSale, CatalogItem, Message, Transaction, Vendor, BankAccount, AppSettings, Bug } from '@/types'

// ─── Users ───
// Ship #246 — lat/lng seeded on demo fixtures for geo-match Phase 1
// vendor-compare filter. Coords approximate US ZIP centroids for each
// address; fine-grained precision not needed since distance filter is
// compared to a miles-scale radius. Tranche-2 replaces with real
// geocoding via Supabase Edge Fn + Mapbox/Google API.
export const MOCK_HOMEOWNERS: Profile[] = [
  { id: 'ho-1', email: 'maria@email.com', name: 'Maria Rodriguez', role: 'homeowner', phone: '(305) 555-0101', address: '1234 Coral Way, Miami, FL 33145', latitude: 25.7514, longitude: -80.2587, avatar_color: '#3b82f6', initials: 'MR', status: 'active', created_at: '2026-01-15T10:00:00Z' },
  { id: 'ho-2', email: 'james@email.com', name: 'James Thompson', role: 'homeowner', phone: '(786) 555-0202', address: '5678 Kendall Dr, Miami, FL 33156', latitude: 25.6789, longitude: -80.3253, avatar_color: '#8b5cf6', initials: 'JT', status: 'active', created_at: '2026-02-03T14:30:00Z' },
  { id: 'ho-3', email: 'sarah@email.com', name: 'Sarah Chen', role: 'homeowner', phone: '(954) 555-0303', address: '910 Princeton Blvd, Homestead, FL 33032', latitude: 25.4687, longitude: -80.4776, avatar_color: '#ec4899', initials: 'SC', status: 'active', created_at: '2026-02-20T09:15:00Z' },
]

export const MOCK_VENDORS: Vendor[] = [
  { id: 'v-1', email: 'apex@vendor.com', name: 'Carlos Mendez', role: 'vendor', phone: '(305) 555-1001', address: '100 NW 7th St, Miami, FL 33136', latitude: 25.7811, longitude: -80.2012, company: 'Apex Roofing & Solar', avatar_color: '#f59e0b', initials: 'AM', status: 'active', created_at: '2025-11-01T08:00:00Z', service_categories: ['roofing', 'air_conditioning'], rating: 4.8, response_time: '~2 hours', verified: true, financing_available: true, total_reviews: 127, commission_pct: 10, reps: [
    { id: 'v-1-rep-1', name: 'Luis Ortega', role: 'Senior Project Manager', phone: '(305) 555-2001' },
    { id: 'v-1-rep-2', name: 'Marco DeLeon', role: 'Roofing Lead', phone: '(305) 555-2002' },
    { id: 'v-1-rep-3', name: 'Jennifer Alvarez', role: 'Solar Specialist', phone: '(305) 555-2003' },
  ] },
  { id: 'v-2', email: 'shield@vendor.com', name: 'Tony Rivera', role: 'vendor', phone: '(786) 555-1002', address: '200 SW 8th St, Miami, FL 33130', latitude: 25.7657, longitude: -80.2169, company: 'Shield Impact Windows', avatar_color: '#3b82f6', initials: 'TR', status: 'active', created_at: '2025-12-10T09:00:00Z', service_categories: ['windows_doors'], rating: 4.9, response_time: '~1 hour', verified: true, financing_available: true, total_reviews: 89, commission_pct: 10, reps: [
    { id: 'v-2-rep-1', name: 'Roberto Silva', role: 'Senior Installation Lead', phone: '(786) 555-2004' },
    { id: 'v-2-rep-2', name: 'Patricia Gomez', role: 'Project Coordinator', phone: '(786) 555-2005' },
  ] },
  { id: 'v-3', email: 'paradise@vendor.com', name: 'Ana Martinez', role: 'vendor', phone: '(305) 555-1003', address: '300 Brickell Ave, Miami, FL 33131', latitude: 25.7617, longitude: -80.1918, company: 'Paradise Pools FL', avatar_color: '#06b6d4', initials: 'PM', status: 'active', created_at: '2025-12-20T10:00:00Z', service_categories: ['pool', 'pergolas'], rating: 4.7, response_time: '~3 hours', verified: true, financing_available: false, total_reviews: 64, commission_pct: 10, reps: [
    { id: 'v-3-rep-1', name: 'Diego Ramirez', role: 'Pool Design Lead', phone: '(305) 555-2006' },
    { id: 'v-3-rep-2', name: 'Sofia Herrera', role: 'Project Manager', phone: '(305) 555-2007' },
    { id: 'v-3-rep-3', name: 'Miguel Santos', role: 'Construction Supervisor', phone: '(305) 555-2008' },
  ] },
  { id: 'v-4', email: 'elite@vendor.com', name: 'David Kim', role: 'vendor', phone: '(954) 555-1004', address: '400 Las Olas Blvd, Ft Lauderdale, FL 33301', latitude: 26.1224, longitude: -80.1373, company: 'Elite Paving Co', avatar_color: '#10b981', initials: 'EP', status: 'active', created_at: '2026-01-05T11:00:00Z', service_categories: ['driveways', 'pergolas'], rating: 4.6, response_time: '~4 hours', verified: true, financing_available: false, total_reviews: 43, commission_pct: 10, reps: [
    { id: 'v-4-rep-1', name: 'Kevin Park', role: 'Site Lead', phone: '(954) 555-2009' },
    { id: 'v-4-rep-2', name: 'Antonio Reyes', role: 'Paver Foreman', phone: '(954) 555-2010' },
  ] },
  { id: 'v-5', email: 'coolbreeze@vendor.com', name: 'Mike Johnson', role: 'vendor', phone: '(305) 555-1005', address: '500 Bird Rd, Miami, FL 33155', latitude: 25.7320, longitude: -80.2962, company: 'Cool Breeze HVAC', avatar_color: '#ef4444', initials: 'CB', status: 'pending', created_at: '2026-03-01T12:00:00Z', service_categories: ['air_conditioning'], rating: 4.5, response_time: '~2 hours', verified: false, financing_available: true, total_reviews: 21, commission_pct: 10, reps: [
    { id: 'v-5-rep-1', name: 'Brian Walsh', role: 'HVAC Technician', phone: '(305) 555-2011' },
    { id: 'v-5-rep-2', name: 'Jessica Tran', role: 'Installation Coordinator', phone: '(305) 555-2012' },
  ] },
]

export const MOCK_ADMIN: Profile = { id: 'admin-1', email: 'admin@buildconnect.com', name: 'BuildConnect Admin', role: 'admin', phone: '(305) 555-9999', address: '1 BuildConnect Plaza, Miami, FL 33101', avatar_color: '#1e40af', initials: 'BC', status: 'active', created_at: '2025-10-01T00:00:00Z' }

// ─── Leads ───
// Ship #233 — demo-mode seed trimmed to v-1 entries only so admin workflow
// count matches vendor view. Per Rodolfo directive (option C): "admin has to
// show the same as vendor." MOCK_VENDORS, MOCK_CATALOG, MOCK_TRANSACTIONS
// kept intact — those drive marketplace-browse + cross-vendor admin surfaces
// which still need multi-vendor data to render meaningfully.
export const MOCK_LEADS: Lead[] = [
  // account_rep_id stamps: demo rep uid (a8358341...) = profile.id when account_rep@buildc.net logs in.
  { id: 'L-0001', homeowner_id: 'ho-1', vendor_id: 'v-1', account_rep_id: 'a8358341-9c11-4d99-8c44-7885a5c45e48', project: 'Full Roof Replacement — Barrel Tile', value: 28500, status: 'pending', slot: '2026-04-14T09:00:00Z', permit_choice: true, service_category: 'roofing', pack_items: { material: ['barrel_tile'], service_type: ['replace'], addons: ['gutters'] }, sq_ft: 2100, financing: false, address: '1234 Coral Way, Miami, FL 33145', latitude: 25.7514, longitude: -80.2587, phone: '(305) 555-0101', email: 'maria@email.com', homeowner_name: 'Maria Rodriguez', received_at: '2026-04-07T14:22:00Z' },
  { id: 'L-0005', homeowner_id: 'ho-2', vendor_id: 'v-1', account_rep_id: 'a8358341-9c11-4d99-8c44-7885a5c45e48', project: 'Metal Roof + Solar Prep', value: 35000, status: 'pending', slot: '2026-04-17T14:00:00Z', permit_choice: true, service_category: 'roofing', pack_items: { material: ['metal'], service_type: ['replace'], addons: ['solar_prep', 'insulation'] }, sq_ft: 2400, financing: true, address: '5678 Kendall Dr, Miami, FL 33156', latitude: 25.6789, longitude: -80.3253, phone: '(786) 555-0202', email: 'james@email.com', homeowner_name: 'James Thompson', received_at: '2026-04-09T08:15:00Z' },
]

// ─── Closed Sales ───
// Ship #233 — trimmed to v-1 entries only to match MOCK_LEADS trim.
export const MOCK_CLOSED_SALES: ClosedSale[] = [
  { id: 'cs-3', lead_id: 'L-0001', vendor_id: 'v-1', homeowner_id: 'ho-1', sale_amount: 28500, vendor_share: 25650, commission: 2850, commission_paid: false, closed_at: '2026-04-08T16:00:00Z', homeowner_name: 'Maria Rodriguez', project: 'Full Roof Replacement — Barrel Tile' },
]

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
// Ship #233 — trimmed m-5/m-6 (L-0002 thread) after MOCK_LEADS trim.
export const MOCK_MESSAGES: Message[] = [
  { id: 'm-1', lead_id: 'L-0001', sender_id: 'ho-1', content: 'Hi, I wanted to confirm the barrel tile option includes removal of the old roof?', message_type: 'text', created_at: '2026-04-07T15:00:00Z' },
  { id: 'm-2', lead_id: 'L-0001', sender_id: 'v-1', content: 'Yes absolutely! Full tear-off, new underlayment, and barrel tile installation are all included. I\'ll also handle the permit filing.', message_type: 'text', created_at: '2026-04-07T15:12:00Z' },
  { id: 'm-3', lead_id: 'L-0001', sender_id: 'v-1', content: '', message_type: 'quote', quote_data: { items: [{ name: 'Barrel Tile Roof (2,100 sq ft)', price: 18375 }, { name: 'Tear-off & Disposal', price: 4200 }, { name: 'Gutter Installation', price: 3600 }, { name: 'Permit & Inspection', price: 2325 }], total: 28500 }, created_at: '2026-04-07T15:15:00Z' },
  { id: 'm-4', lead_id: 'L-0001', sender_id: 'ho-1', content: 'That looks great! See you on the 14th.', message_type: 'text', created_at: '2026-04-07T15:30:00Z' },
]

// ─── Transactions ───
export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'tx-1', type: 'commission', vendor_id: 'v-4', company: 'Elite Paving Co', detail: 'Stamped Concrete Driveway', customer: 'James Thompson', amount: 1800, date: '2026-04-12T10:00:00Z', status: 'paid' },
  { id: 'tx-2', type: 'commission', vendor_id: 'v-3', company: 'Paradise Pools FL', detail: 'Resort Pool with Spa & LED', customer: 'Sarah Chen', amount: 9750, date: '2026-04-09T12:00:00Z', status: 'pending' },
  { id: 'tx-3', type: 'commission', vendor_id: 'v-1', company: 'Apex Roofing & Solar', detail: 'Full Roof Replacement', customer: 'Maria Rodriguez', amount: 2850, date: '2026-04-08T16:00:00Z', status: 'pending' },
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
  revenue_share_pct: 10,
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
