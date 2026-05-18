-- 055_lender_category_pace_enum.sql
-- Extend lender_category enum (defined in 048_admin_financing_surface.sql)
-- with 'pace' for PACE (Property Assessed Clean Energy) financing partners.
--
-- ROD-DIRECT 2026-05-18 00:50Z (via kratos msg 1779070524128): Rod reversed
-- the prior PACE exclusion (2026-05-16 21:37Z) specifically for 4 named
-- lenders — Ygrene, Homerun Financial, Renew Financial, Fortifi — without
-- opening the full PACE class. Per banked feedback_directive_named_sections
-- _are_literal: scope-lock to the 4 named.
--
-- Pattern: separate enum-widen migration mirrors 051
-- (audit_action_admin_create_approval). ALTER TYPE ADD VALUE cannot share a
-- transaction with INSERT statements that reference the new enum value, so
-- the lender + feature_flags seed lands in companion migration 056.
--
-- ADD VALUE IF NOT EXISTS is idempotent + non-blocking in PG 12+ (Supabase
-- runs PG 15).

alter type lender_category add value if not exists 'pace';
