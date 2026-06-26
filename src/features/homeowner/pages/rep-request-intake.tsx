import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Camera, CreditCard, Landmark, Loader2, Pencil, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRepRequestSubmit } from '@/hooks/use-rep-request-submit'
import { usePlacesAutocomplete } from '@/hooks/use-places-autocomplete'
import {
  useChargeConfirm,
  type ChargeConfirmState,
} from '@/features/homeowner/hooks/use-charge-confirm'
import type { PaymentMethodListItem } from '@/features/homeowner/components/payment-methods-section'
import type { SecondaryAddress } from '@/types'
import type {
  IntakeFormData,
  SubmitFormState,
} from '@/features/admin/rep-requests/rep-request-contract'

const PAY_IN_PURPOSE = 'service_pay_in' as const
const PAYMENT_METHODS_QUERY_KEY = ['payment_methods', PAY_IN_PURPOSE] as const

interface ListResponseShape {
  ok: boolean
  payment_methods: PaymentMethodListItem[]
  error?: string
}

// Same Google Maps key the roof flow uses (VITE_-baked at build time). When
// missing, the autocomplete hook short-circuits to no-op and the input degrades
// to plain text → parseFlatAddress fallback in use-rep-request-submit.
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string

// Concierge Rep Request — 3-step homeowner intake.
// Step 1 project info → Step 2 contact + availability → Step 3 review,
// Pay-with-saved-PM. The submit hook owns create-rep-request (POST +
// off_session PI confirm against payment_method_id per PR-5 #503); the
// webhook-INDEPENDENT confirm rail (PR-7 #505) lives in useChargeConfirm
// and drives the post-create UX through its 6-case discriminated state.
// No Stripe Elements PaymentElement mounts here (Rod (a) — pay button
// charges the homeowner's saved profile PM; "Use a different card" links
// out to /home/profile where they can switch the default).

type Step = 1 | 2 | 3

const MAX_PHOTOS = 5

// Phase 2 — explicit datetime picker, no buckets in UI per kratos msg
// 1782434876035 ("buckets FULLY REMOVED from UI; homeowner sees calendar
// only"). The wire still carries availabilityBuckets for back-compat —
// synthesized in use-rep-request-submit from requested_visit_at. Picker
// min attribute is now-rounded-to-the-minute so PAST datetimes are
// non-selectable client-side (mirrors hephaestus create-rep-request
// future-datetime 400 validation per contract msg 1782434304254).

function formatPickedVisitDisplay(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// form.requestedVisitAt holds YYYY-MM-DDTHH:MM (local-tz) so the
// submit-hook synthesizeBucketFromDatetime contract stays wire-stable.
// The picker UI splits into Calendar (date) + Select (time slot) and
// joins back into that string. Empty/invalid string → both undefined,
// step2Valid gate keeps Next disabled.
function splitVisitAt(s: string | undefined): {
  date: Date | undefined
  time: string | undefined
} {
  if (!s) return { date: undefined, time: undefined }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s)
  if (!m) return { date: undefined, time: undefined }
  const [, y, mo, d, hh, mm] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  return { date, time: `${hh}:${mm}` }
}

function joinVisitAt(
  date: Date | undefined,
  time: string | undefined,
): string | undefined {
  if (!date || !time) return undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`
}

function todayMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// 15-min slots, 9:00 AM through 6:00 PM inclusive (per Rod msg
// 1782447181436 "appointment times are only from 9 to 6"). Last slot is
// 18:00 sharp. Display in 12-hour am/pm; value stays 24h HH:MM so
// joinVisitAt + new Date(...) parsing in synthesizeBucketFromDatetime
// stay simple.
const TIME_SLOTS: { value: string; label: string }[] = (() => {
  const slots: { value: string; label: string }[] = []
  for (let h = 9; h <= 18; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 18 && m > 0) break
      const period = h >= 12 ? 'PM' : 'AM'
      const display12 = h % 12 === 0 ? 12 : h % 12
      const pad = (n: number) => String(n).padStart(2, '0')
      slots.push({
        value: `${pad(h)}:${pad(m)}`,
        label: `${display12}:${pad(m)} ${period}`,
      })
    }
  }
  return slots
})()

// base-ui Select.Value resolves selected-item label via items registry,
// but that registry can lag the trigger render under our Popup mount —
// the result is "14:00" leaking through (the raw value) instead of
// "2:00 PM". Pin the label render with an explicit value→label map fed
// to Select.Value's children render-prop; deterministic regardless of
// item-registration timing.
const TIME_LABEL_BY_VALUE: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const s of TIME_SLOTS) m[s.value] = s.label
  return m
})()

export function RepRequestIntakePage() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const [step, setStep] = useState<Step>(1)
  // Phase 1 intake redesign: prefill address + name + phone from the
  // logged-in homeowner profile so the homeowner never types address
  // (parseFlatAddress reject path can't fire on prefilled values we
  // already trust the format of). Editable fields remain: project
  // description, photos, availability buckets, access notes. Profile may
  // be null on first render before AuthBootstrap hydrates — the effect
  // below seeds empty slots once it lands without clobbering edits.
  const [form, setForm] = useState<IntakeFormData>(() => ({
    address: profile?.address ?? '',
    description: '',
    photos: [],
    contactName: profile?.name ?? '',
    contactPhone: profile?.phone ?? '',
    // availabilityBuckets stays on the type for wire back-compat; UI
    // never writes into it. Submit hook synthesizes a single bucket from
    // requestedVisitAt so legacy rep-side readers don't break.
    availabilityBuckets: [],
    accessNotes: '',
    requestedVisitAt: undefined,
  }))
  const [addressEdit, setAddressEdit] = useState(false)
  const [contactEdit, setContactEdit] = useState(false)

  // Late-arriving profile hydrate. Auth-store rehydrates from the
  // persisted Supabase session asynchronously; if the intake page mounts
  // before that resolves, the initial useState ran with profile=null.
  // Backfill empty slots only — don't clobber a value the homeowner
  // already typed in Edit mode.
  useEffect(() => {
    if (!profile) return
    setForm((prev) => ({
      ...prev,
      address: prev.address || profile.address || '',
      contactName: prev.contactName || profile.name || '',
      contactPhone: prev.contactPhone || profile.phone || '',
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])
  // Helios's hook. submit(form, paymentMethodId) POSTs create-rep-request,
  // attempts an off_session PI confirm against the saved PM server-side
  // (PR-5 #503 / 29421cd), transitions formState idle → submitting →
  // succeeded with paymentIntentStatus + requiresAction populated.
  // clientSecret is surfaced for the 3DS handoff path; we no longer mount
  // an Elements PaymentElement (Rod (a) — pay-with-saved-PM, no
  // PaymentElement on intake). The webhook-INDEPENDENT confirm rail lives
  // in useChargeConfirm (PR-7 #505 sync flip) — CAPTURE-A2 routing-around.
  const { formState, submit, retry, clientSecret } = useRepRequestSubmit()
  const sessionToken = useAuthStore((s) => s.session?.access_token ?? null)
  const chargeConfirm = useChargeConfirm()
  const fileInput = useRef<HTMLInputElement>(null)

  // Default payment method (purpose='service_pay_in') — the PM the server
  // attempts the off_session charge against. Gate on step===3 so we don't
  // round-trip the list query on Step 1/2. The list call also confirms the
  // PR-5 #503 / PR-3 #501 list fn surface is reachable before we let the
  // homeowner press Pay; if the fetch fails, Step 3 renders an error inline
  // instead of letting the Pay button 4xx silently.
  const paymentMethodsQuery = useQuery({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    enabled: step === 3 && !!sessionToken,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<unknown>(
        'payment-method-list',
        { body: { purpose: PAY_IN_PURPOSE } },
      )
      if (error) throw new Error(error.message)
      if (!data || typeof data !== 'object') {
        throw new Error('payment-method-list returned a non-object response.')
      }
      const obj = data as ListResponseShape
      if (obj.ok === false) {
        throw new Error(obj.error || 'payment-method-list returned ok:false.')
      }
      if (!Array.isArray(obj.payment_methods)) {
        throw new Error('payment-method-list response missing payment_methods array.')
      }
      return obj.payment_methods
    },
  })
  const defaultMethod = useMemo(() => {
    const methods = paymentMethodsQuery.data ?? []
    return methods.find((m) => m.is_default && m.status === 'active') ?? null
  }, [paymentMethodsQuery.data])

  // After create-rep-request settles into 'succeeded', drive the PR-7 #505
  // sync confirm rail. Two branches off the create response:
  //   requiresAction=true  → stripe.handleNextAction({ clientSecret }) → re-
  //     call PR-7 confirm. Wired via useChargeConfirm.handleThreeDSecure.
  //   requiresAction=false → PR-7 confirm directly. Server reads PI status
  //     from Stripe (succeeded | processing | terminal failure), flips the
  //     row, returns the 6-case discriminated union.
  // Guard on chargeConfirm idle so the effect doesn't re-fire after the
  // discriminator state lands.
  useEffect(() => {
    if (formState.kind !== 'succeeded') return
    if (chargeConfirm.state.kind !== 'idle') return
    if (formState.requiresAction && clientSecret) {
      void chargeConfirm.handleThreeDSecure(formState.repRequestId, clientSecret)
    } else {
      void chargeConfirm.confirmCharge(formState.repRequestId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.kind])

  // Inner-loop 3DS: PR-7 confirm may itself return requires_action (e.g.
  // the original off_session attempt deferred 3DS to the FE). Escalate to
  // handleThreeDSecure which drives stripe.handleNextAction + re-calls
  // PR-7 confirm. Recursion depth is capped inside useChargeConfirm at
  // MAX_3DS_PASSES=3 per kratos discipline msg 1782453014320.
  useEffect(() => {
    if (chargeConfirm.state.kind !== 'requires_action') return
    if (formState.kind !== 'succeeded') return
    void chargeConfirm.handleThreeDSecure(
      formState.repRequestId,
      chargeConfirm.state.clientSecret,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeConfirm.state.kind])

  // Terminal 'paid' → navigate to the status page. The row flipped server-
  // side via PR-7; the status page does its own fetch + tracker render.
  useEffect(() => {
    if (chargeConfirm.state.kind !== 'paid') return
    if (formState.kind !== 'succeeded') return
    navigate(`/home/rep-requests/${formState.repRequestId}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeConfirm.state.kind])

  // Google Places autocomplete on the Step1 address Input. onPlace writes the
  // canonical formatted_address into form.address (display string); onStructured
  // writes the parsed {line1,city,state,zip} into form.structuredAddress so
  // submit() can hand the edge fn a structured payload without re-parsing.
  // ref-setter re-binds on step unmount/remount (Step1 only mounts when step===1).
  const setAddressInputRef = usePlacesAutocomplete(
    !!MAPS_KEY,
    MAPS_KEY,
    (formatted) =>
      setForm((prev) => ({ ...prev, address: formatted })),
    (parts) =>
      setForm((prev) => ({ ...prev, structuredAddress: parts })),
  )

  const step1Valid = form.address.trim().length > 0
  // Step 2 valid iff contact present AND a future requested_visit_at is set.
  // Future check is client-side belt; server still validates via 400
  // invalid_requested_visit_at.
  const requestedVisitAt = form.requestedVisitAt
  const requestedVisitIsFuture = (() => {
    if (!requestedVisitAt) return false
    const t = Date.parse(requestedVisitAt)
    return Number.isFinite(t) && t > Date.now()
  })()
  const step2Valid =
    form.contactName.trim().length > 0 &&
    form.contactPhone.trim().length > 0 &&
    requestedVisitIsFuture

  function addPhotos(files: FileList | null) {
    if (!files) return
    const next = [...form.photos]
    for (const f of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) break
      next.push(f)
    }
    setForm({ ...form, photos: next })
  }
  function removePhoto(i: number) {
    setForm({ ...form, photos: form.photos.filter((_, idx) => idx !== i) })
  }

  // Footer right-button state machine. The Pay-$250 action lives in the
  // footer (no Elements PaymentElement — Rod (a)) and the post-create
  // confirm rail (PR-7 #505 via useChargeConfirm) paints the button on
  // the discriminated state.
  const footerRightButton = (() => {
    if (step < 3) {
      return (
        <Button
          onClick={() => setStep((s) => (s + 1) as Step)}
          disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
          data-testid="rep-request-intake-next-btn"
        >
          Next <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      )
    }
    // Step 3 — branches on formState first, then on chargeConfirm.state
    // once create has settled.
    if (formState.kind === 'submitting') {
      return (
        <Button disabled data-testid="rep-request-intake-pay-btn">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Setting up payment…
        </Button>
      )
    }
    if (formState.kind === 'paymentError') {
      return (
        <Button
          onClick={() => retry()}
          data-testid="rep-request-intake-retry-btn"
        >
          Try Again
        </Button>
      )
    }
    if (formState.kind === 'succeeded') {
      // Create succeeded; PR-7 confirm rail drives the button.
      switch (chargeConfirm.state.kind) {
        case 'idle':
        case 'confirming':
          return (
            <Button disabled data-testid="rep-request-intake-pay-btn">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Confirming payment…
            </Button>
          )
        case 'requires_action':
          return (
            <Button disabled data-testid="rep-request-intake-pay-btn">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Verifying with your bank…
            </Button>
          )
        case 'processing':
          return (
            <Button
              onClick={() => navigate(`/home/rep-requests/${formState.repRequestId}`)}
              data-testid="rep-request-intake-view-status-btn"
            >
              View status
            </Button>
          )
        case 'paid':
          return (
            <Button disabled data-testid="rep-request-intake-pay-btn">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Redirecting…
            </Button>
          )
        case 'requires_payment_method':
          return (
            <Button
              onClick={() => navigate('/home/profile?pm=add')}
              data-testid="rep-request-intake-add-pm-btn"
            >
              Use a different card
            </Button>
          )
        case 'unacceptable':
          return (
            <Button
              onClick={() => navigate(`/home/rep-requests/${formState.repRequestId}`)}
              data-testid="rep-request-intake-view-status-btn"
            >
              View request
            </Button>
          )
        case 'error':
          return (
            <Button
              onClick={() => {
                chargeConfirm.reset()
                void chargeConfirm.confirmCharge(formState.repRequestId)
              }}
              data-testid="rep-request-intake-retry-confirm-btn"
            >
              Try Again
            </Button>
          )
      }
    }
    // idle — pay button gated on default PM presence. No PM → CTA to
    // /home/profile?pm=add (PaymentMethodsSection auto-opens the Add
    // dialog on that query param) so the homeowner can drop a card and
    // bounce back to intake.
    if (paymentMethodsQuery.isLoading) {
      return (
        <Button disabled data-testid="rep-request-intake-pay-btn">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Loading…
        </Button>
      )
    }
    if (paymentMethodsQuery.error) {
      return (
        <Button
          onClick={() => paymentMethodsQuery.refetch()}
          data-testid="rep-request-intake-pm-retry-btn"
        >
          Retry
        </Button>
      )
    }
    if (!defaultMethod) {
      return (
        <Button
          onClick={() => navigate('/home/profile?pm=add')}
          data-testid="rep-request-intake-add-pm-btn"
        >
          Add a payment method
        </Button>
      )
    }
    return (
      <Button
        onClick={() => submit(form, defaultMethod.id)}
        data-testid="rep-request-intake-pay-btn"
      >
        Pay $250
      </Button>
    )
  })()

  // Back button disabled while a create POST is in flight OR while the
  // post-create confirm rail is running — going back mid-flight would
  // leak the in-progress request OR strand the homeowner mid-3DS.
  const chargeInFlight =
    formState.kind === 'succeeded' &&
    (chargeConfirm.state.kind === 'idle' ||
      chargeConfirm.state.kind === 'confirming' ||
      chargeConfirm.state.kind === 'requires_action')
  const backDisabled =
    step === 3 && (formState.kind === 'submitting' || chargeInFlight)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto px-4 py-8 sm:py-12"
    >
      <Card className="rounded-2xl shadow-sm p-6 sm:p-8" data-testid="rep-request-intake">
        <StepHeader step={step} />

        {step === 1 && (
          <Step1
            form={form}
            setForm={setForm}
            addPhotos={addPhotos}
            removePhoto={removePhoto}
            fileInput={fileInput}
            setAddressInputRef={setAddressInputRef}
            profileAddress={profile?.address ?? ''}
            additionalAddresses={profile?.additional_addresses ?? []}
            addressEdit={addressEdit}
            setAddressEdit={setAddressEdit}
          />
        )}
        {step === 2 && (
          <Step2
            form={form}
            setForm={setForm}
            profileName={profile?.name ?? ''}
            profilePhone={profile?.phone ?? ''}
            contactEdit={contactEdit}
            setContactEdit={setContactEdit}
          />
        )}
        {step === 3 && (
          <Step3
            form={form}
            formState={formState}
            defaultMethod={defaultMethod}
            paymentMethodsLoading={paymentMethodsQuery.isLoading}
            paymentMethodsError={
              paymentMethodsQuery.error instanceof Error
                ? paymentMethodsQuery.error.message
                : null
            }
            chargeConfirmState={chargeConfirm.state}
          />
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          {step === 1 ? (
            <Button
              variant="ghost"
              onClick={() => navigate('/home')}
              data-testid="rep-request-intake-cancel-btn"
            >
              Cancel
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={backDisabled}
              data-testid="rep-request-intake-back-btn"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {footerRightButton ?? <div />}
        </div>
      </Card>
    </motion.div>
  )
}

function StepHeader({ step }: { step: Step }) {
  const titles: Record<Step, string> = {
    1: 'Tell us about your project',
    2: 'When works for you?',
    3: 'Review & confirm',
  }
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight">
          {titles[step]}
        </h1>
        <span className="text-xs text-muted-foreground">
          Step {step} of 3
        </span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              n <= step ? 'bg-primary' : 'bg-muted',
            )}
            data-testid="rep-request-intake-step-pip"
            data-active={n === step ? 'true' : 'false'}
          />
        ))}
      </div>
    </div>
  )
}

interface Step1Props {
  form: IntakeFormData
  setForm: (next: IntakeFormData) => void
  addPhotos: (files: FileList | null) => void
  removePhoto: (i: number) => void
  fileInput: React.RefObject<HTMLInputElement | null>
  setAddressInputRef: (el: HTMLInputElement | null) => void
  profileAddress: string
  additionalAddresses: SecondaryAddress[]
  addressEdit: boolean
  setAddressEdit: (next: boolean) => void
}
function Step1({
  form,
  setForm,
  addPhotos,
  removePhoto,
  fileInput,
  setAddressInputRef,
  profileAddress,
  additionalAddresses,
  addressEdit,
  setAddressEdit,
}: Step1Props) {
  // additional_addresses with no state can't be handed to the edge fn
  // (bucketToWindow needs state), so filter the dropdown to entries that
  // have all four structured fields. Phase 1.5 can revisit a "complete
  // missing state" affordance if Rod's homeowners ever store stateless
  // secondaries — Donald Trump persona has additional_addresses=[].
  const usableSecondaries = additionalAddresses.filter(
    (a) => a.street && a.city && a.state && a.zip,
  )

  function selectSecondary(addr: SecondaryAddress) {
    const state = addr.state ?? ''
    const display = `${addr.street}, ${addr.city}, ${state} ${addr.zip}`.trim()
    setForm({
      ...form,
      address: display,
      structuredAddress: {
        line1: addr.street,
        city: addr.city,
        state,
        zip: addr.zip,
      },
    })
    setAddressEdit(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <Label>Project address</Label>
        {addressEdit ? (
          <div className="mt-1.5 space-y-2">
            <Input
              id="rri-address"
              data-testid="rep-request-intake-address"
              ref={setAddressInputRef}
              value={form.address}
              onChange={(e) =>
                // Manual edit clears the structured address — the formatted
                // string and the parsed parts can drift, so we drop
                // structuredAddress and let the submit hook fall back to
                // parseFlatAddress on confirm.
                setForm({ ...form, address: e.target.value, structuredAddress: undefined })
              }
              placeholder="Start typing your address…"
              autoComplete="off"
            />
            {profileAddress && (
              <button
                type="button"
                onClick={() => {
                  setForm({
                    ...form,
                    address: profileAddress,
                    structuredAddress: undefined,
                  })
                  setAddressEdit(false)
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
                data-testid="rep-request-intake-address-reset-profile"
              >
                Use my home address ({profileAddress})
              </button>
            )}
          </div>
        ) : (
          <div
            className="mt-1.5 rounded-lg border bg-muted/30 px-4 py-3 flex items-start justify-between gap-3"
            data-testid="rep-request-intake-address-readonly"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {form.address || '(no address on file)'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                From your profile
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAddressEdit(true)}
              data-testid="rep-request-intake-address-edit-btn"
              className="shrink-0"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          </div>
        )}
        {usableSecondaries.length > 0 && (
          <div className="mt-2">
            <Label
              htmlFor="rri-secondary-address"
              className="text-xs text-muted-foreground"
            >
              Or pick another property:
            </Label>
            <select
              id="rri-secondary-address"
              data-testid="rep-request-intake-secondary-address"
              onChange={(e) => {
                const id = e.target.value
                if (!id) return
                const picked = usableSecondaries.find((a) => a.id === id)
                if (picked) selectSecondary(picked)
                e.target.value = ''
              }}
              defaultValue=""
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Choose a saved address…
              </option>
              {usableSecondaries.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}: {a.street}, {a.city}, {a.state} {a.zip}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="rri-desc">What are you thinking? <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          id="rri-desc"
          data-testid="rep-request-intake-description"
          value={form.description ?? ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe the project — what you want, rough scope, anything we should know."
          rows={4}
          className="mt-1.5 resize-none"
        />
      </div>
      <div>
        <Label>Optional photos <span className="text-muted-foreground font-normal">(up to {MAX_PHOTOS})</span></Label>
        <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
          {form.photos.map((f, i) => (
            <div
              key={i}
              data-testid="rep-request-intake-photo-tile"
              className="relative aspect-square rounded-lg border bg-muted/40 flex items-center justify-center text-[10px] text-muted-foreground overflow-hidden"
            >
              <span className="px-1 truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute -top-1.5 -right-1.5 rounded-full bg-background border h-5 w-5 flex items-center justify-center shadow-sm"
                aria-label="Remove photo"
                data-testid="rep-request-intake-photo-remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {form.photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground transition-colors"
              data-testid="rep-request-intake-photo-add"
            >
              <Camera className="h-5 w-5" />
              <span>Add</span>
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addPhotos(e.target.files)}
        />
      </div>
    </div>
  )
}

interface Step2Props {
  form: IntakeFormData
  setForm: (next: IntakeFormData) => void
  profileName: string
  profilePhone: string
  contactEdit: boolean
  setContactEdit: (next: boolean) => void
}
function Step2({
  form,
  setForm,
  profileName,
  profilePhone,
  contactEdit,
  setContactEdit,
}: Step2Props) {
  // Local pickedDate/pickedTime are independent slots so a half-pick
  // (date OR time alone) is preserved across renders. Re-deriving them
  // each render from form.requestedVisitAt dropped both picks: each
  // half-pick composed against a derived-from-undefined other half, so
  // joinVisitAt returned undefined and form.requestedVisitAt never
  // moved → Next stayed gated forever even though the calendar showed
  // the selected day. (Rod blocker live-test 2026-06-26.)
  const initial = splitVisitAt(form.requestedVisitAt)
  const [pickedDate, setPickedDate] = useState<Date | undefined>(initial.date)
  const [pickedTime, setPickedTime] = useState<string | undefined>(initial.time)
  // Sync upward whenever either half changes. joinVisitAt returns
  // undefined when only one half is set, so the parent gate sees the
  // partial state correctly and keeps Next disabled until both are set.
  useEffect(() => {
    const joined = joinVisitAt(pickedDate, pickedTime)
    if (joined !== form.requestedVisitAt) {
      setForm({ ...form, requestedVisitAt: joined })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedDate, pickedTime])
  const minDate = todayMidnight()
  const requestedVisitAt = form.requestedVisitAt
  const requestedVisitIsFuture =
    !!requestedVisitAt &&
    Number.isFinite(Date.parse(requestedVisitAt)) &&
    Date.parse(requestedVisitAt) > Date.now()
  return (
    <div className="space-y-5">
      <div>
        <Label>Contact</Label>
        {contactEdit ? (
          <div className="mt-1.5 space-y-3">
            <div>
              <Label htmlFor="rri-name" className="text-xs text-muted-foreground">
                Your name
              </Label>
              <Input
                id="rri-name"
                data-testid="rep-request-intake-name"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label
                htmlFor="rri-phone"
                className="text-xs text-muted-foreground"
              >
                Best phone number
              </Label>
              <Input
                id="rri-phone"
                type="tel"
                data-testid="rep-request-intake-phone"
                value={form.contactPhone}
                onChange={(e) =>
                  setForm({ ...form, contactPhone: e.target.value })
                }
                placeholder="(555) 000-0000"
                className="mt-1"
              />
            </div>
            {(profileName || profilePhone) && (
              <button
                type="button"
                onClick={() => {
                  setForm({
                    ...form,
                    contactName: profileName,
                    contactPhone: profilePhone,
                  })
                  setContactEdit(false)
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
                data-testid="rep-request-intake-contact-reset-profile"
              >
                Use my profile name & phone
              </button>
            )}
          </div>
        ) : (
          <div
            className="mt-1.5 rounded-lg border bg-muted/30 px-4 py-3 flex items-start justify-between gap-3"
            data-testid="rep-request-intake-contact-readonly"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {form.contactName || '(no name on file)'}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {form.contactPhone || '(no phone on file)'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                From your profile
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setContactEdit(true)}
              data-testid="rep-request-intake-contact-edit-btn"
              className="shrink-0"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          </div>
        )}
      </div>
      <div>
        <Label>Pick a date &amp; time for the visit</Label>
        <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div
            className="rounded-lg border bg-card p-2 sm:p-3 self-start"
            data-testid="rep-request-intake-visit-date-card"
          >
            <Calendar
              mode="single"
              selected={pickedDate}
              onSelect={(date) => setPickedDate(date ?? undefined)}
              disabled={(date) => date < minDate}
              fromDate={minDate}
              className="[--cell-size:--spacing(10)]"
            />
          </div>
          <div className="flex flex-1 flex-col gap-3 min-w-0">
            <div>
              <Label htmlFor="rri-visit-time">Time of day</Label>
              <Select
                value={pickedTime}
                onValueChange={(t) => setPickedTime(t ?? undefined)}
              >
                <SelectTrigger
                  id="rri-visit-time"
                  data-testid="rep-request-intake-visit-time"
                  className="mt-1.5 h-11 text-base"
                >
                  <SelectValue placeholder="Choose a time">
                    {(v) =>
                      typeof v === 'string' && v in TIME_LABEL_BY_VALUE
                        ? TIME_LABEL_BY_VALUE[v]
                        : 'Choose a time'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {TIME_SLOTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {requestedVisitAt && requestedVisitIsFuture && (
              <p
                className="text-sm rounded-md bg-emerald-50 text-emerald-900 px-3 py-2 border border-emerald-200"
                data-testid="rep-request-intake-visit-summary"
              >
                Requested visit: {formatPickedVisitDisplay(requestedVisitAt)}
              </p>
            )}
            {requestedVisitAt && !requestedVisitIsFuture && (
              <p
                className="text-sm rounded-md bg-amber-50 text-amber-900 px-3 py-2 border border-amber-200"
                data-testid="rep-request-intake-visit-past-warning"
              >
                That time has passed — pick a future date and time.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Your rep will confirm or counter-propose after the request is
              received. Past dates aren&apos;t selectable.
            </p>
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor="rri-notes">Any notes for the rep? <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          id="rri-notes"
          data-testid="rep-request-intake-notes"
          value={form.accessNotes ?? ''}
          onChange={(e) => setForm({ ...form, accessNotes: e.target.value })}
          placeholder="Gate code, parking notes, etc."
          rows={3}
          className="mt-1.5 resize-none"
        />
      </div>
    </div>
  )
}

interface Step3Props {
  form: IntakeFormData
  formState: SubmitFormState
  defaultMethod: PaymentMethodListItem | null
  paymentMethodsLoading: boolean
  paymentMethodsError: string | null
  chargeConfirmState: ChargeConfirmState
}

function brandTitleCase(brand: string | null): string {
  if (!brand) return 'Card'
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

// Step 3 — review + pay surface. Rod (a): NO PaymentElement; the saved
// default payment method (purpose='service_pay_in') is the charge target,
// the Pay button (in the footer) drives create-rep-request +
// useChargeConfirm. PR-7 #505's 6-case discriminated state lands here as
// status copy; the Pay/Retry/View-status button stays in the footer so the
// surface visually settles between the summary cards.
function Step3({
  form,
  formState,
  defaultMethod,
  paymentMethodsLoading,
  paymentMethodsError,
  chargeConfirmState,
}: Step3Props) {
  const isCreateError =
    formState.kind === 'paymentError' && !formState.intentClientSecret

  return (
    <div className="space-y-5">
      {isCreateError && (
        <div
          role="alert"
          data-testid="rep-request-intake-create-error"
          className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm"
        >
          {formState.kind === 'paymentError'
            ? formState.reason || "Couldn't create the request — please try again."
            : null}
        </div>
      )}

      <Card className="rounded-lg bg-muted/40 p-4 text-sm space-y-1.5">
        <p className="font-medium">{form.address || '(no address)'}</p>
        {form.description && (
          <p className="text-muted-foreground">{form.description}</p>
        )}
        {form.requestedVisitAt && (
          <p className="text-muted-foreground text-xs">
            Requested visit: {formatPickedVisitDisplay(form.requestedVisitAt)}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Contact: {form.contactName} · {form.contactPhone}
        </p>
      </Card>

      <Card className="rounded-lg bg-muted/40 p-4 text-sm">
        <p className="font-semibold mb-3">Visit fee breakdown</p>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span>Visit fee charged today</span>
            <span className="font-semibold">$250.00</span>
          </div>
          <div className="flex justify-between text-emerald-600">
            <span>Refundable if you cancel*</span>
            <span>$200.00</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Non-refundable trip fee</span>
            <span>$50.00</span>
          </div>
        </div>
        <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          * If you cancel before a contractor is selected, $200 is returned to
          your original payment method within 5-7 business days. The $50 rep
          trip fee is retained.
        </p>
      </Card>

      <PaymentSurface
        defaultMethod={defaultMethod}
        paymentMethodsLoading={paymentMethodsLoading}
        paymentMethodsError={paymentMethodsError}
        formState={formState}
        chargeConfirmState={chargeConfirmState}
      />
    </div>
  )
}

interface PaymentSurfaceProps {
  defaultMethod: PaymentMethodListItem | null
  paymentMethodsLoading: boolean
  paymentMethodsError: string | null
  formState: SubmitFormState
  chargeConfirmState: ChargeConfirmState
}

// Renders the "paying with X" card pre-submit, then the PR-7 confirm-rail
// status copy post-submit. Action buttons live in the footer; this is
// status-display-only so the visual hierarchy stays settled.
function PaymentSurface({
  defaultMethod,
  paymentMethodsLoading,
  paymentMethodsError,
  formState,
  chargeConfirmState,
}: PaymentSurfaceProps) {
  // Post-submit (formState.succeeded) the PR-7 confirm-rail state owns
  // the surface — preempt the payment-method card.
  if (formState.kind === 'succeeded') {
    return (
      <ChargeStatusCard chargeConfirmState={chargeConfirmState} />
    )
  }

  if (paymentMethodsLoading) {
    return (
      <Card
        className="rounded-lg border-primary/20 p-4 text-sm flex items-center gap-2 text-muted-foreground"
        data-testid="rep-request-intake-pm-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your saved payment methods…
      </Card>
    )
  }

  if (paymentMethodsError) {
    return (
      <Card
        className="rounded-lg border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        data-testid="rep-request-intake-pm-error"
        role="alert"
      >
        Couldn't load your saved payment methods. {paymentMethodsError}
      </Card>
    )
  }

  if (!defaultMethod) {
    return (
      <Card
        className="rounded-lg border-primary/20 p-4 text-sm space-y-2"
        data-testid="rep-request-intake-pm-missing"
      >
        <p className="font-semibold">Add a payment method</p>
        <p className="text-muted-foreground">
          You don't have a saved card or bank yet. Add one to charge the $250
          visit fee — we'll bring you back here when you're done.
        </p>
      </Card>
    )
  }

  return (
    <Card
      className="rounded-lg border-primary/20 p-4 text-sm space-y-2"
      data-testid="rep-request-intake-pm-default"
    >
      <p className="font-semibold">Paying with</p>
      <div className="flex items-center gap-2.5">
        {defaultMethod.kind === 'us_bank_account' ? (
          <Landmark className="h-4 w-4 text-muted-foreground" />
        ) : (
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        )}
        <span>
          {defaultMethod.kind === 'us_bank_account'
            ? defaultMethod.bank_name || 'Bank account'
            : brandTitleCase(defaultMethod.brand)}{' '}
          •••• {defaultMethod.last4}
        </span>
      </div>
      <a
        href="/home/profile"
        className="inline-block text-xs text-primary underline-offset-2 hover:underline"
        data-testid="rep-request-intake-pm-switch-link"
      >
        Use a different card
      </a>
    </Card>
  )
}

interface ChargeStatusCardProps {
  chargeConfirmState: ChargeConfirmState
}

function ChargeStatusCard({ chargeConfirmState }: ChargeStatusCardProps) {
  switch (chargeConfirmState.kind) {
    case 'idle':
    case 'confirming':
      return (
        <Card
          className="rounded-lg border-primary/20 p-4 text-sm flex items-center gap-2 text-muted-foreground"
          data-testid="rep-request-intake-charge-confirming"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Confirming your $250 payment with Stripe…
        </Card>
      )
    case 'requires_action':
      return (
        <Card
          className="rounded-lg border-primary/20 p-4 text-sm space-y-1.5"
          data-testid="rep-request-intake-charge-3ds"
        >
          <p className="font-semibold flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Extra verification needed
          </p>
          <p className="text-muted-foreground text-xs">
            {chargeConfirmState.hint ||
              'Your bank wants to confirm this charge. Complete the prompt to finish.'}
          </p>
        </Card>
      )
    case 'processing':
      return (
        <Card
          className="rounded-lg border-primary/20 p-4 text-sm space-y-1.5"
          data-testid="rep-request-intake-charge-processing"
        >
          <p className="font-semibold">We're processing your payment</p>
          <p className="text-muted-foreground text-xs">
            Bank transfers can take a few business days to clear. Your request
            is saved — we'll email you when payment confirms.
          </p>
        </Card>
      )
    case 'paid':
      return (
        <Card
          className="rounded-lg border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-200 space-y-1.5"
          data-testid="rep-request-intake-charge-paid"
        >
          <p className="font-semibold">Payment confirmed</p>
          <p className="text-xs">
            We charged $
            {(chargeConfirmState.amountCents / 100).toFixed(2)} — your rep
            request is in. Redirecting you to your status page…
          </p>
        </Card>
      )
    case 'requires_payment_method':
      return (
        <Card
          className="rounded-lg border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-1.5"
          data-testid="rep-request-intake-charge-requires-pm"
          role="alert"
        >
          <p className="font-semibold">Card was declined</p>
          <p className="text-xs">{chargeConfirmState.reason}</p>
        </Card>
      )
    case 'unacceptable':
      return (
        <Card
          className="rounded-lg border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-1.5"
          data-testid="rep-request-intake-charge-unacceptable"
          role="alert"
        >
          <p className="font-semibold">Payment couldn't complete</p>
          <p className="text-xs">
            {chargeConfirmState.reason ||
              `The payment is in an unrecoverable state (${chargeConfirmState.status}). Open your request to see options.`}
          </p>
        </Card>
      )
    case 'error':
      return (
        <Card
          className="rounded-lg border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-1.5"
          data-testid="rep-request-intake-charge-error"
          role="alert"
        >
          <p className="font-semibold">Couldn't confirm payment</p>
          <p className="text-xs">{chargeConfirmState.reason}</p>
        </Card>
      )
  }
}

export default RepRequestIntakePage
