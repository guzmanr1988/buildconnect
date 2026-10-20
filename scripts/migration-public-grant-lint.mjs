#!/usr/bin/env node
/**
 * Migration public-grant lint (task_1792501411627_671, Sir go 2026-10-20T13:03Z, kratos qmn4f).
 *
 * Supabase stops auto-granting new tables in `public` to anon / authenticated / service_role: new projects from
 * 2026-05-30, every existing project (this one included) from 2026-10-30 (changelog #45329). After that, a table
 * created with no GRANT is invisible to the Data API: supabase-js and edge functions get 42501, even with the
 * service key, and RLS policies on it do nothing because the role cannot reach the table at all. Measured on main
 * 2026-10-20: all 31 files here that create a public table have no GRANT in the same file (113 later re-grants
 * some columns); they live off the old auto-grant. Build Credit / Build Leads grant every table they create.
 *
 * Rule: every CREATE TABLE in a migration the PR adds that lands in public (schema `public`, or no schema: the
 * default search_path) must be named in a GRANT ... ON [TABLE] <list> TO <roles> in the same file, where <roles>
 * includes anon, authenticated or service_role. `GRANT ... ON ALL TABLES IN SCHEMA public TO <one of them>` covers
 * every table in the file. Column grants (`GRANT SELECT (a, b) ON t TO ...`) count. Before or after the CREATE,
 * either is fine. TEMP / TEMPORARY tables and tables in other schemas (ops_backup, ...) are not checked.
 * Comments are stripped and '...' string contents blanked first, so a commented-out GRANT does not count. A CREATE
 * TABLE inside a string (dynamic SQL for EXECUTE) cannot be read, so it is a finding; so is a table whose only
 * grant is inside a string (EXECUTE format('GRANT ... ON public.%I', t)): write the GRANT literally, or opt out.
 *
 * Opt-out, for a table that must stay off the API on purpose: a line `-- no-api-grant: <table> <reason>` (table
 * with or without `public.`; the reason is what the reviewer reads). `-- no-api-grant: * <reason>` exempts every
 * table in the file, the dynamic-SQL finding included.
 *
 * Documented LOWs: a REVOKE after the GRANT is not tracked (the GRANT still counts); a grant to PUBLIC does not
 * count (name the Supabase role); ALTER DEFAULT PRIVILEGES does not count; ALTER TABLE ... SET SCHEMA public is not
 * read; a GRANT inside a dead branch (IF false THEN ...) still counts.
 * Files already on main are never read (only names added by the PR), so the historical files do not fail every PR.
 *
 * Usage: node scripts/migration-public-grant-lint.mjs --pr-merge                    (CI: HEAD must be the PR merge commit)
 *        node scripts/migration-public-grant-lint.mjs --base <ref> [--head <ref>]   (head defaults to HEAD)
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OPT_OUT = /^[ \t]*--[ \t]*no-api-grant:[ \t]*(\S+)[ \t]+\S/gm;
const API_ROLES = new Set(['anon', 'authenticated', 'service_role']);
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
const QNAME = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;
const CREATE = new RegExp(String.raw`\bCREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QNAME})`, 'gi');
const GRANT = /\bGRANT\b([^;]*?)\bON\b([^;]*?)\bTO\b([^;]*)/gi;
const DYN_CREATE = /\bCREATE\s+(?:\w+\s+)*?TABLE\b/i;

// Comments become spaces; a '...' literal keeps its quotes but loses its contents. Returns the scrubbed text and
// how many literals hold a CREATE TABLE / a GRANT (dynamic SQL the lint cannot read).
export function scrub(sql) {
  let out = '', i = 0, dynCreate = 0, dynGrant = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) { const j = sql.indexOf('\n', i); i = j < 0 ? sql.length : j; out += ' '; continue; }
    if (sql.startsWith('/*', i)) { const j = sql.indexOf('*/', i + 2); i = j < 0 ? sql.length : j + 2; out += ' '; continue; }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      const lit = sql.slice(i + 1, j);
      if (DYN_CREATE.test(lit)) dynCreate++;
      if (/\bGRANT\b[\s\S]*\bON\b[\s\S]*\bTO\b/i.test(lit)) dynGrant++;
      out += "''"; i = j + 1; continue;
    }
    out += sql[i++];
  }
  return { body: out, dynCreate, dynGrant };
}

// One identifier as Postgres resolves it: "Quoted" keeps its case, bare folds to lower case.
const ident = (s) => (s.startsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s.toLowerCase());
// [schema|null, table] from `a.b` or `b`.
function qname(s) {
  const parts = (s.match(new RegExp(IDENT, 'g')) ?? ['']).map(ident);
  return parts.length === 2 ? parts : [null, parts[0]];
}

// Pure: the missing-grant findings in one migration's SQL text. [] when clean or opted out.
export function findMissingGrants(sql) {
  const optOut = new Set([...sql.matchAll(OPT_OUT)].map((m) => (m[1] === '*' ? '*' : qname(m[1])[1])));
  if (optOut.has('*')) return [];
  const { body, dynCreate, dynGrant } = scrub(sql);
  const found = [];
  if (dynCreate) found.push('CREATE TABLE inside a string (dynamic SQL): the lint cannot read which table it makes or whether it is granted');

  const tables = [];
  for (const m of body.matchAll(CREATE)) {
    if (m[1] && /^TEMP/i.test(m[1])) continue;
    const [schema, table] = qname(m[2]);
    if (schema !== null && schema !== 'public') continue;
    if (!tables.includes(table)) tables.push(table);
  }
  if (!tables.length) return found;

  let allTables = false;
  const granted = new Set();
  for (const g of body.matchAll(GRANT)) {
    const roles = g[3].replace(/\bWITH\s+GRANT\s+OPTION\b[\s\S]*$|\bGRANTED\s+BY\b[\s\S]*$/i, '')
      .split(',').map((r) => r.trim()).filter(Boolean).map(ident);
    if (!roles.some((r) => API_ROLES.has(r))) continue;
    const target = g[2].trim();
    if (/^ALL\s+TABLES\s+IN\s+SCHEMA\b/i.test(target)) {
      if (target.replace(/^ALL\s+TABLES\s+IN\s+SCHEMA\s+/i, '').split(',').map((s) => ident(s.trim())).includes('public')) allTables = true;
      continue;
    }
    if (/^(?:FUNCTION|PROCEDURE|ROUTINE|SEQUENCE|SCHEMA|DATABASE|DOMAIN|TYPE|LANGUAGE|LARGE\s+OBJECT|FOREIGN|TABLESPACE|PARAMETER|ALL\s+(?:FUNCTIONS|PROCEDURES|ROUTINES|SEQUENCES))\b/i.test(target)) continue;
    for (const n of target.replace(/^TABLE\s+/i, '').split(',')) {
      const t = n.trim();
      if (!new RegExp(`^${QNAME}$`).test(t)) continue;
      const [schema, table] = qname(t);
      if (schema === null || schema === 'public') granted.add(table);
    }
  }
  if (allTables) return found;
  for (const t of tables) {
    if (granted.has(t) || optOut.has(t)) continue;
    found.push(`public.${t} is created with no GRANT ... ON ${t} TO anon / authenticated / service_role in the file`
      + (dynGrant ? ' (a GRANT inside a string does not count: the lint cannot read it)' : '')
      + ': from 2026-10-30 the Data API cannot reach it');
  }
  return found;
}

const isMigration = (n) => /^supabase\/migrations\/[^/]+\.sql$/.test(n);

export function run({ base, head = 'HEAD', repo = process.cwd() }) {
  const ls = (ref) => execFileSync('git', ['ls-tree', '-r', '--name-only', ref, 'supabase/migrations/'], { cwd: repo, encoding: 'utf8' })
    .split('\n').filter(isMigration);
  const baseNames = new Set(ls(base));
  const added = ls(head).filter((n) => !baseNames.has(n)).sort();
  const errors = [];
  if (baseNames.size === 0) errors.push('base tree has no migration files: wrong --base ref? (a pass over zero files is not a pass)');
  for (const n of added) {
    const sql = execFileSync('git', ['show', `${head}:${n}`], { cwd: repo, encoding: 'utf8' });
    for (const f of findMissingGrants(sql)) errors.push(`${path.basename(n)}: ${f}`);
  }
  return { added, errors };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  let base = arg('--base');
  if (process.argv.includes('--pr-merge')) {
    try { execFileSync('git', ['rev-parse', '--verify', '-q', 'HEAD^2'], { stdio: 'pipe' }); }
    catch { console.error('migration-public-grant-lint: --pr-merge needs HEAD to be the PR merge commit (no HEAD^2)'); process.exit(2); }
    base = 'HEAD^1';
  }
  if (!base) { console.error('migration-public-grant-lint: --base <ref> or --pr-merge is required'); process.exit(2); }
  const r = run({ base, head: arg('--head') ?? 'HEAD' });
  if (r.errors.length) {
    console.error('migration-public-grant-lint: FAIL');
    for (const e of r.errors) console.error('  - ' + e);
    console.error('  Fix: GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated; GRANT ALL ON public.<table> TO service_role;  '
      + '(only what the app needs), or, if the table must stay off the API, add a line `-- no-api-grant: <table> <reason>` to the file.');
    process.exit(1);
  }
  console.log(`migration-public-grant-lint: OK (${r.added.length} new migration file${r.added.length === 1 ? '' : 's'} checked${r.added.length ? ': ' + r.added.map((n) => path.basename(n)).join(', ') : ''})`);
}
