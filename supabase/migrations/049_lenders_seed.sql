-- 049_lenders_seed.sql
-- Seed 31-row lender registry per project_buildconnect_lender_network.
-- 15 Contractor POS + 11 Personal Loans + 5 Solar+HI Specialty = 31.
-- Rod-direct (5 of 6 — Wells Fargo deferred to Rod product call) flagged sort_order 0-4.
-- Idempotent on lower(name) per unique index.

insert into public.lenders (name, category, sort_order, notes) values
  -- Contractor POS (15)
  ('GoodLeap',                  'contractor_pos',     0,  'Rod-direct. Home-improvement specialty (solar + home reno); strong API.'),
  ('Momnt',                     'contractor_pos',     1,  'Rod-direct. POS lending for home services; in-flow approvals.'),
  ('Service Financial',         'contractor_pos',     2,  'Rod-direct. Home services vertical (aka Service Finance Company).'),
  ('Synchrony Bank',            'contractor_pos',     3,  'Rod-direct. Home Design card; major contractor partner (Synchrony Connect B2B portal).'),
  ('GreenSky',                  'contractor_pos',     10, 'Top-tier contractor POS; common in roofing/HVAC.'),
  ('Foundation Finance',        'contractor_pos',     11, 'Contractor-focused HI specialty.'),
  ('Aqua Finance',              'contractor_pos',     12, 'HI specialty (water/HVAC heavy).'),
  ('EnerBank USA',              'contractor_pos',     13, 'HI specialty (acquired by Regions Bank).'),
  ('Wisetack',                  'contractor_pos',     14, 'Contractor POS, home services.'),
  ('PowerPay',                  'contractor_pos',     15, 'Contractor POS, home services.'),
  ('Genesis Credit',            'contractor_pos',     16, 'Contractor POS.'),
  ('Affirm',                    'contractor_pos',     17, 'POS BNPL (home services adjacent).'),
  ('Klarna',                    'contractor_pos',     18, 'POS BNPL (home services adjacent).'),
  ('Acorn Finance',             'contractor_pos',     19, 'Contractor financing aggregator.'),
  ('Hearth',                    'contractor_pos',     20, 'Contractor financing aggregator.'),
  -- Personal Loans (11)
  ('Upgrade',                   'personal_loans',     4,  'Rod-direct. Personal loans + cards, home reno segment.'),
  ('SoFi',                      'personal_loans',     10, 'Personal loans, HI category.'),
  ('Marcus by Goldman Sachs',   'personal_loans',     11, 'Personal loans.'),
  ('Discover Personal Loans',   'personal_loans',     12, 'HI category.'),
  ('Best Egg',                  'personal_loans',     13, 'Personal loans, HI.'),
  ('LightStream',               'personal_loans',     14, 'Truist-owned; fast-approval personal loans.'),
  ('LendingClub',               'personal_loans',     15, 'Personal loans.'),
  ('Prosper',                   'personal_loans',     16, 'Peer-to-peer personal loans.'),
  ('Achieve',                   'personal_loans',     17, 'Freedom Financial; personal loans.'),
  ('Universal Credit',          'personal_loans',     18, 'Upgrade-affiliated personal loans.'),
  ('Avant',                     'personal_loans',     19, 'Personal loans.'),
  -- Solar+HI Specialty (5)
  ('Mosaic',                    'solar_hi_specialty', 10, 'Solar + home reno POS.'),
  ('Sunlight Financial',        'solar_hi_specialty', 11, 'Solar + HI POS.'),
  ('Sungage Financial',         'solar_hi_specialty', 12, 'Solar + battery home reno.'),
  ('EverBright',                'solar_hi_specialty', 13, 'Solar finance.'),
  ('Dividend Finance',          'solar_hi_specialty', 14, 'Fifth Third-owned; solar + HI.')
on conflict do nothing;
