// financing-application-create — STUB Edge Function.
// Dark behind FINANCING_ENABLED. Real impl lands after hephaestus ships
// the financing-core schema migration on 2026-05-17 morning.
//
// Per banked feedback_supabase_edge_function_deploy_multipart_not_json
// this Fn deploys via Mgmt API multipart endpoint when wired.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (_req) => {
  const enabled = Deno.env.get('FINANCING_ENABLED') === 'true'
  if (!enabled) {
    return new Response(
      JSON.stringify({ error: 'financing disabled', flag: 'FINANCING_ENABLED' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )
  }

  // TODO(phase-2-impl): on hephaestus schema land:
  //   1. parse {customerProfile, projectScope, bcApplicationId} from body
  //   2. resolve adapter from FINANCING_BANK env
  //   3. adapter.createApplication(...)
  //   4. INSERT INTO customer_financing_applications (status='applied', ...)
  //   5. return {bcApplicationId, applicationUrl}

  return new Response(
    JSON.stringify({ error: 'not implemented', stage: 'phase-2-stub' }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  )
})
