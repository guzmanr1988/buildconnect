import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Camera, Loader2, X } from 'lucide-react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useRepRequestSubmit } from '@/hooks/use-rep-request-submit'
import { usePlacesAutocomplete } from '@/hooks/use-places-autocomplete'
import { stripePromise } from '@/lib/stripe-client'
import type {
  IntakeFormData,
  RepRequestAvailabilityBucket,
  SubmitFormState,
} from '@/features/admin/rep-requests/rep-request-contract'

// Same Google Maps key the roof flow uses (VITE_-baked at build time). When
// missing, the autocomplete hook short-circuits to no-op and the input degrades
// to plain text → parseFlatAddress fallback in use-rep-request-submit.
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string

// Concierge Rep Request — 3-step homeowner intake.
// Step 1 project info → Step 2 contact + availability → Step 3 review,
// PaymentElement, confirmPayment. The submit hook owns the
// create-rep-request POST (idle → submitting → succeeded); the
// PaymentForm subcomponent owns the actual stripe.confirmPayment call
// (mounted inside <Elements> so useStripe/useElements resolve).

type Step = 1 | 2 | 3

const MAX_PHOTOS = 5

const BUCKET_LABEL: Record<RepRequestAvailabilityBucket, string> = {
  weekday_morning: 'Weekday morning',
  weekday_afternoon: 'Weekday afternoon',
  weekend_anytime: 'Weekend anytime',
}
const BUCKETS: RepRequestAvailabilityBucket[] = [
  'weekday_morning',
  'weekday_afternoon',
  'weekend_anytime',
]

export function RepRequestIntakePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<IntakeFormData>({
    address: '',
    description: '',
    photos: [],
    contactName: '',
    contactPhone: '',
    availabilityBuckets: [],
    accessNotes: '',
  })
  // Helios's hook. submit() POSTs create-rep-request and transitions
  // formState idle → submitting → succeeded (with rep_request_id) +
  // populates clientSecret. retry() preserves the same client_secret
  // per athena §4.3.1 idempotency. confirmPayment is component-side.
  const { formState, submit, retry, clientSecret } = useRepRequestSubmit()
  const fileInput = useRef<HTMLInputElement>(null)

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
  const step2Valid =
    form.contactName.trim().length > 0 &&
    form.contactPhone.trim().length > 0 &&
    form.availabilityBuckets.length > 0

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
  function toggleBucket(b: RepRequestAvailabilityBucket) {
    const has = form.availabilityBuckets.includes(b)
    setForm({
      ...form,
      availabilityBuckets: has
        ? form.availabilityBuckets.filter((x) => x !== b)
        : [...form.availabilityBuckets, b],
    })
  }

  // Footer right-button state machine. The Pay-$250 action moves
  // INSIDE <Elements> once clientSecret arrives (useStripe needs the
  // Elements provider scope), so the footer suppresses its own primary
  // CTA in that window.
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
    // Step 3 — branches on formState.
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
    if (formState.kind === 'succeeded' && clientSecret) {
      // Suppress footer CTA — inline PaymentForm renders its own Pay
      // button inside the Elements provider scope.
      return null
    }
    // idle — gather form clicks Confirm to fire submit().
    return (
      <Button
        onClick={() => submit(form)}
        data-testid="rep-request-intake-confirm-btn"
      >
        Confirm Details & Continue
      </Button>
    )
  })()

  // Back button disabled while a create POST is in flight — going
  // back mid-submit would leak the in-progress request.
  const backDisabled = step === 3 && formState.kind === 'submitting'

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
          />
        )}
        {step === 2 && (
          <Step2 form={form} setForm={setForm} toggleBucket={toggleBucket} />
        )}
        {step === 3 && (
          <Step3
            form={form}
            formState={formState}
            clientSecret={clientSecret}
            onPaid={(repRequestId) => navigate(`/home/rep-requests/${repRequestId}`)}
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
}
function Step1({ form, setForm, addPhotos, removePhoto, fileInput, setAddressInputRef }: Step1Props) {
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="rri-address">Project address</Label>
        <Input
          id="rri-address"
          data-testid="rep-request-intake-address"
          ref={setAddressInputRef}
          value={form.address}
          onChange={(e) =>
            // Manual edit clears the structured address — the formatted string
            // and the parsed parts can drift, so we drop structuredAddress and
            // let the submit hook fall back to parseFlatAddress on confirm.
            setForm({ ...form, address: e.target.value, structuredAddress: undefined })
          }
          placeholder="Start typing your address…"
          className="mt-1.5"
          autoComplete="off"
        />
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
  toggleBucket: (b: RepRequestAvailabilityBucket) => void
}
function Step2({ form, setForm, toggleBucket }: Step2Props) {
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="rri-name">Your name</Label>
        <Input
          id="rri-name"
          data-testid="rep-request-intake-name"
          value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor="rri-phone">Best phone number</Label>
        <Input
          id="rri-phone"
          type="tel"
          data-testid="rep-request-intake-phone"
          value={form.contactPhone}
          onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          placeholder="(555) 000-0000"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label>Best times for a visit <span className="text-muted-foreground font-normal">(select all that apply)</span></Label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {BUCKETS.map((b) => {
            const active = form.availabilityBuckets.includes(b)
            return (
              <button
                key={b}
                type="button"
                onClick={() => toggleBucket(b)}
                data-testid="rep-request-intake-bucket"
                data-bucket={b}
                data-active={active ? 'true' : 'false'}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors text-center',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/30',
                )}
              >
                {BUCKET_LABEL[b]}
              </button>
            )
          })}
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
  clientSecret: string | null
  onPaid: (repRequestId: string) => void
}
function Step3({ form, formState, clientSecret, onPaid }: Step3Props) {
  const isCreateError =
    formState.kind === 'paymentError' && !formState.intentClientSecret
  const repRequestId =
    formState.kind === 'succeeded' ? formState.repRequestId : null

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
        {form.availabilityBuckets.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Availability: {form.availabilityBuckets.map((b) => BUCKET_LABEL[b]).join(', ')}
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

      {/* Payment surface only mounts once the create-rep-request edge
          fn has returned a clientSecret. Elements re-mounts cleanly if
          the secret changes (e.g. retry path generates a new PI). */}
      {clientSecret && repRequestId && (
        <StripePaymentBlock
          clientSecret={clientSecret}
          repRequestId={repRequestId}
          onPaid={onPaid}
        />
      )}
    </div>
  )
}

interface StripePaymentBlockProps {
  clientSecret: string
  repRequestId: string
  onPaid: (repRequestId: string) => void
}
function StripePaymentBlock({ clientSecret, repRequestId, onPaid }: StripePaymentBlockProps) {
  // clientSecret keys the Elements provider — when it changes, the
  // provider re-mounts with a fresh PaymentIntent context. Theme stays
  // neutral so the form blends with the surrounding Card surface.
  const options: StripeElementsOptions = {
    clientSecret,
    appearance: { theme: 'stripe' },
  }
  return (
    <Card
      className="rounded-lg border-primary/20 p-4 space-y-4"
      data-testid="rep-request-intake-payment-block"
    >
      <p className="text-sm font-semibold">Payment</p>
      <Elements stripe={stripePromise} options={options} key={clientSecret}>
        <PaymentForm repRequestId={repRequestId} onPaid={onPaid} />
      </Elements>
    </Card>
  )
}

interface PaymentFormProps {
  repRequestId: string
  onPaid: (repRequestId: string) => void
}
function PaymentForm({ repRequestId, onPaid }: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentElementReady, setPaymentElementReady] = useState(false)

  // Clear stale error on PaymentElement remount (e.g. after a retry
  // that swaps the clientSecret).
  useEffect(() => {
    setError(null)
  }, [repRequestId])

  async function onPay() {
    if (!stripe || !elements || confirming) return
    setConfirming(true)
    setError(null)

    // return_url drives the 3DS / redirect-required path. For
    // non-redirect cards, redirect:'if_required' keeps the homeowner
    // on this page so we can navigate ourselves on success and
    // surface the error inline on failure.
    const returnUrl = `${window.location.origin}/home/rep-requests/${repRequestId}`
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed — please try again.')
      setConfirming(false)
      return
    }

    // Non-redirect success path. succeeded | processing both progress
    // the homeowner to the status page; the Stripe webhook eventually
    // flips status=pending_payment → new + sends the email.
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onPaid(repRequestId)
      return
    }

    setError('Payment did not complete. Please try again.')
    setConfirming(false)
  }

  return (
    <div className="space-y-4">
      <div data-testid="rep-request-intake-payment-element">
        <PaymentElement
          onReady={() => setPaymentElementReady(true)}
          options={{ layout: 'tabs' }}
        />
      </div>
      {error && (
        <p
          role="alert"
          data-testid="rep-request-intake-payment-error"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button
        onClick={onPay}
        disabled={!stripe || !elements || !paymentElementReady || confirming}
        className="w-full"
        data-testid="rep-request-intake-pay-btn"
      >
        {confirming ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing…
          </>
        ) : (
          'Pay $250'
        )}
      </Button>
    </div>
  )
}

export default RepRequestIntakePage
