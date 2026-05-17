-- 051_audit_action_admin_create_approval.sql
-- Extend audit_action enum (defined in 048_admin_financing_surface.sql) with
-- 'admin_create_approval' for the helios admin-create-approval Edge Fn
-- (PR #257) and any downstream admin manual-approval flows.
--
-- Pattern: each new admin Edge Fn ships its own ALTER TYPE migration as it
-- lands, keeping action enum values bound to consumers that actually use them
-- (avoids speculative naming drift per feedback_no_pre_allocated_pr_numbers
-- analog — bind name to actual consumer).
--
-- ADD VALUE IF NOT EXISTS is idempotent + non-blocking in PG 12+ (Supabase
-- runs PG 15). Cannot run inside a transaction wrap; Supabase Management API
-- SQL endpoint accepts a single-statement DDL fine.

alter type audit_action add value if not exists 'admin_create_approval';
