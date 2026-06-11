-- 090_lenders_seed_slice_fastlane_and_credit_unions_flag.sql
--
-- Pin-25 paired seed:
--
-- (1) feature_flags row 'financing_category_credit_unions' enabled=true.
--     Mirrors 052/056 per-category seed pattern. Default-ON so the new
--     Credit Unions admin tab + Category Gates card render correctly on
--     first load even before any admin toggles the flag. Idempotent on
--     key PK. Bundle code (pin-25) also defaults the gate to ON when the
--     row is missing (flags[key] !== false), so this seed is belt-and-
--     suspenders rather than load-bearing.
--
-- (2) 2 contractor_pos lender rows — athena-verified, kratos card-add
--     1781125953527. Both go in contractor_pos category (contractor POS
--     home-improvement financing). After apply:
--       SELECT count(*) FROM public.lenders
--         WHERE category='contractor_pos' AND deleted_at IS NULL
--     goes 17 -> 19.
--
--     sort_order 21/22 = continuing the non-Rod-direct contractor_pos
--     band (049 used 10-20; Slice/Fastlane append at the tail). Both
--     adapter paths are URL-redirect (no in-flow API today) so
--     apply_instructions stays null — homeowner clicks "Apply at Lender"
--     and lands on the lender's contact/join form.
--
--     Per kratos no-guess-on-partial-data guardrail: Fastlane APR/term
--     ranges were not publicly available (only the 0.25% AutoPay discount
--     fact). Schema has no APR/term columns anyway, so the facts that DO
--     exist are folded into notes; missing facts are simply omitted
--     rather than fabricated.
--
--     Schema columns populated (per 048 + 057):
--       - name             text
--       - category         lender_category enum
--       - sort_order       integer
--       - notes            text  (free-form: parent bank + NMLS + product +
--                                 loan/APR/term/coverage facts)
--       - apply_url        text  (HTTPS-only check constraint enforced)
--     Skipped: contact_email (none provided), apply_instructions (no
--     special copy — URL-redirect path is self-explanatory).
--
-- Idempotent on lower(name) per lenders_name_unique partial index.
-- HTTPS check constraint (lenders_apply_url_https_only from 057) auto-
-- validates the two new URLs are HTTPS — both are.

-- (1) Credit Unions category feature flag seed
insert into public.feature_flags (key, enabled, description) values
  ('financing_category_credit_unions', true, 'Category gate for Credit Unions financing partners (separate dataset from the lenders[] table — South Florida member-owned credit unions serving Miami-Dade / Broward / Palm Beach). OFF hides the admin Credit Unions tab and any homeowner-facing CU surface.')
on conflict (key) do nothing;

-- (2) 2 new contractor_pos lenders (Slice + Fastlane)
insert into public.lenders (name, category, sort_order, notes, apply_url) values
  ('Slice',    'contractor_pos', 21, 'Slice by First National Bank of Omaha (FNBO, Member FDIC, NMLS 412727). Direct-to-contractor POS home-improvement financing. Loan up to $150,000; terms up to 20 years; APR 8.49% (AutoPay) to 18.99% fixed; decision in minutes. National coverage (FL included). Marketing: https://www.fnbo.com/pos-lending/slice', 'https://www.fnbo.com/pos-lending/slice/contact'),
  ('Fastlane', 'contractor_pos', 22, 'Fastlane Lending Solutions, LLC (NMLS 2553773). Originating lender: Customers Bank (NMLS 699996). Serviced by Launch Servicing (NMLS 1766839). HQ: Coral Gables, FL (local-FL angle). POS contractor lending for HVAC / Roofing / Windows & Doors / Remodeling; up to 100% project financing on approved credit; 0.25% AutoPay discount. Marketing: https://fastlanelending.com/', 'https://join.fastlanelending.com/')
on conflict do nothing;
