// useChargeConfirm — webhook-INDEPENDENT charge-confirm hook for the
// homeowner Concierge "Request a Rep" Step-3 Pay flow.
//
// Calls hephaestus PR-7 #505 fn `rep-request-payment-confirm` which
// synchronously retrieves the PI from Stripe + flips rep_request status,
// returning a 6-case discriminated response:
//
//   200 { ok:true, status:'new', payment_intent_status:'succeeded',
//         stripe_charge_id, amount_cents }              -> paid
//   409 { error:'requires_action', payment_intent_status:'requires_action',
//         client_secret, hint? }                         -> 3DS, then re-call
//   200 { ok:true, status:'pending_payment',
//         payment_intent_status:'processing',
//         status_pending:true }                          -> processing
//   409 { error:'requires_payment_method', ... }         -> re-collect PM
//   409 { error:'payment_intent_unacceptable_status',
//         payment_intent_status }                        -> terminal error
//   200 { ok:true, replay:true, status:<current>,
//         payment_intent_status:'succeeded',
//         stripe_charge_id }                             -> success (webhook beat us)
//
// Discriminator: HTTP code + payment_intent_status + (on 409) error field.
//
// 3DS loop: on requires_action, the caller hands off to
// stripe.handleNextAction(client_secret); on resolve the FE re-calls
// confirmCharge(rep_request_id) (same fn, second pass — PR-7's single
// authoritative flip path). Recursion depth capped at 3 passes per
// kratos discipline (msg 1782453014320) to avoid pathological loops if
// the PI cycles requires_action indefinitely.
//
// Composes feedback_ship_vs_coordinate_discrimination (this is the FE
// half of the webhook-independent path that makes the broken
// llybxug-webhook-via-Supabase-CF intercept inert at the FE layer per
// CAPTURE-A2). Same DB row, sync confirmed; the webhook (if it ever
// runs) is idempotent belt-and-suspenders only.

import { useCallback, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const env = ((import.meta as { env?: Record<string, string | undefined> }).env) ?? {}
const SUPABASE_URL = env.VITE_SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

const MAX_3DS_PASSES = 3

export type ChargeConfirmState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'paid'; stripeChargeId: string; amountCents: number; status: string; replay: boolean }
  | { kind: 'requires_action'; clientSecret: string; hint?: string }
  | { kind: 'processing'; status: string }
  | { kind: 'requires_payment_method'; reason: string }
  | { kind: 'unacceptable'; status: string; reason?: string }
  | { kind: 'error'; reason: string }

interface ConfirmResponseBody {
  ok?: boolean
  status?: string
  payment_intent_status?: string
  stripe_charge_id?: string
  amount_cents?: number
  status_pending?: boolean
  replay?: boolean
  error?: string
  client_secret?: string
  hint?: string
}

async function postConfirm(repRequestId: string): Promise<{ status: number; body: ConfirmResponseBody | null }> {
  const session = (await supabase.auth.getSession()).data.session
  const accessToken = session?.access_token ?? ''
  const res = await fetch(`${SUPABASE_URL}/functions/v1/rep-request-payment-confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ rep_request_id: repRequestId }),
  })
  let body: ConfirmResponseBody | null = null
  try {
    body = (await res.json()) as ConfirmResponseBody
  } catch {
    body = null
  }
  return { status: res.status, body }
}

function discriminate(status: number, body: ConfirmResponseBody | null): ChargeConfirmState {
  if (!body) {
    return { kind: 'error', reason: `Empty response from server (HTTP ${status}).` }
  }
  if (status === 200 && body.ok === true) {
    if (body.payment_intent_status === 'succeeded' && body.stripe_charge_id) {
      return {
        kind: 'paid',
        stripeChargeId: body.stripe_charge_id,
        amountCents: body.amount_cents ?? 0,
        status: body.status ?? 'new',
        replay: body.replay === true,
      }
    }
    if (body.payment_intent_status === 'processing') {
      return { kind: 'processing', status: body.status ?? 'pending_payment' }
    }
    return { kind: 'error', reason: `Unrecognized success payload: status=${body.status} pi=${body.payment_intent_status}` }
  }
  if (status === 409) {
    if (body.error === 'requires_action' && body.client_secret) {
      return { kind: 'requires_action', clientSecret: body.client_secret, hint: body.hint }
    }
    if (body.error === 'requires_payment_method') {
      return { kind: 'requires_payment_method', reason: body.hint ?? 'Card was declined — try a different payment method.' }
    }
    if (body.error === 'payment_intent_unacceptable_status') {
      return {
        kind: 'unacceptable',
        status: body.payment_intent_status ?? 'unknown',
        reason: body.hint,
      }
    }
    return { kind: 'error', reason: body.error ?? `Server rejected payment (HTTP 409).` }
  }
  return { kind: 'error', reason: body.error ?? `Server error (HTTP ${status}).` }
}

export interface UseChargeConfirmResult {
  state: ChargeConfirmState
  confirmCharge: (repRequestId: string) => Promise<ChargeConfirmState>
  handleThreeDSecure: (repRequestId: string, clientSecret: string) => Promise<ChargeConfirmState>
  reset: () => void
}

export function useChargeConfirm(): UseChargeConfirmResult {
  const [state, setState] = useState<ChargeConfirmState>({ kind: 'idle' })
  const passCountRef = useRef(0)

  const confirmCharge = useCallback(async (repRequestId: string): Promise<ChargeConfirmState> => {
    passCountRef.current += 1
    if (passCountRef.current > MAX_3DS_PASSES) {
      const errState: ChargeConfirmState = {
        kind: 'error',
        reason: '3DS authentication did not complete after multiple attempts. Please try again.',
      }
      setState(errState)
      return errState
    }
    setState({ kind: 'confirming' })
    try {
      const { status, body } = await postConfirm(repRequestId)
      const next = discriminate(status, body)
      setState(next)
      return next
    } catch (e) {
      const errState: ChargeConfirmState = {
        kind: 'error',
        reason: e instanceof Error ? e.message : 'Network error contacting payment server.',
      }
      setState(errState)
      return errState
    }
  }, [])

  // handleThreeDSecure: caller supplies the Stripe object via dynamic
  // import to keep this hook independent of the Stripe.js bundle when
  // not on the checkout surface. Returns the post-3DS confirm state.
  const handleThreeDSecure = useCallback(
    async (repRequestId: string, clientSecret: string): Promise<ChargeConfirmState> => {
      setState({ kind: 'confirming' })
      try {
        const { getStripe } = await import('@/lib/stripe-client')
        const stripe = await getStripe()
        if (!stripe) {
          const errState: ChargeConfirmState = {
            kind: 'error',
            reason: 'Could not load Stripe.js to complete authentication.',
          }
          setState(errState)
          return errState
        }
        const { error } = await stripe.handleNextAction({ clientSecret })
        if (error) {
          const errState: ChargeConfirmState = {
            kind: 'error',
            reason: error.message ?? 'Authentication was cancelled.',
          }
          setState(errState)
          return errState
        }
        return await confirmCharge(repRequestId)
      } catch (e) {
        const errState: ChargeConfirmState = {
          kind: 'error',
          reason: e instanceof Error ? e.message : 'Authentication failed.',
        }
        setState(errState)
        return errState
      }
    },
    [confirmCharge],
  )

  const reset = useCallback(() => {
    passCountRef.current = 0
    setState({ kind: 'idle' })
  }, [])

  return { state, confirmCharge, handleThreeDSecure, reset }
}
