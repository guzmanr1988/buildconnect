-- BuildConnect 2026 — paired DB sweep for Remodel service display-name.
--
-- Per Rod direct 2026-05-13: the Remodel wizard (formerly garage / Interior
-- Remodel) is being narrowed pre-launch. PR #231 renamed the constants.ts
-- entry name field 'Interior Remodel' → 'Remodel' but did NOT sweep the
-- live services table row, which catalog-store.ts unionBundledFillingGaps
-- treats as server-wins for every consumer (page header, doc title, cart
-- service line, project rows). Apollo dual-walk W4 caught the stale row
-- on apex post-merge:
--   pageHeader: "Interior Remodel" (expected: "Remodel")
--   docTitle:   "Interior Remodel — BuildConnect" (expected: "Remodel —")
--
-- Sibling-class to feedback_catalog_supabase_union_bundle_masks_bundle_ship,
-- widened from "optionGroups/options removal" to "ANY constants.ts string
-- with a paired services-table mirror, including name/description/badge
-- fields". Bank the refinement after SHIPPED-ping.
--
-- This migration is the RETROACTIVE audit-trail file for the UPDATE that
-- hermes already applied via PAT during the walk-verdict beat (PRE
-- name='Interior Remodel' POST name='Remodel' confirmed; R2 dual-write
-- 11/11 LOCKSTEP — services.status='live' AND services.phase2=true rows
-- still in lockstep post-rename). Idempotent on env-replay: re-running
-- on an already-renamed row is a no-op UPDATE.

update services
set name = 'Remodel'
where id = 'garage' and name = 'Interior Remodel';
