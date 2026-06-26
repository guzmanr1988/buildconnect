-- 110_escrow_accounts_external_account.sql
-- Banking — add Stripe Connect external_account reference cols to escrow_accounts.
--
-- BACKFILL-CAPTURE: this migration is SOURCE-OF-TRUTH CAPTURE — the columns
-- were applied to llybxug prod via inline Mgmt-API SQL at deploy-time and the
-- canonical .sql file was never committed. DDL-scraped from
-- information_schema.columns on 2026-06-26 ~05:08Z and reconstructed here so
-- that re-applying this file to a clean DB produces byte-identical catalog
-- state to llybxug now (cols + types + nullability + defaults).
--
-- COLUMNS:
--   external_account_id          text NULL — Stripe ba_xxx (bank) or card_xxx
--                                              (debit) id returned by
--                                              connect-external-account-attach
--                                              (createToken → external_accounts
--                                              endpoint on the connected acct).
--   external_account_last4       text NULL — display-only last4 surfaced to
--                                              homeowner Payouts UI.
--   external_account_bank_name   text NULL — display-only bank name (e.g.
--                                              "Chase") for the same UI.
--
-- All three NULLABLE: rows existed before this mig (18 homeowner escrow_accounts
-- pre-provisioned 2026-04-18, 0 vendor) and there is no sane backfill for those
-- legacy rows. NULL = "no external_account attached yet" which the FE renders
-- as "Add bank account" CTA.
--
-- NO INDEX: these cols are read-only-by-id (escrow_account row already loaded
-- from rep_request lineage; no by-external_account_id query path exists).
--
-- NO FK to a Stripe-side object: external_account_id is the Stripe object id,
-- not a local FK target.
--
-- COMPLIANCE:
--   Strictly additive, reversible. ADD COLUMN IF NOT EXISTS, no backfill scan.
--   RLS policies on escrow_accounts are table-scoped (party_user_id = auth.uid()
--   on the existing select/update policies), so the new cols inherit access
--   uniformly without policy change.

BEGIN;

ALTER TABLE public.escrow_accounts
  ADD COLUMN IF NOT EXISTS external_account_id          text NULL,
  ADD COLUMN IF NOT EXISTS external_account_last4       text NULL,
  ADD COLUMN IF NOT EXISTS external_account_bank_name   text NULL;

COMMIT;

-- ROLLBACK (reversible):
--   BEGIN;
--     ALTER TABLE public.escrow_accounts
--       DROP COLUMN IF EXISTS external_account_bank_name,
--       DROP COLUMN IF EXISTS external_account_last4,
--       DROP COLUMN IF EXISTS external_account_id;
--   COMMIT;
