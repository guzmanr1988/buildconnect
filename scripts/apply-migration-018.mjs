#!/usr/bin/env node
/*
 * apply-migration-018.mjs — apply migration 018 (sent_projects) to Supabase.
 *
 * Requires a Supabase Personal Access Token (PAT) — the service role key is
 * NOT sufficient for DDL via the Management API.
 *
 * Get a PAT at: https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx npx tsx scripts/apply-migration-018.mjs
 *
 * After this runs clean, follow up with:
 *   npx tsx scripts/seed-sent-projects.mjs
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PAT = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = 'llybxugitrbgybplgpsi'

if (!PAT) {
  console.error(
    'FATAL: SUPABASE_ACCESS_TOKEN not set.\n' +
    'Get a PAT at: https://supabase.com/dashboard/account/tokens\n' +
    'Then run: SUPABASE_ACCESS_TOKEN=sbp_xxx npx tsx scripts/apply-migration-018.mjs'
  )
  process.exit(1)
}

const sql = readFileSync(
  join(__dirname, '../supabase/migrations/018_create_sent_projects.sql'),
  'utf8'
)

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function run() {
  log(`Applying migration 018 to project ${PROJECT_REF}`)

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  const body = await res.json().catch(() => res.text())

  if (!res.ok) {
    console.error('Migration FAILED:', res.status, JSON.stringify(body, null, 2))
    process.exit(1)
  }

  log('Migration 018 applied OK')
  log('Next step: npx tsx scripts/seed-sent-projects.mjs')
}

run()
