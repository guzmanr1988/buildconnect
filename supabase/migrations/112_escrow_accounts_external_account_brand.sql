-- 112_escrow_accounts_external_account_brand.sql
-- Item-4 (Rod "Add payout bank" → must accept a DEBIT card) support.
-- Adds nullable text column for card brand (Visa/MasterCard/Amex/etc.) so
-- the saved external_account display row survives a page reload with full
-- "Visa ••••4242" copy rather than degrading to just "••••4242". Bank EAs
-- carry bank_name in external_account_bank_name; card EAs carry brand here.
-- Both columns are nullable and additive — no FE-breaking change on existing
-- bank-only rows.

ALTER TABLE public.escrow_accounts
  ADD COLUMN IF NOT EXISTS external_account_brand text;

COMMENT ON COLUMN public.escrow_accounts.external_account_brand IS
  'Card brand for card-kind external_accounts (Visa/MC/Amex/etc.). NULL for bank-kind. Cached from Stripe PaymentMethod-style card.brand to avoid a Stripe round-trip on every render.';
