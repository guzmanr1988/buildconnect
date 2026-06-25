import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Camera, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useRepRequestSubmit } from '@/hooks/use-rep-request-submit'
import type {
  IntakeFormData,
  RepRequestAvailabilityBucket,
  SubmitFormState,
} from '@/features/admin/rep-requests/rep-request-contract'

// Concierge Rep Request — 3-step homeowner intake.
// Step 1 project info → Step 2 contact + availability → Step 3 review + pay.
// Stripe Elements wiring lands in commit 4 alongside helios's
// useRepRequestSubmit hook; Step 3 [Confirm & Pay] is intentionally
// inert here so the scaffold ships compile-clean without a Stripe dep.

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
  // Stripe submit state from helios's hook. retry() re-uses the same
  // PaymentIntent client_secret per athena §4.3.1 idempotency rule.
  // submit/retry are no-ops in the scaffold; commit 2.5 wires the
  // edge-fn POST, commit 4 mounts <Elements> + drives confirmPayment.
  const { formState: submitState } = useRepRequestSubmit()
  const fileInput = useRef<HTMLInputElement>(null)

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
          <Step1 form={form} setForm={setForm} addPhotos={addPhotos} removePhoto={removePhoto} fileInput={fileInput} />
        )}
        {step === 2 && (
          <Step2 form={form} setForm={setForm} toggleBucket={toggleBucket} />
        )}
        {step === 3 && <Step3 form={form} submitState={submitState} />}

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
              data-testid="rep-request-intake-back-btn"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              data-testid="rep-request-intake-next-btn"
            >
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              disabled
              data-testid="rep-request-intake-pay-btn"
              title="Stripe Elements wiring lands in commit 4"
            >
              Confirm & Pay $250
            </Button>
          )}
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
}
function Step1({ form, setForm, addPhotos, removePhoto, fileInput }: Step1Props) {
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="rri-address">Project address</Label>
        <Input
          id="rri-address"
          data-testid="rep-request-intake-address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="123 Main St, Anytown FL 33101"
          className="mt-1.5"
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

function Step3({ form, submitState }: { form: IntakeFormData; submitState: SubmitFormState }) {
  const isError = submitState.kind === 'paymentError'
  return (
    <div className="space-y-5">
      {isError && (
        <div
          role="alert"
          data-testid="rep-request-intake-payment-error"
          className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm"
        >
          Payment didn't go through — please try again.
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
      {/* TODO commit 4: mount <Elements stripe={stripePromise}> here and
          render <PaymentElement /> + drive stripe.confirmPayment from
          the [Confirm & Pay $250] button via helios's
          useRepRequestSubmit hook. submitState wiring is already in
          place above for the paymentError variant. */}
    </div>
  )
}

export default RepRequestIntakePage
