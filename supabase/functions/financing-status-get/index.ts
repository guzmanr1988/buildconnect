// financing-status-get — STUB Edge Function. See financing-application-create
// for the dark-flag pattern.

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
  //   1. parse {bcApplicationId} from query or body
  //   2. SELECT FROM customer_financing_applications WHERE id=...
  //   3. resolve adapter from FINANCING_BANK env, call getApprovalStatus()
  //   4. UPDATE row if status changed; return current row

  return new Response(
    JSON.stringify({ error: 'not implemented', stage: 'phase-2-stub' }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  )
})
