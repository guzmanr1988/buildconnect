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
  submit: (formData: IntakeFormData) => Promise<void>
  retry: () => Promise<void>
  /** Non-null once the create-rep-request edge fn returned a PaymentIntent
   *  client_secret. Component reads this to mount <Elements>. */
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

const BUCKET_TARGET_DAYS: Record<RepRequestAvailabilityBucket, number[]> = {
  weekday_morning: [1, 2, 3, 4, 5],
  weekday_afternoon: [1, 2, 3, 4, 5],
  weekend_anytime: [0, 6],
}

// Pick the next iso_date (YYYY-MM-DD) ≥ tomorrow whose day-of-week matches
// the bucket. bucketToWindow() server-side rejects mismatched day-of-week,
// so we must hand it a date the bucket admits.
function nextIsoDateForBucket(bucket: RepRequestAvailabilityBucket, from: Date): string {
  const target = BUCKET_TARGET_DAYS[bucket]
  const probe = new Date(from)
  probe.setHours(0, 0, 0, 0)
  probe.setDate(probe.getDate() + 1)
  for (let i = 0; i < 14; i++) {
    if (target.includes(probe.getDay())) {
      const y = probe.getFullYear()
      const m = String(probe.getMonth() + 1).padStart(2, '0')
      const d = String(probe.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    probe.setDate(probe.getDate() + 1)
  }
  throw new Error(`No date found within 14 days for bucket ${bucket}`)
}

interface CreateRepRequestResponse {
  rep_request_id: string
  client_secret: string
  amount_cents: number
}

export function useRepRequestSubmit(): UseRepRequestSubmitResult {
  const [formState, setFormState] = useState<SubmitFormState>({ kind: 'idle' })
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [lastFormData, setLastFormData] = useState<IntakeFormData | null>(null)
  const userId = useAuthStore((s) => s.session?.user.id ?? null)

  const doSubmit = useCallback(
    async (formData: IntakeFormData) => {
      setLastFormData(formData)
      setFormState({ kind: 'submitting' })

      const parsed = parseFlatAddress(formData.address)
      if (!parsed) {
        setFormState({
          kind: 'paymentError',
          reason: 'Address could not be parsed — include street, city, state, and zip.',
          canRetry: true,
          intentClientSecret: '',
        })
        return
      }

      const now = new Date()
      let picks: Array<{ bucket: RepRequestAvailabilityBucket; iso_date: string }>
      try {
        picks = formData.availabilityBuckets.map((bucket) => ({
          bucket,
          iso_date: nextIsoDateForBucket(bucket, now),
        }))
      } catch (e) {
        setFormState({
          kind: 'paymentError',
          reason: e instanceof Error ? e.message : 'Could not compute visit dates.',
          canRetry: true,
          intentClientSecret: '',
        })
        return
      }

      const body = {
        address: parsed,
        contact_phone: formData.contactPhone,
        visit_window_picks: picks,
        description: formData.description || undefined,
        access_notes: formData.accessNotes || undefined,
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

      const { rep_request_id, client_secret } = data
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

      setFormState({ kind: 'succeeded', repRequestId: rep_request_id })
    },
    [userId]
  )

  const submit = useCallback(
    async (formData: IntakeFormData) => {
      await doSubmit(formData)
    },
    [doSubmit]
  )

  const retry = useCallback(async () => {
    if (formState.kind !== 'paymentError') return
    // Empty client_secret → INSERT/PI.create failed pre-confirmation; re-POST
    // the create endpoint with the cached form payload.
    if (!formState.intentClientSecret) {
      if (!lastFormData) return
      await doSubmit(lastFormData)
      return
    }
    // Non-empty client_secret → PI exists; flip back to submitting so the
    // component-side stripe.confirmPayment() can re-fire against the same PI.
    setFormState({ kind: 'submitting', intentClientSecret: formState.intentClientSecret })
  }, [formState, lastFormData, doSubmit])

  return { formState, submit, retry, clientSecret }
}
