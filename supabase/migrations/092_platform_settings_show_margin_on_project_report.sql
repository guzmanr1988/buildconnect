-- 092_platform_settings_show_margin_on_project_report.sql
-- Project-report PDF feature (task_1781646092609_783) — admin-toggleable
-- bool gating whether the customer-facing Project Report PDF (auto-
-- generated on Mark-as-Sold) renders the "Upsale" / margin line.
--
-- DEFAULT FALSE per Rod's directive: customer copy hides the margin by
-- default; admin can flip it via /admin/settings if a vendor wants the
-- transparent breakdown shown. Backward-safe — readers fall back to
-- false if the column is unexpectedly absent.
--
-- platform_settings has a singleton row pinned at id=1 (migration 069
-- pattern); ADD COLUMN against it picks up the default for the existing
-- row without an explicit UPDATE.

BEGIN;

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS show_margin_on_project_report boolean NOT NULL DEFAULT false;

COMMIT;
