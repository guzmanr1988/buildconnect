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
//          -> succeeded(repRequestId) + clientSecret accessor populated
//             so Step 3 can mount <Elements stripe={stripePromise}
//             options={{clientSecret}}> and drive confirmPayment
//          -> paymentError(reason, intentClientSecret) — recoverable;
//             retry() preserves the SAME client_secret per athena §4.3.1
//             idempotency, so the PaymentIntent isn't double-created
//             server-side. retry with intentClientSecret='' re-POSTs
//             the create endpoint fresh.
//
// SubmitFormState.succeeded intentionally does NOT carry the secret on
// its discriminant — the secret lives on the parallel clientSecret slot
// so the contract stays "kind=succeeded means the row is durable" rather
// than overloading the discriminant.

import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type {
  IntakeFormData,
  RepRequestAvailabilityBucket,
  SubmitFormState,
} from '@/features/admin/rep-requests/rep-request-contract'

export interface UseRepRequestSubmitResult {
  formState: SubmitFormState
  /** paymentMethodId is the homeowner's saved PM (purpose='service_pay_in')
   *  the server attempts an off_session PaymentIntent confirm against. */
  submit: (formData: IntakeFormData, paymentMethodId: string) => Promise<void>
  retry: () => Promise<void>
  /** Non-null once the create-rep-request edge fn returned a PaymentIntent
   *  client_secret. Surfaces for the post-create 3DS path
   *  (stripe.handleNextAction). The webhook-INDEPENDENT confirm path lives
   *  in use-charge-confirm — clientSecret is no longer used to mount an
   *  Elements PaymentElement (Rod (a) — no PaymentElement on intake). */
  clientSecret: string | null
}

interface ParsedAddress {
  line1: string
  city: string
  state: string
  zip: string
}

// Intake form captures a flat single-line address; the edge fn requires a
// structured object. Best-effort parse: trailing token = zip, second-to-last
// = state, leading segment = line1+city. Component-side intake redesign
// (commit 4+) will replace the flat input with a structured form.
//
// Two split strategies for beforeState (line1 + city portion):
//   - Comma path: "10990 SW 2256 Ter, Miami" → line1="10990 SW 2256 Ter", city="Miami"
//   - No-comma path: "10990 sw 2256 ter Miami" → line1="10990 sw 2256 ter", city="Miami"
// Real-world intake (kratos msg 1782431014742 — Rod hit a launch-blocker)
// produces unpunctuated addresses; reject only when there isn't enough text
// to identify both a line1 and a city.
function parseFlatAddress(input: string): ParsedAddress | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const zipMatch = trimmed.match(/(\d{5})(?:-\d{4})?$/)
  if (!zipMatch) return null
  const zip = zipMatch[1]
  const beforeZip = trimmed.slice(0, zipMatch.index).trim().replace(/[,\s]+$/, '')
  const stateMatch = beforeZip.match(/\b([A-Z]{2})$/i)
  if (!stateMatch) return null
  const state = stateMatch[1].toUpperCase()
  const beforeState = beforeZip.slice(0, stateMatch.index).trim().replace(/[,\s]+$/, '')

  let line1: string
  let city: string
  if (beforeState.includes(',')) {
    const parts = beforeState.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length < 2) return null
    city = parts[parts.length - 1]
    line1 = parts.slice(0, -1).join(', ')
  } else {
    const tokens = beforeState.split(/\s+/).filter(Boolean)
    if (tokens.length < 2) return null
    city = tokens[tokens.length - 1]
    line1 = tokens.slice(0, -1).join(' ')
  }

  if (!line1 || !city) return null
  return { line1, city, state, zip }
}

// Phase 2 — datetime → bucket synthesis. UI captures an explicit
// requested_visit_at; we still ship visit_window_picks back-compat for
// legacy reader paths per hephaestus contract msg 1782434304254 (server
// prefers requested_visit_at when both present). Bucket axis: Sat/Sun ⇒
// weekend_anytime; Mon-Fri before noon ⇒ weekday_morning; Mon-Fri 12:00+
// ⇒ weekday_afternoon. iso_date matches the picked day-of-week so
// bucketToWindow() server-side day-of-week guard accepts it.
function synthesizeBucketFromDatetime(iso: string): {
  bucket: RepRequestAvailabilityBucket
  iso_date: string
} {
  const d = new Date(iso)
  const dow = d.getDay()
  const hour = d.getHours()
  const bucket: RepRequestAvailabilityBucket =
    dow === 0 || dow === 6
      ? 'weekend_anytime'
      : hour < 12
        ? 'weekday_morning'
        : 'weekday_afternoon'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return { bucket, iso_date: `${y}-${m}-${day}` }
}

// PR-5 #503 (29421cd) — create-rep-request additive contract:
//   request body: + payment_method_id (string) — caller picks a saved PM
//     from the homeowner's payment_methods list (purpose='service_pay_in')
//     and the server attempts an off_session PaymentIntent confirmation
//     against it inside the same INSERT round-trip.
//   response: + payment_intent_status (string) — Stripe PI status after the
//     server's off_session confirm attempt (succeeded | requires_action |
//     processing | requires_payment_method | ...)
//             + requires_action (boolean, optional) — convenience flag
//     mirroring payment_intent_status === 'requires_action'; the FE keys
//     the post-create branch on this:
//       requires_action=true → caller drives stripe.handleNextAction(
//         { clientSecret }) → re-calls confirmCharge(rep_request_id) via
//         use-charge-confirm (PR-7 #505)
//       requires_action=false → caller calls confirmCharge(rep_request_id)
//         directly (server's off_session attempt already cleared OR is
//         processing); PR-7 fn flips the row + reports the terminal state
interface CreateRepRequestResponse {
  rep_request_id: string
  client_secret: string
  amount_cents: number
  payment_intent_status: string
  requires_action?: boolean
}

export function useRepRequestSubmit(): UseRepRequestSubmitResult {
  const [formState, setFormState] = useState<SubmitFormState>({ kind: 'idle' })
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [lastFormData, setLastFormData] = useState<IntakeFormData | null>(null)
  const [lastPaymentMethodId, setLastPaymentMethodId] = useState<string | null>(null)
  const userId = useAuthStore((s) => s.session?.user.id ?? null)

  const doSubmit = useCallback(
    async (formData: IntakeFormData, paymentMethodId: string) => {
      setLastFormData(formData)
      setLastPaymentMethodId(paymentMethodId)
      setFormState({ kind: 'submitting' })

      // Prefer structured address from Google Places Autocomplete (pin-58 wire).
      // Falls back to parseFlatAddress when the homeowner typed past the
      // autocomplete or the Maps SDK failed to load — graceful degradation,
      // keeping the post-pin-57 comma-less parser as the safety net.
      const parsed = formData.structuredAddress ?? parseFlatAddress(formData.address)
      if (!parsed) {
        setFormState({
          kind: 'paymentError',
          reason: 'Address could not be parsed — include street, city, state, and zip.',
          canRetry: true,
          intentClientSecret: '',
        })
        return
      }

      // Phase 2 — requested_visit_at is the canonical homeowner pick.
      // visit_window_picks stays on the wire as a single-bucket
      // synthesis for legacy rep-side reader back-compat (hephaestus
      // server prefers requested_visit_at when both present per contract
      // msg 1782434304254). Step 2 client-side gate already guarantees a
      // future ISO string; this is a defensive bail.
      if (!formData.requestedVisitAt) {
        setFormState({
          kind: 'paymentError',
          reason: 'Pick a visit date and time before continuing.',
          canRetry: true,
          intentClientSecret: '',
        })
        return
      }
      const picks: Array<{ bucket: RepRequestAvailabilityBucket; iso_date: string }> = [
        synthesizeBucketFromDatetime(formData.requestedVisitAt),
      ]

      const body = {
        address: parsed,
        contact_phone: formData.contactPhone,
        requested_visit_at: formData.requestedVisitAt,
        visit_window_picks: picks,
        description: formData.description || undefined,
        access_notes: formData.accessNotes || undefined,
        // PR-5 #503 additive — server attempts off_session PI confirm against
        // this PM during create. Response carries payment_intent_status +
        // requires_action so the FE can branch into 3DS or skip-straight-to-
        // PR-7-confirm without an Elements re-collect.
        payment_method_id: paymentMethodId,
      }

      const { data, error } = await supabase.functions.invoke<CreateRepRequestResponse>(
        'create-rep-request',
        { body }
      )

      if (error || !data) {
        setFormState({
          kind: 'paymentError',
          reason: error?.message ?? 'Failed to create rep request.',
          canRetry: true,
          intentClientSecret: '',
        })
        return
      }

      const { rep_request_id, client_secret, payment_intent_status, requires_action } = data
      setClientSecret(client_secret)

      // Photo upload is best-effort post-INSERT. A failed upload does NOT
      // roll back the request — the row + PaymentIntent are durable, the
      // homeowner can re-upload from the status page. Photos table RLS
      // admits the homeowner insert while status='pending_payment'.
      if (formData.photos.length > 0 && userId) {
        await Promise.all(
          formData.photos.map(async (file) => {
            const safeName = file.name.replace(/[^\w.\-]/g, '_')
            const storagePath = `${rep_request_id}/${userId}/${Date.now()}-${safeName}`
            const upload = await supabase.storage
              .from('rep-request-photos')
              .upload(storagePath, file, { upsert: false, contentType: file.type })
            if (upload.error) return
            await supabase.from('rep_request_photos').insert({
              rep_request_id,
              storage_path: storagePath,
              uploaded_by: userId,
            })
          })
        )
      }

      setFormState({
        kind: 'succeeded',
        repRequestId: rep_request_id,
        paymentIntentStatus: payment_intent_status,
        requiresAction: requires_action === true,
      })
    },
    [userId]
  )

  const submit = useCallback(
    async (formData: IntakeFormData, paymentMethodId: string) => {
      await doSubmit(formData, paymentMethodId)
    },
    [doSubmit]
  )

  const retry = useCallback(async () => {
    if (formState.kind !== 'paymentError') return
    // Empty client_secret → INSERT/PI.create failed pre-confirmation; re-POST
    // the create endpoint with the cached form payload + PM.
    if (!formState.intentClientSecret) {
      if (!lastFormData || !lastPaymentMethodId) return
      await doSubmit(lastFormData, lastPaymentMethodId)
      return
    }
    // Non-empty client_secret → PI exists; flip back to submitting so the
    // component-side post-create flow (3DS or sync confirm) can re-fire
    // against the same PI.
    setFormState({ kind: 'submitting', intentClientSecret: formState.intentClientSecret })
  }, [formState, lastFormData, lastPaymentMethodId, doSubmit])

  return { formState, submit, retry, clientSecret }
}
