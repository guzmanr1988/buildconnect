#!/usr/bin/env node
// Arms for scripts/migration-public-grant-lint.mjs (task_1792501411627_671). No network; the CLI arm builds a throwaway
// git repo under the OS temp dir and removes it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findMissingGrants } from './migration-public-grant-lint.mjs';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (n) => readFileSync(path.join(here, '..', 'supabase', 'migrations', n), 'utf8');
const F = (s) => findMissingGrants(s);
const T = 'CREATE TABLE public.widgets (id uuid PRIMARY KEY);\n';

// REPLAY: a shipped table with no GRANT (lived off the auto-grant) is caught; a shipped column-grant file passes.
ok(F(mig('001_create_profiles.sql')).some((x) => x.startsWith('public.profiles ')), 'replay 001: profiles with no GRANT caught');
ok(F(mig('129_vendor_availability.sql')).some((x) => x.startsWith('public.vendor_schedule ')), 'replay 129 (newest table file): vendor_schedule with no GRANT caught');
ok(F(mig('113_column_gate_platform_app_settings.sql')).length === 0, 'replay 113: column GRANTs, no CREATE TABLE, passes');

// RED: each missing-grant shape.
ok(F(T).length === 1, 'CREATE TABLE public.x with no GRANT caught');
ok(F('CREATE TABLE widgets (id int);').length === 1, 'unqualified CREATE TABLE (default search_path = public) caught');
ok(F('create table if not exists public.widgets (id int);').length === 1, 'lower case IF NOT EXISTS caught');
ok(F('CREATE UNLOGGED TABLE public.widgets (id int);').length === 1, 'UNLOGGED caught');
ok(F('CREATE TABLE public.widgets AS SELECT 1 AS id;').length === 1, 'CREATE TABLE AS caught');
ok(F('CREATE TABLE public.widgets_2026 PARTITION OF public.widgets FOR VALUES IN (1);').length === 1, 'PARTITION OF caught');
ok(F('CREATE TABLE "Public"."Widgets" (id int);').length === 0, 'quoted "Public" is a different schema, not checked');
ok(F('CREATE TABLE public."Widgets" (id int); GRANT SELECT ON public.widgets TO authenticated;').length === 1, 'quoted "Widgets" is not widgets: grant on the other name caught');
ok(F(T + '-- GRANT SELECT ON public.widgets TO authenticated;').length === 1, 'GRANT only in a -- comment caught');
ok(F(T + '/* GRANT SELECT ON public.widgets TO authenticated; */').length === 1, 'GRANT only in a block comment caught');
ok(F(T + "DO $$ BEGIN RAISE NOTICE 'GRANT SELECT ON public.widgets TO authenticated'; END $$;").length === 1, 'GRANT only in a string literal caught');
ok(F(T + "DO $$ BEGIN EXECUTE format('GRANT SELECT ON public.%I TO authenticated', 'widgets'); END $$;").some((x) => x.includes('inside a string')), 'GRANT via EXECUTE format caught, message names the string');
ok(F(T + 'GRANT SELECT ON public.widgets TO PUBLIC;').length === 1, 'grant to PUBLIC does not count (documented)');
ok(F(T + 'GRANT SELECT ON public.widgets TO some_other_role;').length === 1, 'grant to a non-API role caught');
ok(F(T + 'GRANT SELECT ON public.gadgets TO authenticated;').length === 1, 'GRANT on a different table caught');
ok(F(T + 'GRANT SELECT ON ops_backup.widgets TO authenticated;').length === 1, 'GRANT on another schema same name caught');
ok(F(T + 'GRANT EXECUTE ON FUNCTION public.widgets() TO authenticated;').length === 1, 'GRANT ON FUNCTION same name caught');
ok(F(T + 'GRANT USAGE ON SEQUENCE public.widgets TO authenticated;').length === 1, 'GRANT ON SEQUENCE same name caught');
ok(F(T + 'GRANT ALL ON ALL TABLES IN SCHEMA ops_backup TO service_role;').length === 1, 'ALL TABLES IN another schema caught');
ok(F(T + 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;').length === 1, 'ALTER DEFAULT PRIVILEGES does not count (documented)');
ok(F("DO $$ BEGIN EXECUTE 'CREATE TABLE public.widgets (id int)'; END $$;").some((x) => x.startsWith('CREATE TABLE inside a string')), 'CREATE TABLE in dynamic SQL caught');
ok(F('CREATE TABLE public.a (id int); CREATE TABLE public.b (id int); GRANT SELECT ON public.a TO anon;').length === 1, 'two tables, one granted: the other caught');
ok(F(T + '-- no-api-grant:\n').length === 1, 'opt-out with no table and no reason does not count');
ok(F(T + '-- no-api-grant: widgets\n').length === 1, 'opt-out with no reason does not count');
ok(F(T + '-- no-api-grant: gadgets internal only\n').length === 1, 'opt-out naming a different table does not count');

// GREEN: each granted shape passes.
ok(F(T + 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.widgets TO authenticated;').length === 0, 'GRANT .. ON public.x TO authenticated passes');
ok(F(T + 'GRANT ALL ON TABLE public.widgets TO service_role;').length === 0, 'ON TABLE form passes');
ok(F(T + 'grant select on widgets to anon;').length === 0, 'lower case, unqualified passes');
ok(F(T + 'GRANT SELECT ON public.gadgets, public.widgets TO anon, authenticated;').length === 0, 'table in a list, role in a list passes');
ok(F(T + 'GRANT SELECT (id) ON public.widgets TO authenticated;').length === 0, 'column grant passes');
ok(F(T + 'GRANT ALL ON public.widgets TO service_role WITH GRANT OPTION;').length === 0, 'WITH GRANT OPTION passes');
ok(F(T + 'GRANT SELECT ON public.widgets TO "authenticated";').length === 0, 'quoted role passes');
ok(F('GRANT SELECT ON public.widgets TO authenticated;\n' + T).length === 0, 'GRANT before the CREATE passes');
ok(F(T + 'GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;').length === 0, 'ALL TABLES IN SCHEMA public passes');
ok(F('CREATE TABLE "Widgets" (id int); GRANT SELECT ON "Widgets" TO anon;').length === 0, 'quoted name granted by the same quoted name passes');
ok(F(T + '-- no-api-grant: widgets internal audit log, read only through a SECURITY DEFINER RPC\n').length === 0, 'opt-out naming the table with a reason passes');
ok(F(T + '-- no-api-grant: public.widgets internal\n').length === 0, 'opt-out with public. prefix passes');
ok(F("DO $$ BEGIN EXECUTE 'CREATE TABLE public.widgets (id int)'; END $$;\n-- no-api-grant: * dynamic per-month tables, service code only\n").length === 0, 'opt-out * clears the dynamic finding');

// NEG: tables the rule does not cover.
ok(F('CREATE TEMP TABLE scratch (id int);').length === 0, 'TEMP table not checked');
ok(F('CREATE TEMPORARY TABLE IF NOT EXISTS scratch (id int);').length === 0, 'TEMPORARY table not checked');
ok(F('CREATE TABLE ops_backup.widgets_20261020 AS SELECT 1;').length === 0, 'table in another schema not checked');
ok(F('ALTER TABLE public.widgets ADD COLUMN x int;').length === 0, 'ALTER TABLE not checked');
ok(F('-- CREATE TABLE public.widgets (id int);\nSELECT 1;').length === 0, 'commented-out CREATE TABLE not checked');

// CLI arm: only files the PR adds are read, so the shipped no-grant files never fail a PR.
const repo = mkdtempSync(path.join(tmpdir(), 'grantlint-'));
try {
  const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  mkdirSync(path.join(repo, 'supabase', 'migrations'), { recursive: true });
  const w = (n, s) => writeFileSync(path.join(repo, 'supabase', 'migrations', n), s);
  w('129_old.sql', 'CREATE TABLE public.old_log (id int);');
  g('add', '-A'); g('commit', '-qm', 'base'); const base = g('rev-parse', 'HEAD').trim();
  const cli = (head) => { try { execFileSync('node', [path.join(here, 'migration-public-grant-lint.mjs'), '--base', base, '--head', head], { cwd: repo, stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
  w('131_granted.sql', T + 'GRANT ALL ON public.widgets TO service_role;'); g('add', '-A'); g('commit', '-qm', 'granted');
  ok(cli('HEAD') === 0, 'CLI: shipped no-grant file on base + granted added file = rc 0');
  w('132_no_grant.sql', 'CREATE TABLE public.gadgets (id int);'); g('add', '-A'); g('commit', '-qm', 'no grant');
  ok(cli('HEAD') === 1, 'CLI: added table with no GRANT = rc 1');
  ok(cli(base) === 0, 'CLI: no added files = rc 0');
} finally {
  rmSync(repo, { recursive: true, force: true });
}

if (fail) { console.error(`verify-migration-public-grant-lint: ${fail} FAIL`); process.exit(1); }
console.log('verify-migration-public-grant-lint: all pass');
