-- 111_payment_methods_service_pay_in_purpose.sql
-- Tier-1 cards-on-file (Rod-directive via kratos msg 1782448311392):
-- homeowner saves pay-in method to profile ONCE, Step 3 checkout = single
-- "Pay $250" button against the saved method. SetupIntent → attach PaymentMethod
-- to customer → PaymentIntent.confirm(payment_method) on-session.
--
-- ARCHITECTURE: extends the existing public.payment_methods table (already
-- shipped in the Phase 0 stripe-connect work) to admit a new purpose value
-- 'service_pay_in'. The seller-side purposes ('membership','commissions','both')
-- stay untouched; this adds a third bucket for homeowner-side pay-in PMs that
-- the new Tier-1 checkout consults at Step 3 entry.
--
-- WHY EXTEND, NOT NEW TABLE: the column shape of payment_methods is identical
-- for both seller-side and homeowner-side PMs — id, user_id, stripe_customer_id,
-- stripe_payment_method_id, stripe_setup_intent_id, kind ∈ {card, us_bank_account},
-- brand, last4, exp_month, exp_year, bank_name, routing_last4, status. Only the
-- `purpose` value distinguishes context. A parallel `homeowner_payment_methods`
-- table would duplicate every column + double the RLS surface for no semantic
-- gain. Extending the existing CHECK keeps the schema small.
--
-- ROD-SCOPE (per kratos brief): rep_requests pay-in for homeowner role.
-- Vendor/rep seller-side membership/commission billing UNCHANGED.
--
-- COMPLIANCE:
--   - Additive, reversible. The CHECK constraint is replaced with a superset.
--     Rollback is a 1-line constraint swap back to the original triple.
--   - Zero backfill — current row count = 0 (probed llybxug 2026-06-26).
--   - No new columns, no RLS policy change, no FK change.
--   - admin === admin_employee parity preserved (no role-gating added here).
--
-- DOWNSTREAM CONSUMERS (NOT shipped in this mig, separate per-deliverable PR):
--   - payment-method-setup-intent-create edge fn (creates SetupIntent for save flow)
--   - payment-method-list edge fn (returns saved PMs filtered by purpose)
--   - payment-method-set-default / payment-method-detach edge fns
--   - create-rep-request edge fn modified to accept optional payment_method_id
--     and branch to confirm-against-saved-PM when present.

BEGIN;

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_purpose_check;

ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_purpose_check
  CHECK (purpose = ANY (ARRAY[
    'membership'::text,
    'commissions'::text,
    'both'::text,
    'service_pay_in'::text
  ]));

COMMIT;

-- ROLLBACK (reversible):
--   BEGIN;
--     ALTER TABLE public.payment_methods
--       DROP CONSTRAINT IF EXISTS payment_methods_purpose_check;
--     ALTER TABLE public.payment_methods
--       ADD CONSTRAINT payment_methods_purpose_check
--       CHECK (purpose = ANY (ARRAY['membership'::text,'commissions'::text,'both'::text]));
--     -- Any existing rows with purpose='service_pay_in' must be cleared first:
--     --   DELETE FROM public.payment_methods WHERE purpose = 'service_pay_in';
--   COMMIT;
