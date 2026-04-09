-- BuildConnect 2026 — Seed Data for Development
-- Run with: supabase db reset (applies migrations + seed)

-- Note: In production, profiles are created via auth triggers.
-- For local dev, we insert directly.

-- Homeowners
insert into profiles (id, email, name, role, phone, address, avatar_color, initials, status) values
  ('00000000-0000-0000-0000-000000000001', 'maria@email.com', 'Maria Rodriguez', 'homeowner', '(305) 555-0101', '1234 Coral Way, Miami, FL 33145', '#3b82f6', 'MR', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'james@email.com', 'James Thompson', 'homeowner', '(786) 555-0202', '5678 Kendall Dr, Miami, FL 33156', '#8b5cf6', 'JT', 'active'),
  ('00000000-0000-0000-0000-000000000003', 'sarah@email.com', 'Sarah Chen', 'homeowner', '(954) 555-0303', '910 Princeton Blvd, Homestead, FL 33032', '#ec4899', 'SC', 'active');

-- Vendors
insert into profiles (id, email, name, role, phone, address, company, avatar_color, initials, status) values
  ('00000000-0000-0000-0000-000000000011', 'apex@vendor.com', 'Carlos Mendez', 'vendor', '(305) 555-1001', '100 NW 7th St, Miami, FL 33136', 'Apex Roofing & Solar', '#f59e0b', 'AM', 'active'),
  ('00000000-0000-0000-0000-000000000012', 'shield@vendor.com', 'Tony Rivera', 'vendor', '(786) 555-1002', '200 SW 8th St, Miami, FL 33130', 'Shield Impact Windows', '#3b82f6', 'TR', 'active'),
  ('00000000-0000-0000-0000-000000000013', 'paradise@vendor.com', 'Ana Martinez', 'vendor', '(305) 555-1003', '300 Brickell Ave, Miami, FL 33131', 'Paradise Pools FL', '#06b6d4', 'PM', 'active'),
  ('00000000-0000-0000-0000-000000000014', 'elite@vendor.com', 'David Kim', 'vendor', '(954) 555-1004', '400 Las Olas Blvd, Ft Lauderdale, FL 33301', 'Elite Paving Co', '#10b981', 'EP', 'active'),
  ('00000000-0000-0000-0000-000000000015', 'coolbreeze@vendor.com', 'Mike Johnson', 'vendor', '(305) 555-1005', '500 Bird Rd, Miami, FL 33155', 'Cool Breeze HVAC', '#ef4444', 'CB', 'pending');

-- Admin
insert into profiles (id, email, name, role, phone, address, avatar_color, initials, status) values
  ('00000000-0000-0000-0000-000000000099', 'admin@buildconnect.com', 'BuildConnect Admin', 'admin', '(305) 555-9999', '1 BuildConnect Plaza, Miami, FL 33101', '#1e40af', 'BC', 'active');

-- Leads
insert into leads (id, homeowner_id, vendor_id, project, value, status, slot, permit_choice, service_category, pack_items, sq_ft, financing, address, phone, email, homeowner_name, received_at) values
  ('L-0001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Full Roof Replacement — Barrel Tile', 28500, 'confirmed', '2026-04-14 09:00:00+00', true, 'roofing', '{"material": ["barrel_tile"], "service_type": ["replace"], "addons": ["gutters"]}', 2100, false, '1234 Coral Way, Miami, FL 33145', '(305) 555-0101', 'maria@email.com', 'Maria Rodriguez', '2026-04-07 14:22:00+00'),
  ('L-0002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', 'Impact Windows — Full Home', 42000, 'pending', '2026-04-15 10:00:00+00', true, 'windows_doors', '{"glass_type": ["impact_plus"], "products": ["single_hung", "sliding", "entry"], "scope": ["full"]}', 2400, true, '5678 Kendall Dr, Miami, FL 33156', '(786) 555-0202', 'james@email.com', 'James Thompson', '2026-04-08 09:45:00+00'),
  ('L-0003', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000013', 'Resort Pool with Spa & LED', 65000, 'confirmed', '2026-04-16 11:00:00+00', true, 'pool', '{"model": ["16x32"], "paver": ["travertine"], "addons": ["spa", "led"]}', 3200, false, '910 Princeton Blvd, Homestead, FL 33032', '(954) 555-0303', 'sarah@email.com', 'Sarah Chen', '2026-04-06 16:10:00+00'),
  ('L-0004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 'Paver Driveway — Full Install', 18500, 'rescheduled', '2026-04-18 09:00:00+00', false, 'driveways', '{"surface": ["pavers"], "scope": ["full"], "addons": ["border", "lighting"]}', 2100, false, '1234 Coral Way, Miami, FL 33145', '(305) 555-0101', 'maria@email.com', 'Maria Rodriguez', '2026-04-05 11:30:00+00');

-- Closed Sales
insert into closed_sales (lead_id, vendor_id, homeowner_id, sale_amount, commission_paid, commission_paid_at, closed_at, homeowner_name, project) values
  ('L-0004', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 18500, true, '2026-04-12 10:00:00+00', '2026-04-10 15:00:00+00', 'Maria Rodriguez', 'Paver Driveway — Full Install');

-- Catalog Items
insert into vendor_catalog_items (vendor_id, category, name, description, unit, price, active) values
  ('00000000-0000-0000-0000-000000000011', 'roofing', 'Architectural Shingle', 'GAF Timberline HDZ', 'per_sq_ft', 4.50, true),
  ('00000000-0000-0000-0000-000000000011', 'roofing', 'Barrel Tile', 'Eagle Roofing Capistrano', 'per_sq_ft', 8.75, true),
  ('00000000-0000-0000-0000-000000000011', 'roofing', 'Standing Seam Metal', '24-gauge galvalume', 'per_sq_ft', 12.00, true),
  ('00000000-0000-0000-0000-000000000012', 'windows_doors', 'Single-Hung Impact Window', 'PGT WinGuard', 'per_unit', 850.00, true),
  ('00000000-0000-0000-0000-000000000012', 'windows_doors', 'Sliding Glass Door', 'PGT WinGuard 8ft', 'per_unit', 2400.00, true),
  ('00000000-0000-0000-0000-000000000013', 'pool', '16x32 Resort Pool', 'Gunite with vanishing edge', 'flat_rate', 55000.00, true),
  ('00000000-0000-0000-0000-000000000014', 'driveways', 'Interlocking Pavers', 'Belgard Catalina', 'per_sq_ft', 15.00, true);

-- Messages
insert into messages (lead_id, sender_id, content, message_type, created_at) values
  ('L-0001', '00000000-0000-0000-0000-000000000001', 'Hi, I wanted to confirm the barrel tile option includes removal of the old roof?', 'text', '2026-04-07 15:00:00+00'),
  ('L-0001', '00000000-0000-0000-0000-000000000011', 'Yes absolutely! Full tear-off, new underlayment, and barrel tile installation are all included.', 'text', '2026-04-07 15:12:00+00');

-- Transactions
insert into transactions (type, vendor_id, company, detail, customer, amount, date, status) values
  ('commission', '00000000-0000-0000-0000-000000000014', 'Elite Paving Co', 'Paver Driveway', 'Maria Rodriguez', 2775, '2026-04-12 10:00:00+00', 'paid'),
  ('membership', '00000000-0000-0000-0000-000000000011', 'Apex Roofing & Solar', 'Monthly Subscription', null, 35, '2026-04-01 00:00:00+00', 'paid'),
  ('membership', '00000000-0000-0000-0000-000000000012', 'Shield Impact Windows', 'Monthly Subscription', null, 35, '2026-04-01 00:00:00+00', 'paid'),
  ('membership', '00000000-0000-0000-0000-000000000013', 'Paradise Pools FL', 'Monthly Subscription', null, 35, '2026-04-01 00:00:00+00', 'paid'),
  ('membership', '00000000-0000-0000-0000-000000000014', 'Elite Paving Co', 'Monthly Subscription', null, 35, '2026-04-01 00:00:00+00', 'paid');

-- Bugs
insert into bugs (reporter_id, description, priority, status, created_at) values
  ('00000000-0000-0000-0000-000000000099', 'Vendor compare page sometimes shows stale pricing after catalog update', 'high', 'open', '2026-04-07 09:00:00+00'),
  ('00000000-0000-0000-0000-000000000011', 'Calendar slot picker not showing Saturday availability', 'medium', 'in_progress', '2026-04-05 14:30:00+00');

-- App Settings (already inserted by migration default)
