// Concierge Rep Request — homeowner intake submit hook.
// Owns the SubmitFormState state machine + edge-fn POST +
// retry-on-payment-error path. Component (intake-page Step 3) owns
// the Stripe Elements UI + the confirmPayment() callback that drives
// formState transitions via the exposed { submit, retry } actions.
//
// Lifecycle:
//   idle
//     -> submit(formData)
//        -> submitting (POST create-rep-request edge fn)
//          -> succeeded(repRequestId) [client_secret persisted to local
//             state but Stripe confirmation is component-owned; tracker
//             render is gated on this terminal kind via
//             shouldRenderTracker()]
//          -> paymentError(reason, intentClientSecret) [recoverable;
//             retry() re-enters submitting with the SAME client_secret
//             so the PaymentIntent isn't double-created server-side]
//        -> NETWORK ERROR before PaymentIntent (no client_secret yet)
//          -> paymentError(reason, intentClientSecret='') and retry()
//             re-POSTs the create endpoint fresh
//
// charge_failed status is NOT a kind here — it's a tracker-level
// status the homeowner sees AFTER the Stripe webhook fires. This
// hook is purely the pre-success path. Once kind='succeeded', the
// status page (rep-request-status.tsx) reads from
// useRepRequestDetail() which polls the row.
//
// COMMIT 2 SCAFFOLD: signature locked, implementation deferred to
// commit 2.5 (after phaethon's commit 3 DOM scaffold lands so we can
// verify the consumer shape). Returns idle + no-op submit/retry so
// the type-check passes and components can import + wire UI without
// blocking on the edge-fn integration.

import { useState, useCallback } from 'react'
import type { IntakeFormData, SubmitFormState } from '@/features/admin/rep-requests/rep-request-contract'

export interface UseRepRequestSubmitResult {
  formState: SubmitFormState
  submit: (formData: IntakeFormData) => Promise<void>
  retry: () => Promise<void>
  /** Convenience accessor — non-null only when formState carries a client_secret (submitting w/ secret or paymentError). */
  clientSecret: string | null
}

export function useRepRequestSubmit(): UseRepRequestSubmitResult {
  const [formState, setFormState] = useState<SubmitFormState>({ kind: 'idle' })

  // Implementation pending commit 2.5 — see header comment. submit()
  // will:
  //   1. Upload formData.photos to Storage (rep-request-photos bucket,
  //      keyed by tmp uuid pre-row-id since the row doesn't exist
  //      yet — server-side patches the path post-INSERT).
  //   2. POST /functions/v1/create-rep-request with the form payload
  //      + photo storage paths.
  //   3. Edge fn INSERTs the pending_payment row, creates the Stripe
  //      PaymentIntent server-side, returns { rep_request_id,
  //      client_secret }.
  //   4. Transition to succeeded(rep_request_id) + persist client_secret
  //      for the component's <Elements> mount.
  const submit = useCallback(async (_formData: IntakeFormData) => {
    setFormState({ kind: 'submitting' })
    // TODO(commit 2.5): real edge-fn POST + photo upload sequence.
  }, [])

  const retry = useCallback(async () => {
    if (formState.kind !== 'paymentError') return
    setFormState({ kind: 'submitting', intentClientSecret: formState.intentClientSecret })
    // TODO(commit 2.5): re-call confirmPayment via the component
    // path; this hook only flips kind, the actual Stripe retry is
    // component-side because PaymentElement state is DOM-anchored.
  }, [formState])

  const clientSecret =
    formState.kind === 'submitting' && formState.intentClientSecret
      ? formState.intentClientSecret
      : formState.kind === 'paymentError'
        ? formState.intentClientSecret
        : null

  return { formState, submit, retry, clientSecret }
}
