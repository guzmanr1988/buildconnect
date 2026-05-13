import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STATUS_BY_ACTION = {
  accept: 'approved',
  reject: 'declined',
} as const

type Action = keyof typeof STATUS_BY_ACTION

const HERMES_NOTIFY_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-lead-event`

// Browser path: vendor UI lives at https://buildc.net while this Edge Fn
// lives at https://<project>.supabase.co — cross-origin. supabase-js
// .functions.invoke() sends an `apikey` header in addition to
// authorization+content-type, which makes the request non-simple and
// triggers a CORS preflight (OPTIONS). Without this allow-list the
// browser blocks the POST before it ever reaches our handler.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const { lead_id, action } = (await req.json()) as { lead_id?: string; action?: Action }

    if (!lead_id || !action || !(action in STATUS_BY_ACTION)) {
      return json({ error: 'invalid payload: lead_id (uuid) + action (accept|reject) required' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)

    // Vendor JWT client — RLS enforces vendor can only update own sent_projects rows.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: lead, error: readErr } = await userClient
      .from('sent_projects')
      .select('id, status, vendor_id')
      .eq('id', lead_id)
      .single()

    if (readErr || !lead) return json({ error: 'lead not found or not accessible' }, 404)

    if (lead.status !== 'pending') {
      return json(
        { error: `cannot transition from ${lead.status}; only pending → ${STATUS_BY_ACTION[action]} allowed` },
        409,
      )
    }

    const newStatus = STATUS_BY_ACTION[action]

    const { error: updErr } = await userClient
      .from('sent_projects')
      .update({ status: newStatus })
      .eq('id', lead_id)

    if (updErr) return json({ error: updErr.message }, 500)

    if (action === 'accept') {
      const notifyResp = await fetch(HERMES_NOTIFY_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead_id,
          recipient_type: 'homeowner',
          event_type: 'lead_accepted',
        }),
      })
      if (!notifyResp.ok) {
        // Audit-only: notification failure does not roll back the transition.
        const detail = await notifyResp.text().catch(() => '')
        console.error('[transition-lead-status] notify-lead-event failed', notifyResp.status, detail)
      }
    }

    // Re-route stub — flag-gated. LEAD_AUTOROUTE_ENABLED=false tonight per
    // kratos guardrail; follow-up PR wires the next-vendor-in-radius logic.
    if (action === 'reject' && Deno.env.get('LEAD_AUTOROUTE_ENABLED') === 'true') {
      console.log('[transition-lead-status] reroute-stub fired for', lead_id)
    }

    return json({ ok: true, new_status: newStatus })
  } catch (err) {
    console.error('[transition-lead-status] error', err)
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}
