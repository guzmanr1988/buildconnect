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
  // fixture: PR 2 walk-only — suspended vendor covering roofing; used to verify
  // status gate excludes suspended from homeowner shopping. Reused for PR 3 walk.
  { id: 'v-fix-suspended', email: 'fixture-suspended@vendor.com', name: 'Fixture Suspended', role: 'vendor', phone: '(000) 000-0000', address: '0 Test St, Miami, FL 33100', latitude: 25.7600, longitude: -80.2000, company: 'Fixture Suspended Roofing Co', avatar_color: '#64748b', initials: 'FS', status: 'suspended', created_at: '2026-01-01T00:00:00Z', service_categories: ['roofing'], rating: 4.0, response_time: '~2 hours', verified: false, financing_available: false, total_reviews: 0, commission_pct: 10, reps: [] },
  // fixture: PR 3 walk-only — active vendor with roofing in service_categories but
  // NO CatalogItem entries, so it passes the status gate but fails the per-service
  // pricing gate for any roofing cart (walk-2) and any multi-service cart (walk-3).
  { id: 'v-fix-no-pricing', email: 'fixture-no-pricing@vendor.com', name: 'Fixture No Pricing', role: 'vendor', phone: '(000) 000-0001', address: '1 Test St, Miami, FL 33100', latitude: 25.7601, longitude: -80.2001, company: 'Fixture No Pricing Roofing Co', avatar_color: '#a1a1aa', initials: 'FN', status: 'active', created_at: '2026-01-01T00:00:00Z', service_categories: ['roofing', 'air_conditioning'], rating: 4.0, response_time: '~2 hours', verified: false, financing_available: false, total_reviews: 0, commission_pct: 10, reps: [] },
  // fixture: satellite-draw Layer 4 — 3 vendors with per-sqft catalog items for
  // SatelliteMeasure calculation-path validation (roofing / air_conditioning / windows_doors).
  { id: 'v-sat-1', email: 'precision@vendor.com', name: 'Derek Fontaine', role: 'vendor', phone: '(305) 555-7001', address: '710 NW 22nd Ave, Miami, FL 33125', latitude: 25.7742, longitude: -80.2280, company: 'Precision Roofing Co', avatar_color: '#d97706', initials: 'PR', status: 'active', created_at: '2026-01-10T08:00:00Z', service_categories: ['roofing'], rating: 4.7, response_time: '~2 hours', verified: true, financing_available: true, total_reviews: 58, commission_pct: 10, reps: [] },
  { id: 'v-sat-2', email: 'arcticair@vendor.com', name: 'Sandra Vela', role: 'vendor', phone: '(305) 555-7002', address: '820 SW 57th Ave, Miami, FL 33144', latitude: 25.7432, longitude: -80.2980, company: 'Arctic Air Systems', avatar_color: '#0284c7', initials: 'AA', status: 'active', created_at: '2026-02-01T09:00:00Z', service_categories: ['air_conditioning'], rating: 4.6, response_time: '~3 hours', verified: true, financing_available: false, total_reviews: 34, commission_pct: 10, reps: [] },
  { id: 'v-sat-3', email: 'clearview@vendor.com', name: 'Paul Estrada', role: 'vendor', phone: '(305) 555-7003', address: '940 NW 36th St, Miami, FL 33127', latitude: 25.8014, longitude: -80.2197, company: 'ClearView Impact Glass', avatar_color: '#0891b2', initials: 'CV', status: 'active', created_at: '2026-02-15T10:00:00Z', service_categories: ['windows_doors'], rating: 4.8, response_time: '~2 hours', verified: true, financing_available: true, total_reviews: 47, commission_pct: 10, reps: [] },
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
  // ci-11: v-1 HVAC item — enables Apex to pass the per-service pricing gate on
  // roofing+AC carts (Walk 3 of PR 3). v-1 has air_conditioning in service_categories.
  { id: 'ci-11', vendor_id: 'v-1', category: 'air_conditioning', name: 'Mini-Split AC System', description: 'Mitsubishi 2-zone ductless', unit: 'flat_rate', price: 3200, active: true, multiplier: 1.0 },
  // fixture: PR 3 walk-only — active vendor with roofing in service_categories but
  // no CatalogItem, so it fails the per-service pricing gate for any cart. Reused
  // for PR 3 walk-2 (per-service gate fires) and walk-3 (cross-category check).
  // fixture: satellite-draw Layer 4 — per-sqft items for SatelliteMeasure calculation
  // paths. Three price tiers on roofing validate low/mid/high sqft quote paths.
  // air_conditioning and windows_doors cover multi-service satellite measurements.
  { id: 'ci-sat-r1', vendor_id: 'v-sat-1', category: 'roofing', name: 'Architectural Shingle HD', description: 'GAF Timberline HDZ — 30-year', unit: 'per_sq_ft', price: 3.85, active: true, multiplier: 1.0 },
  { id: 'ci-sat-r2', vendor_id: 'v-sat-1', category: 'roofing', name: 'Barrel Tile Premium', description: 'Monier Eagle Capistrano', unit: 'per_sq_ft', price: 7.20, active: true, multiplier: 1.0 },
  { id: 'ci-sat-r3', vendor_id: 'v-sat-1', category: 'roofing', name: 'Standing Seam Metal', description: '24-gauge galvalume, hidden fastener', unit: 'per_sq_ft', price: 11.50, active: true, multiplier: 1.0 },
  { id: 'ci-sat-a1', vendor_id: 'v-sat-2', category: 'air_conditioning', name: 'Whole-Home AC Coverage', description: 'Carrier Comfort series, conditioned sq ft', unit: 'per_sq_ft', price: 6.00, active: true, multiplier: 1.0 },
  { id: 'ci-sat-a2', vendor_id: 'v-sat-2', category: 'air_conditioning', name: 'Premium Zoned HVAC', description: 'Trane XV series, multi-zone, conditioned sq ft', unit: 'per_sq_ft', price: 9.50, active: true, multiplier: 1.0 },
  { id: 'ci-sat-w1', vendor_id: 'v-sat-3', category: 'windows_doors', name: 'Impact-Rated Glass Area', description: 'PGT WinGuard, glass sq ft installed', unit: 'per_sq_ft', price: 16.00, active: true, multiplier: 1.0 },
  { id: 'ci-sat-w2', vendor_id: 'v-sat-3', category: 'windows_doors', name: 'Hurricane Laminated Glass', description: 'CGI Sentinel, laminated safety glass sq ft', unit: 'per_sq_ft', price: 22.00, active: true, multiplier: 1.0 },
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
// Dynamically generated relative to today so slots are always in the future.
// Generates days 3-14 from today with staggered time windows.
function generateAvailableSlots(): { date: string; times: string[] }[] {
  const now = new Date()
  const allTimes = [
    ['09:00', '10:00', '11:00', '14:00', '15:00'],
    ['09:00', '10:00', '13:00', '14:00'],
    ['10:00', '11:00', '14:00', '15:00', '16:00'],
    ['09:00', '11:00', '14:00'],
    ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'],
  ]
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() + 3 + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: dateStr, times: allTimes[i % allTimes.length] }
  })
}
export const MOCK_AVAILABLE_SLOTS = generateAvailableSlots()
