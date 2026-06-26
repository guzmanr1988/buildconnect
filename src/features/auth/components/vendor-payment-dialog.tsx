import { useEffect, useMemo, useState, useCallback } from 'react'
import { CheckCircle2, CreditCard, Landmark, Loader2, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { getStripe } from '@/lib/stripe-client'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import {
  PAYMENT_PURPOSE_LABELS,
  type VendorPaymentMethod,
  type VendorPaymentMethodKind,
  type VendorPaymentPurpose,
} from '@/stores/vendor-billing-store'
import type { PartyType } from '@/lib/financing/escrow/constants'

// Real-Stripe rewrite of the post-signup payment-method picker.
//
// External prop signature unchanged from the mock — caller still gets a
// VendorPaymentMethod-shaped object via onSuccess, so /vendor/banking,
// /vendor/membership, and /auth/register keep working without modification.
//
// Under the hood:
//   1. On open / tab-change → POST stripe-setup-intent-create with {kind, purpose}.
//   2. Receive client_secret → mount <Elements> + <PaymentElement>.
//      For card → renders the Stripe card field; PCI-safe iframe-scoped.
//      For us_bank_account → renders Financial Connections primary flow
//      with microdeposit fallback in a single iframe (Stripe picks the
//      path based on the user's bank support).
//   3. Submit → stripe.confirmSetup({ redirect: 'if_required' }).
//   4. On success → POST stripe-payment-method-finalize with setup_intent_id.
//      Server re-reads the SetupIntent from Stripe (canonical), writes
//      payment_methods row, returns display fields.
//   5. Map server response to VendorPaymentMethod shape, fire onSuccess.

const SUCCESS_DISPLAY_MS = 1500

export interface VendorPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (method: Omit<VendorPaymentMethod, 'id'>) => void
  blocking?: boolean
  initialKind?: VendorPaymentMethodKind
  initialHolder?: string
  initialPurpose?: VendorPaymentPurpose
  /** Render the membership/commissions/both purpose-radio. Default true keeps
   *  the existing vendor flows (register, banking, membership) untouched.
   *  Homeowner banking-payouts square will pass false — payouts dialog has
   *  one purpose, no UI choice to expose. */
  showPurposeRadio?: boolean
  /** Subset of purposes to render in the radio. Default is the full set
   *  ['both','membership','commissions']. Ignored when showPurposeRadio=false. */
  purposeOptions?: VendorPaymentPurpose[]
  /** Copy under the post-save check-mark. Default 'Heading to your vendor
   *  portal...' preserves the current vendor-flow copy. Homeowner / admin
   *  consumers can pass their own (e.g. 'Your payouts bank is on file.'). */
  ctaSuccessCopy?: string
  /** 'pay_in' (default) = original SetupIntent + PaymentElement flow for
   *  membership-IN / commissions-IN charges. 'pay_out' = createToken(
   *  bank_account) + stripe-connect-external-account-attach for payout
   *  bank-attach on an already-onboarded Connect account. The two paths
   *  share dialog chrome + success-state but render different forms
   *  internally. partyType is required when mode='pay_out'. */
  mode?: 'pay_in' | 'pay_out'
  /** Required when mode='pay_out'. Identifies which Connect account
   *  the bank-attach lands on. */
  partyType?: PartyType
}

type UIKind = 'card' | 'checking'
type StripeKind = 'card' | 'us_bank_account'

function uiKindFrom(kind: VendorPaymentMethodKind): UIKind {
  return kind === 'checking' ? 'checking' : 'card'
}

function stripeKindFor(uiKind: UIKind): StripeKind {
  return uiKind === 'checking' ? 'us_bank_account' : 'card'
}

const stripePromise = getStripe()

const DEFAULT_PURPOSE_OPTIONS: VendorPaymentPurpose[] = ['both', 'membership', 'commissions']

export function VendorPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  blocking = true,
  initialKind = 'card',
  initialHolder = '',
  initialPurpose = 'both',
  showPurposeRadio = true,
  purposeOptions = DEFAULT_PURPOSE_OPTIONS,
  ctaSuccessCopy = 'Your payment method is on file. Heading to your vendor portal...',
  mode = 'pay_in',
  partyType,
}: VendorPaymentDialogProps) {
  // mode='pay_out' requires partyType to know which Connect account to attach
  // the bank to. Fail loud at the boundary rather than silently 401-ing the
  // edge fn — caller bug should surface at dialog mount, not on submit.
  if (mode === 'pay_out' && !partyType) {
    throw new Error('VendorPaymentDialog: partyType is required when mode="pay_out"')
  }
  const [kind, setKind] = useState<UIKind>(uiKindFrom(initialKind))
  const [purpose, setPurpose] = useState<VendorPaymentPurpose>(initialPurpose)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null)
  const [intentLoading, setIntentLoading] = useState(false)
  const [intentError, setIntentError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // Gate setup-intent fetch on session presence — the dialog may open from
  // /auth/register BEFORE supabase.auth.getSession() resolves (register.tsx
  // sets paymentDialogOpen synchronously, race-proofing the redirect-useEffect).
  // Without this gate, supabase.functions.invoke falls back to the anon key
  // and the edge fn returns 401. Including access_token in deps lets the
  // useEffect re-fire when the session lands.
  const sessionToken = useAuthStore((s) => s.session?.access_token ?? null)

  useEffect(() => {
    if (!open) {
      setClientSecret(null)
      setSetupIntentId(null)
      setIntentError(null)
      setSuccess(false)
      setKind(uiKindFrom(initialKind))
      setPurpose(initialPurpose)
    }
  }, [open, initialKind, initialPurpose])

  useEffect(() => {
    if (!open || success) return
    // pay_out branch skips setup-intent entirely — PayoutBankForm tokenizes
    // via stripe.createToken('bank_account') + hits stripe-connect-external-
    // account-attach directly. No SetupIntent client_secret needed.
    if (mode === 'pay_out') {
      setIntentLoading(false)
      return
    }
    // Wait for session hydrate — POST without a Bearer JWT returns 401 from
    // stripe-setup-intent-create, and the useEffect won't re-fire unless
    // sessionToken is in deps. Clear stale error so the loader shows until
    // the session lands.
    if (!sessionToken) {
      setIntentError(null)
      setIntentLoading(true)
      return
    }
    let cancelled = false
    setClientSecret(null)
    setSetupIntentId(null)
    setIntentError(null)
    setIntentLoading(true)

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          ok: boolean
          setup_intent_id: string
          client_secret: string
          error?: string
        }>('stripe-setup-intent-create', {
          body: { kind: stripeKindFor(kind), purpose },
        })
        if (cancelled) return
        if (error) {
          setIntentError(error.message)
        } else if (!data?.ok || !data.client_secret) {
          setIntentError(data?.error || 'Failed to initialize payment.')
        } else {
          setClientSecret(data.client_secret)
          setSetupIntentId(data.setup_intent_id)
        }
      } catch (e) {
        if (cancelled) return
        setIntentError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setIntentLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, kind, purpose, success, sessionToken, mode])

  const elementsOptions: StripeElementsOptions | null = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: { theme: 'stripe' },
          }
        : null,
    [clientSecret],
  )

  const handleSuccess = useCallback(
    (method: Omit<VendorPaymentMethod, 'id'>) => {
      setSuccess(true)
      setTimeout(() => {
        onSuccess(method)
        onOpenChange(false)
      }, SUCCESS_DISPLAY_MS)
    },
    [onSuccess, onOpenChange],
  )

  function handleOpenChange(next: boolean) {
    if (!next && blocking && !success) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {success ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-9 w-9" strokeWidth={2.4} />
            </motion.div>
            <div className="text-center">
              <h3 className="text-lg font-bold font-heading text-emerald-700 dark:text-emerald-400">
                Payment method saved
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {ctaSuccessCopy}
              </p>
            </div>
          </div>
        ) : mode === 'pay_out' ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">
                Connect a payout bank account
              </DialogTitle>
              <DialogDescription>
                Add the bank account where you'd like to receive payouts.
                Routing + account numbers go directly to our secure payments
                partner — BuildConnect never sees or stores the raw values.
              </DialogDescription>
            </DialogHeader>

            <PayoutBankForm
              partyType={partyType!}
              initialHolder={initialHolder}
              onAttached={handleSuccess}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">
                Set up your payment method
              </DialogTitle>
              <DialogDescription>
                Pick how you'll pay membership + receive commission payouts.
                You can change this later in your vendor portal.
              </DialogDescription>
            </DialogHeader>

            {showPurposeRadio && (
              <div
                role="radiogroup"
                aria-label="Payment method purpose"
                className={cn(
                  'mt-2 grid gap-1 rounded-lg bg-muted p-1',
                  purposeOptions.length === 3 && 'grid-cols-3',
                  purposeOptions.length === 2 && 'grid-cols-2',
                  purposeOptions.length === 1 && 'grid-cols-1',
                )}
              >
                {purposeOptions.map((p) => {
                  const selected = purpose === p
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-payment-purpose={p}
                      data-payment-purpose-selected={selected ? 'true' : 'false'}
                      onClick={() => setPurpose(p)}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                        selected
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {PAYMENT_PURPOSE_LABELS[p]}
                    </button>
                  )
                })}
              </div>
            )}

            <Tabs value={kind} onValueChange={(v) => setKind(v as UIKind)} className="mt-2">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="card" className="text-xs gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  Card
                </TabsTrigger>
                <TabsTrigger value="checking" className="text-xs gap-1.5">
                  <Landmark className="h-3.5 w-3.5" />
                  Checking
                </TabsTrigger>
              </TabsList>

              <TabsContent value="card" className="mt-4">
                <PaymentForm
                  kind={kind}
                  purpose={purpose}
                  intentLoading={intentLoading}
                  intentError={intentError}
                  elementsOptions={elementsOptions}
                  setupIntentId={setupIntentId}
                  initialHolder={initialHolder}
                  onMethodSaved={handleSuccess}
                />
              </TabsContent>
              <TabsContent value="checking" className="mt-4">
                <PaymentForm
                  kind={kind}
                  purpose={purpose}
                  intentLoading={intentLoading}
                  intentError={intentError}
                  elementsOptions={elementsOptions}
                  setupIntentId={setupIntentId}
                  initialHolder={initialHolder}
                  onMethodSaved={handleSuccess}
                />
              </TabsContent>
            </Tabs>

            <p className="pt-3 text-[11px] text-center text-muted-foreground leading-relaxed">
              Card and bank details are entered directly into our secure payments
              partner — BuildConnect never sees or stores the raw numbers. Update
              anytime from your vendor portal.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface PaymentFormProps {
  kind: UIKind
  purpose: VendorPaymentPurpose
  intentLoading: boolean
  intentError: string | null
  elementsOptions: StripeElementsOptions | null
  setupIntentId: string | null
  initialHolder: string
  onMethodSaved: (method: Omit<VendorPaymentMethod, 'id'>) => void
}

function PaymentForm({
  kind,
  purpose,
  intentLoading,
  intentError,
  elementsOptions,
  setupIntentId,
  initialHolder,
  onMethodSaved,
}: PaymentFormProps) {
  if (intentLoading || !elementsOptions || !setupIntentId) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        {intentError ? (
          <>
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-destructive text-center">{intentError}</p>
            <p className="text-xs text-center">Close and reopen the dialog to retry.</p>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Preparing secure payment form...</p>
          </>
        )}
      </div>
    )
  }

  return (
    <Elements
      key={setupIntentId}
      stripe={stripePromise}
      options={elementsOptions}
    >
      <PaymentFormInner
        kind={kind}
        purpose={purpose}
        initialHolder={initialHolder}
        onMethodSaved={onMethodSaved}
      />
    </Elements>
  )
}

interface PaymentFormInnerProps {
  kind: UIKind
  purpose: VendorPaymentPurpose
  initialHolder: string
  onMethodSaved: (method: Omit<VendorPaymentMethod, 'id'>) => void
}

function PaymentFormInner({
  kind,
  purpose,
  initialHolder,
  onMethodSaved,
}: PaymentFormInnerProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentElementReady, setPaymentElementReady] = useState(false)

  async function handleSubmit() {
    if (!stripe || !elements) return
    setError(null)
    setSubmitting(true)

    try {
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href,
          payment_method_data: initialHolder
            ? { billing_details: { name: initialHolder } }
            : undefined,
        },
        redirect: 'if_required',
      })

      if (confirmError) {
        setError(confirmError.message || 'Payment confirmation failed.')
        setSubmitting(false)
        return
      }
      if (!setupIntent) {
        setError('Payment processor did not return a SetupIntent.')
        setSubmitting(false)
        return
      }

      // Finalize server-side. Server re-reads the SetupIntent from Stripe
      // (canonical) and writes the payment_methods row.
      const { data, error: finalizeError } = await supabase.functions.invoke<{
        ok: boolean
        kind: 'card' | 'us_bank_account'
        status: 'active' | 'pending_verification'
        last4: string
        brand?: string
        bank_name?: string
        verification_method?: 'financial_connections' | 'microdeposits'
        error?: string
      }>('stripe-payment-method-finalize', {
        body: { setup_intent_id: setupIntent.id, purpose },
      })

      if (finalizeError || !data?.ok) {
        setError(finalizeError?.message || data?.error || 'Failed to save payment method.')
        setSubmitting(false)
        return
      }

      const method: Omit<VendorPaymentMethod, 'id'> = {
        purpose,
        kind: data.kind === 'us_bank_account' ? 'checking' : 'card',
        last4: data.last4,
        holder: initialHolder || '',
        brand: data.brand,
        bankName: data.bank_name,
        addedAt: new Date().toISOString(),
      }
      onMethodSaved(method)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  const submitLabel =
    kind === 'checking' ? 'Connect bank account' : 'Save payment method'

  return (
    <div className="space-y-4">
      <PaymentElement
        onReady={() => setPaymentElementReady(true)}
        options={{
          defaultValues: initialHolder
            ? { billingDetails: { name: initialHolder } }
            : undefined,
        }}
      />
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <Button
        onClick={handleSubmit}
        disabled={!stripe || !elements || !paymentElementReady || submitting}
        size="lg"
        className="w-full h-11 text-sm font-medium"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          submitLabel
        )}
      </Button>
    </div>
  )
}

// pay_out branch — bank-attach via stripe.createToken('bank_account') +
// stripe-connect-external-account-attach edge fn. PCI-safe per Stripe.js
// (tokenization happens via the SDK call; the routing/account values cross
// our DOM but never hit our server, satisfying SAQ A scope).
// Per hephaestus contract (msg 1782433981527 + 1782433047894): partyType in,
// btok_ from createToken, response { ok, external_account_id, last4, bank_name, currency, default_for_currency }.
// setDefault defaults to true on the edge fn side; v1 ships swap-by-redefault
// (no detach-first; kratos msg 1782432903335 accepted orphan-bank clutter).

interface PayoutBankFormProps {
  partyType: PartyType
  initialHolder: string
  onAttached: (method: Omit<VendorPaymentMethod, 'id'>) => void
}

function PayoutBankForm({
  partyType,
  initialHolder,
  onAttached,
}: PayoutBankFormProps) {
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [holderName, setHolderName] = useState(initialHolder)
  const [holderType, setHolderType] = useState<'individual' | 'company'>('individual')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    !submitting &&
    routingNumber.replace(/\D/g, '').length === 9 &&
    accountNumber.replace(/\D/g, '').length >= 4 &&
    holderName.trim().length > 0

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const stripe = await stripePromise
      if (!stripe) {
        setError('Stripe.js failed to load.')
        setSubmitting(false)
        return
      }

      const { token, error: tokenError } = await stripe.createToken('bank_account', {
        country: 'US',
        currency: 'usd',
        routing_number: routingNumber.replace(/\D/g, ''),
        account_number: accountNumber.replace(/\D/g, ''),
        account_holder_name: holderName.trim(),
        account_holder_type: holderType,
      })

      if (tokenError || !token) {
        setError(tokenError?.message || 'Could not tokenize bank account.')
        setSubmitting(false)
        return
      }

      const { data, error: attachError } = await supabase.functions.invoke<{
        ok: boolean
        external_account_id: string
        last4: string
        bank_name: string | null
        currency: string
        default_for_currency: boolean
        code?: string
        error?: string
        stripe_external_account_id?: string
      }>('stripe-connect-external-account-attach', {
        body: { partyType, token_id: token.id, setDefault: true },
      })

      if (attachError || !data?.ok) {
        setError(
          attachError?.message ||
            data?.error ||
            'Bank attach failed. Please try again.',
        )
        setSubmitting(false)
        return
      }

      // Synthesize VendorPaymentMethod-shaped success payload for the
      // shared handleSuccess pathway. purpose='both' is a placeholder —
      // payouts dialog never renders the purpose-radio so the value is
      // not user-meaningful, only required by the existing onSuccess
      // contract that vendor callers rely on.
      onAttached({
        purpose: 'both',
        kind: 'checking',
        last4: data.last4,
        holder: holderName.trim(),
        bankName: data.bank_name ?? undefined,
        addedAt: new Date().toISOString(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2 space-y-3">
      <div>
        <Label htmlFor="payout-holder-name" className="text-xs">
          Account holder name
        </Label>
        <Input
          id="payout-holder-name"
          data-testid="payout-bank-holder-name"
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
          placeholder="Jane Doe"
          className="mt-1"
          autoComplete="off"
        />
      </div>
      <div>
        <Label className="text-xs">Account type</Label>
        <div
          role="radiogroup"
          aria-label="Account holder type"
          className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        >
          {(['individual', 'company'] as const).map((t) => {
            const selected = holderType === t
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`payout-bank-holder-type-${t}`}
                onClick={() => setHolderType(t)}
                className={cn(
                  'rounded-md px-2 py-1.5 text-xs font-medium transition-colors capitalize',
                  selected
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <Label htmlFor="payout-routing-number" className="text-xs">
          Routing number
        </Label>
        <Input
          id="payout-routing-number"
          data-testid="payout-bank-routing"
          value={routingNumber}
          onChange={(e) => setRoutingNumber(e.target.value)}
          inputMode="numeric"
          maxLength={9}
          placeholder="9 digits"
          className="mt-1 font-mono"
          autoComplete="off"
        />
      </div>
      <div>
        <Label htmlFor="payout-account-number" className="text-xs">
          Account number
        </Label>
        <Input
          id="payout-account-number"
          data-testid="payout-bank-account"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          inputMode="numeric"
          placeholder="Checking account number"
          className="mt-1 font-mono"
          autoComplete="off"
        />
      </div>
      {error && (
        <div
          role="alert"
          data-testid="payout-bank-error"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        size="lg"
        className="w-full h-11 text-sm font-medium"
        data-testid="payout-bank-submit"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          'Connect bank for payouts'
        )}
      </Button>
      <p className="pt-1 text-[11px] text-center text-muted-foreground leading-relaxed">
        Bank details are tokenized client-side by Stripe.js — BuildConnect
        never sees or stores the raw routing or account numbers.
      </p>
    </div>
  )
}
