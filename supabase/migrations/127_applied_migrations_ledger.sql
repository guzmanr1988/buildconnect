-- 127_applied_migrations_ledger.sql
-- Creates the migration-apply ledger. Records itself as its own first
-- provenance='apply' row via the footer below. Backfill seed for the
-- pre-ledger range (001-126) is migration 128; those are recorded as
-- provenance='backfill_assumed' + applied_by='unknown_pre_ledger' and are
-- NEVER collapsible with 'apply'.
--
-- Consumer: state/migration-apply-check.sh (kratos, boot-path), set-difference
-- both directions between origin/main supabase/migrations/*.sql and this
-- table. File-with-no-row = merged-but-unapplied (the class this ledger
-- closes). Row-with-no-file = applied-but-not-committed (task_260 direction,
-- comes free from the same comparison).
--
-- Design invariant (kratos task_148): the row insert lives INSIDE the
-- migration file itself, as the last statement of the file's own transaction.
-- If the applier writes the row, then recording is a separate act from
-- applying and the window between them is unbounded and invisible — which
-- is EXACTLY the defect this ledger is fixing, just relocated one step. Same
-- transaction ⟹ two cannot drift, because there is no moment at which one
-- has happened and the other has not.
--
-- Every future migration MUST wrap in begin;/commit; and end with the footer
-- template at supabase/migrations/_LEDGER_FOOTER_TEMPLATE.sql. Applier POST
-- body prepends `set app.agent_id = '<agent>';` so current_setting reads
-- non-null inside the migration; missing SET raises SQLSTATE 42704 LOUD
-- (kratos measured 2026-09-02T21:3xZ on prod), and empty string trips the
-- length check.

begin;

create table if not exists public.applied_migrations (
  filename        text        primary key,
  content_sha256  text        not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at      timestamptz not null default now(),
  applied_by      text        not null check (length(applied_by) > 0),
  provenance      text        not null check (provenance in ('apply','backfill_assumed'))
);

comment on table public.applied_migrations is
  'One row per supabase/migrations/*.sql file that has ever been applied to '
  'this database. Row insert is the last statement of the migration''s own '
  'transaction (footer template in supabase/migrations/_LEDGER_FOOTER_TEMPLATE.sql), '
  'so applying the file IS recording it — the two cannot drift. Consumer is '
  'state/migration-apply-check.sh (kratos), set-difference against origin/main. '
  'CONSUMER REPORT DISCIPLINE: a file-with-no-row is INDISTINGUISHABLE from '
  'within this table alone between (a) merged-but-never-applied and (b) applied '
  'without the footer (author omitted the boundary + INSERT). The check MUST '
  'report both candidate causes on any missing row and MUST NOT assert '
  '"not applied" — that overclaims the discriminator. Mechanical enforcement '
  '(CI check on filenames >= 127 requiring the boundary + a footer INSERT '
  'naming the file''s own name) is filed as a follow-up.';

comment on column public.applied_migrations.content_sha256 is
  'SHA-256 of the migration BODY, canonicalized by stripping the LEDGER FOOTER '
  'BOUNDARY line and everything below. Producer and checker MUST compute '
  'IDENTICALLY using: git show origin/main:supabase/migrations/<filename> | '
  'awk ''/^-- LEDGER FOOTER BOUNDARY BELOW/{exit}{print}'' | shasum -a 256 | '
  'cut -d '' '' -f1. Uses origin/main (permanent first-parent ref) not HEAD '
  '(moves per checkout) and not a squash-source SHA (may be unreachable in a '
  'fresh clone). A hash differing by a trailing newline reads as drift on a '
  'byte-identical file. Pre-ledger migrations (001-126) have no boundary '
  'marker; the awk falls through and hashes the whole file — that is the '
  'seeded value under provenance=''backfill_assumed'' and represents CURRENT '
  'on-disk content, not the historically applied content. COVERAGE STATEMENT: '
  'this column covers the migration body ONLY. By construction the boundary '
  'strips the footer, so any later edit to the footer INSERT itself (the '
  'recorded filename literal, the provenance literal, the applied_by expression) '
  'is invisible to any drift check reading this column. That is an acceptable '
  'bound because the footer is generated from the template rather than '
  'authored — but do NOT read a matching sha as evidence the footer is '
  'unchanged.';

comment on column public.applied_migrations.applied_by is
  'Agent identity that ran the mgmt-api POST. Live-apply migrations read via '
  'current_setting(''app.agent_id''); applier MUST prepend '
  '`set app.agent_id = ''<agent>'';` to the POST body. Missing SET raises '
  'SQLSTATE 42704 "unrecognized configuration parameter" LOUD (measured on '
  'prod 2026-09-02T21:3xZ); empty string trips the length check. Both failure '
  'modes ROLLBACK the migration — apply and record fall together. Backfill '
  'seed rows carry applied_by=''unknown_pre_ledger'' because 001-126 were '
  'applied before this ledger existed and their actor cannot be recovered — '
  'recording any real name here would be fabricated attribution and would '
  'defeat provenance=''backfill_assumed'' by writing the same lie into the '
  'field beside the guard. GAP THIS COLUMN CANNOT CATCH: a migration file '
  'that lacks the footer entirely applies successfully and leaves no row at '
  'all, which is invisible to any check on this column. That failure mode is '
  'structural — apply and record are the same statement, and a file without '
  'the footer records nothing. Mechanical enforcement is the follow-up CI '
  'check filed on task_148 close, not a check on this table.';

comment on column public.applied_migrations.provenance is
  '''apply'' = row was written by the migration itself (real apply, cryptographically '
  'tied to the file content via content_sha256). ''backfill_assumed'' = seeded once '
  'for pre-ledger migrations (001-126, sha represents current file, not applied '
  'file, and applied_by=''unknown_pre_ledger''). NEVER collapse the two in '
  'consumer readouts — kratos''s check reports "N assumed / M verified", not a '
  'single number. A detector that reports the pre-ledger range CLEAN is '
  'reporting an assumption it never measured.';

-- LEDGER FOOTER BOUNDARY BELOW
insert into public.applied_migrations (filename, content_sha256, applied_by, provenance)
values ('127_applied_migrations_ledger.sql', '<SHA_COMPUTED_AT_COMMIT_TIME>', current_setting('app.agent_id'), 'apply');

commit;
