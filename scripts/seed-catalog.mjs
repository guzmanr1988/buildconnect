#!/usr/bin/env node
/*
 * seed-catalog.mjs — one-shot sync of bundled SERVICE_CATALOG (src/lib/constants.ts)
 * into the Phase 1 Supabase catalog tables. Uses service_role so it bypasses RLS.
 *
 * Usage (from /Users/rodolfoguzman/buildconnect):
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-catalog.mjs
 *
 * Or with the env file (via direnv / dotenv -e):
 *   dotenv -e /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env node scripts/seed-catalog.mjs
 *
 * What it does:
 *   - Connects to Supabase using service_role
 *   - Truncates the 5 catalog tables (in cascade order) — idempotent re-run
 *   - Walks SERVICE_CATALOG and inserts services → option_groups → options →
 *     sub_groups → sub_options, capturing returned UUIDs for FK resolution
 *
 * Safety:
 *   - Will NOT touch vendor_option_prices (that's vendor-managed data)
 *   - Idempotent: truncate-then-insert, so re-running just resets to bundled baseline
 *   - Service_role key MUST be kept out of the FE bundle — this script runs server-side only
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('FATAL: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set in env.');
  process.exit(1);
}

const supabase = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Dynamic import of SERVICE_CATALOG via tsx (TS source import). If tsx isn't
// available, fall back to a pre-built JS path.
async function loadCatalog() {
  try {
    const mod = await import('../src/lib/constants.ts');
    return mod.SERVICE_CATALOG;
  } catch (e) {
    console.error('Could not import src/lib/constants.ts directly — run with `tsx` or pre-build.');
    console.error('Example: npx tsx scripts/seed-catalog.mjs');
    throw e;
  }
}

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

async function truncateAll() {
  // Order matters: leaves first, then roots. ON DELETE CASCADE makes service
  // truncation sufficient, but being explicit is clearer and survives schema changes.
  const tables = ['sub_options', 'sub_groups', 'options', 'option_groups', 'services'];
  for (const t of tables) {
    const { error } = await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error && !error.message.includes('null value')) {
      // services has a text PK, not uuid, so the neq filter is awkward — use a different filter for services.
      if (t === 'services') {
        const { error: e2 } = await supabase.from(t).delete().neq('id', '__never__');
        if (e2) throw new Error(`truncate ${t}: ${e2.message}`);
      } else {
        throw new Error(`truncate ${t}: ${error.message}`);
      }
    }
  }
  log('truncated all catalog tables');
}

async function insertOne(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw new Error(`insert ${table}: ${error.message} — row=${JSON.stringify(row).slice(0, 200)}`);
  return data;
}

async function seedService(service, serviceIdx) {
  await insertOne('services', {
    id: service.id,
    name: service.name,
    tagline: service.tagline ?? '',
    description: service.description ?? '',
    badge: service.badge ?? null,
    badge_color: service.badgeColor ?? null,
    phase2: service.phase2 ?? false,
    features: service.features ?? [],
    stat_label: service.stat?.label ?? '',
    stat_value: service.stat?.value ?? '',
    sort_order: serviceIdx,
  });
  log(`  service: ${service.id}`);

  for (let gi = 0; gi < (service.optionGroups ?? []).length; gi++) {
    const g = service.optionGroups[gi];
    const groupRow = await insertOne('option_groups', {
      service_id: service.id,
      group_id: g.id,
      label: g.label,
      required: g.required ?? false,
      type: g.type ?? 'single',
      reveals_on_group_id: g.revealsOn?.group ?? null,
      reveals_on_equals: g.revealsOn?.equals ?? null,
      sort_order: gi,
    });

    for (let oi = 0; oi < (g.options ?? []).length; oi++) {
      const o = g.options[oi];
      const optRow = await insertOne('options', {
        option_group_id: groupRow.id,
        option_id: o.id,
        label: o.label,
        description: o.description ?? null,
        sort_order: oi,
      });

      for (let sgi = 0; sgi < (o.subGroups ?? []).length; sgi++) {
        const sg = o.subGroups[sgi];
        const sgRow = await insertOne('sub_groups', {
          option_id: optRow.id,
          sub_group_id: sg.id,
          label: sg.label,
          required: sg.required ?? false,
          type: sg.type ?? 'single',
          sort_order: sgi,
        });

        for (let soi = 0; soi < (sg.options ?? []).length; soi++) {
          const so = sg.options[soi];
          await insertOne('sub_options', {
            sub_group_id: sgRow.id,
            sub_option_id: so.id,
            label: so.label,
            description: so.description ?? null,
            sort_order: soi,
          });
        }
      }
    }
  }
}

async function countRows(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count;
}

async function main() {
  log('loading SERVICE_CATALOG');
  const catalog = await loadCatalog();
  log(`catalog has ${catalog.length} services`);

  log('truncating existing rows');
  await truncateAll();

  log('seeding');
  for (let i = 0; i < catalog.length; i++) {
    await seedService(catalog[i], i);
  }

  log('verifying row counts');
  const counts = {};
  for (const t of ['services', 'option_groups', 'options', 'sub_groups', 'sub_options']) {
    counts[t] = await countRows(t);
  }
  log('final counts:', JSON.stringify(counts));

  log('DONE');
}

main().catch((e) => {
  console.error('SEED FAILED:', e.message);
  process.exit(1);
});
