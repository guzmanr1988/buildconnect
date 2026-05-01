#!/usr/bin/env node
/*
 * seed-demo-account-rep.mjs — seeds the account_rep demo user.
 *
 * Creates account_rep@buildc.net in Supabase auth + profiles,
 * scoped to Apex Roofing (v-1, fc0d8ff3-...). Idempotent.
 *
 * Usage:
 *   set -a && source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env && set +a
 *   npx tsx scripts/seed-demo-account-rep.mjs
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('FATAL: need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// v-1 Apex Roofing UUID (from src/lib/demo-vendor-ids.ts)
const APEX_UUID = 'fc0d8ff3-cc1c-4101-a4b3-068594753bbf'
const REP_EMAIL = 'account_rep@buildc.net'
const REP_PASSWORD = process.env.SUPABASE_DEMO_ACCOUNT_REP_PW || 'demoAccountRep!2026'

async function findUser(email) {
  let page = 1
  while (page <= 5) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers p${page}: ${error.message}`)
    const m = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (m) return m.id
    if (data.users.length < 200) return null
    page++
  }
  return null
}

async function run() {
  log('Seeding demo account rep:', REP_EMAIL)

  let uid = await findUser(REP_EMAIL)

  if (uid) {
    log('  user exists → updating profile only:', uid)
    const { error } = await supabase.from('profiles').update({
      name: 'Miguel Reyes',
      role: 'account_rep',
      account_rep_for_vendor_id: APEX_UUID,
      status: 'active',
    }).eq('id', uid)
    if (error) throw new Error(`profile update: ${error.message}`)
    log('  profile updated')
  } else {
    log('  creating auth user...')
    const { data, error } = await supabase.auth.admin.createUser({
      email: REP_EMAIL,
      password: REP_PASSWORD,
      email_confirm: true,
      user_metadata: { name: 'Miguel Reyes', role: 'account_rep' },
    })
    if (error) throw new Error(`createUser: ${error.message}`)
    uid = data.user.id
    log('  created:', uid)

    const { error: pErr } = await supabase.from('profiles').update({
      name: 'Miguel Reyes',
      role: 'account_rep',
      account_rep_for_vendor_id: APEX_UUID,
      status: 'active',
    }).eq('id', uid)
    if (pErr) throw new Error(`profile update: ${pErr.message}`)
    log('  profile set')
  }

  log('Done. Password in use:', REP_PASSWORD)
  log('Set VITE_DEMO_ACCOUNT_REP_PW =', REP_PASSWORD, 'on Cloudflare Pages preview env.')
}

run().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1) })
