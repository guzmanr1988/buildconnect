import { useEffect, useMemo, useState, useCallback } from 'react'
import { CheckCircle2, CreditCard, Landmark, Loader2, AlertCircle, Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import type {
  StripeElementsOptions,
  StripeCardNumberElementOptions,
  StripeCardExpiryElementOptions,
  StripeCardCvcElementOptions,
} from '@stripe/stripe-js'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getStripe } from '@/lib/stripe-client'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import {
  type VendorPaymentMethod,
  type VendorPaymentMethodKind,
  type VendorPaymentPurpose,
} from '@/stores/vendor-billing-store'

// Real-Stripe rewrite of the post-signup payment-method picker.
//
// External prop signature unchanged from the mock — caller still gets a
// VendorPaymentMethod-shaped object via onSuccess, so /vendor/banking,
// /vendor/membership, and /auth/register keep working without modification.
//
// Three tabs: Credit Card / Debit Card / Checking. Credit + Debit are
// presentational — both render the SAME split card Elements instance so the
// iframe (and its PM setup token) is not remounted when the user toggles
// between them. Funding (credit vs debit) is still resolved by Stripe at
// tokenization via paymentMethod.card.funding and persisted on
// SetupIntent.metadata.buildconnect_card_funding by the finalize edge fn.
// No submit-time credit-vs-debit rejection gate — the tabs are cosmetic,
// intentionally frictionless.
//
// Card branch: Stripe Elements split fields (CardNumber/Expiry/Cvc) — PCI-safe
// iframe-scoped (SAQ-A eligible). confirmCardSetup on submit.
//
// Checking branch: plain <Input> fields for routing/account/name. Bank name
// auto-detected live from a bundled FedACH routing→bank_name map, then
// re-confirmed by Stripe (canonical) at tokenization. Verification is
// microdeposits (1-2 business days) — Stripe issues them automatically when
// a manually-entered us_bank_account PM is confirmed against an SI created
// with verification_method='automatic' AND no financial_connections_account.
// The finalize fn already handles this shape (rowStatus='pending_verification',
// verification_method='microdeposits').

const SUCCESS_DISPLAY_MS = 1500

export interface VendorPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (method: Omit<VendorPaymentMethod, 'id'>) => void
  blocking?: boolean
  initialKind?: VendorPaymentMethodKind
  initialHolder?: string
  initialPurpose?: VendorPaymentPurpose
}

type UIKind = 'credit' | 'debit' | 'checking'
type StripeKind = 'card' | 'us_bank_account'

function uiKindFrom(kind: VendorPaymentMethodKind): UIKind {
  // VendorPaymentMethodKind is 'card' | 'checking' from the caller's view.
  // Default card-kind entrants land on the Credit Card tab (the first card
  // tab) — funding is auto-detected by Stripe at tokenization, so this
  // default is cosmetic-only.
  return kind === 'checking' ? 'checking' : 'credit'
}

function stripeKindFor(uiKind: UIKind): StripeKind {
  return uiKind === 'checking' ? 'us_bank_account' : 'card'
}

function submitLabelFor(uiKind: UIKind): string {
  if (uiKind === 'checking') return 'Submit Checking'
  if (uiKind === 'debit') return 'Submit Debit Card'
  return 'Submit Credit Card'
}

const stripePromise = getStripe()

export function VendorPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  blocking = true,
  initialKind = 'card',
  initialHolder = '',
  initialPurpose = 'both',
}: VendorPaymentDialogProps) {
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
  // Fetch the SetupIntent per Stripe-kind, not per UI-tab: toggling Credit ↔
  // Debit stays on stripeKind='card' so the same SI (and the same Stripe
  // Elements iframe instance) is preserved across those two tabs. Switching
  // to Checking flips to 'us_bank_account' and re-fetches.
  const stripeKind = stripeKindFor(kind)

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
          body: { kind: stripeKind, purpose },
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
  }, [open, stripeKind, purpose, success, sessionToken])

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
                Your payment method is on file. Heading to your vendor portal...
              </p>
            </div>
          </div>
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

            <Tabs value={kind} onValueChange={(v) => setKind(v as UIKind)} className="mt-4">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="credit" className="text-xs gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  Credit Card
                </TabsTrigger>
                <TabsTrigger value="debit" className="text-xs gap-1.5">
                  <Wallet className="h-3.5 w-3.5" />
                  Debit Card
                </TabsTrigger>
                <TabsTrigger value="checking" className="text-xs gap-1.5">
                  <Landmark className="h-3.5 w-3.5" />
                  Checking
                </TabsTrigger>
              </TabsList>

              {/* PaymentForm renders OUTSIDE <TabsContent> on purpose. Credit
                  and Debit tabs must share the same Stripe Elements iframe
                  instance so the underlying PM setup token is not regenerated
                  when the user toggles between them. Placing the form inside
                  per-tab TabsContent blocks would remount the CardNumberElement
                  on every tab change. Switching to Checking triggers a
                  legitimate SI re-fetch (different stripeKind), which does
                  remount Elements — that's the intended behavior. */}
              <div className="mt-4">
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
              </div>
            </Tabs>

            <p className="pt-3 text-[11px] text-center text-muted-foreground leading-relaxed">
              Payment info is stored securely and used for your membership and
              commission payouts. Update anytime from your vendor portal.
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
        clientSecret={elementsOptions.clientSecret as string}
        initialHolder={initialHolder}
        onMethodSaved={onMethodSaved}
      />
    </Elements>
  )
}

interface PaymentFormInnerProps {
  kind: UIKind
  purpose: VendorPaymentPurpose
  clientSecret: string
  initialHolder: string
  onMethodSaved: (method: Omit<VendorPaymentMethod, 'id'>) => void
}

function PaymentFormInner({
  kind,
  purpose,
  clientSecret,
  initialHolder,
  onMethodSaved,
}: PaymentFormInnerProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [holderName, setHolderName] = useState(initialHolder)
  const [cardNumberReady, setCardNumberReady] = useState(false)
  const [cardExpiryReady, setCardExpiryReady] = useState(false)
  const [cardCvcReady, setCardCvcReady] = useState(false)
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [abaMap, setAbaMap] = useState<Record<string, string> | null>(null)
  const isCard = kind === 'credit' || kind === 'debit'

  useEffect(() => {
    setHolderName(initialHolder)
  }, [initialHolder, kind])

  useEffect(() => {
    if (isCard || abaMap) return
    let cancelled = false
    // Dynamic import so the ~660KB FedACH routing map only lands in the bundle
    // when someone opens the Checking tab. Vite splits this into its own chunk.
    void import('../data/fedach-routing-to-bank.json').then((m) => {
      if (!cancelled) setAbaMap(m.default as Record<string, string>)
    })
    return () => {
      cancelled = true
    }
  }, [isCard, abaMap])

  const routingIsComplete = /^\d{9}$/.test(routingNumber)
  const detectedBankName = routingIsComplete && abaMap ? abaMap[routingNumber] : undefined

  async function handleSubmit() {
    if (!stripe) return
    setError(null)
    setSubmitting(true)

    try {
      let confirmError: { message?: string } | undefined
      let setupIntent: { id: string } | null | undefined

      if (isCard) {
        if (!elements) {
          setError('Card fields not ready.')
          setSubmitting(false)
          return
        }
        const cardNumber = elements.getElement(CardNumberElement)
        if (!cardNumber) {
          setError('Card fields not ready.')
          setSubmitting(false)
          return
        }
        const result = await stripe.confirmCardSetup(clientSecret, {
          payment_method: {
            card: cardNumber,
            billing_details: holderName ? { name: holderName } : {},
          },
        })
        confirmError = result.error
        setupIntent = result.setupIntent
      } else {
        // Manual us_bank_account path — plain routing/account/name inputs.
        // Verification is microdeposits (1-2 business days) — Stripe issues
        // them automatically because SetupIntent was created with
        // verification_method='automatic' and no FC session was performed.
        if (!routingIsComplete) {
          setError('Enter a valid 9-digit routing number.')
          setSubmitting(false)
          return
        }
        if (!/^\d{4,17}$/.test(accountNumber)) {
          setError('Enter a valid account number.')
          setSubmitting(false)
          return
        }
        if (!holderName.trim()) {
          setError('Enter the account holder name.')
          setSubmitting(false)
          return
        }
        const result = await stripe.confirmUsBankAccountSetup(clientSecret, {
          payment_method: {
            us_bank_account: {
              routing_number: routingNumber,
              account_number: accountNumber,
              account_holder_type: 'individual',
              account_type: 'checking',
            },
            billing_details: { name: holderName.trim() },
          },
        })
        confirmError = result.error
        setupIntent = result.setupIntent
      }

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
        holder: holderName || initialHolder || '',
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

  const fieldsReady = isCard
    ? cardNumberReady && cardExpiryReady && cardCvcReady
    : routingIsComplete &&
      /^\d{4,17}$/.test(accountNumber) &&
      holderName.trim().length > 0

  const submitLabel = submitLabelFor(kind)

  // Appearance-matched Element options (font + color inherit from surrounding
  // Input styles so the iframe blends with the plain <Input> next to it).
  const elementBaseStyle = {
    style: {
      base: {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: '14px',
        color: 'hsl(var(--foreground))',
        '::placeholder': { color: 'hsl(var(--muted-foreground))' },
      },
      invalid: { color: 'hsl(var(--destructive))' },
    },
  } as const

  const cardNumberOptions: StripeCardNumberElementOptions = {
    ...elementBaseStyle,
    showIcon: false,
    placeholder: '1234 5678 9012 3456',
  }
  const cardExpiryOptions: StripeCardExpiryElementOptions = {
    ...elementBaseStyle,
    placeholder: 'MM/YY',
  }
  const cardCvcOptions: StripeCardCvcElementOptions = {
    ...elementBaseStyle,
    placeholder: '123',
  }

  // Shared classNames for the <div> that wraps each Stripe Element iframe.
  // Matches shadcn Input styling so the split iframes look native to the form.
  const stripeFieldWrapper =
    'flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2'

  return (
    <div className="space-y-4">
      {isCard ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vpd-name-on-card" className="text-xs font-medium">
              Name on card
            </Label>
            <Input
              id="vpd-name-on-card"
              type="text"
              autoComplete="cc-name"
              placeholder="First Last"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vpd-card-number" className="text-xs font-medium">
              Card number
            </Label>
            <div id="vpd-card-number" className={stripeFieldWrapper}>
              <div className="w-full">
                <CardNumberElement
                  options={cardNumberOptions}
                  onReady={() => setCardNumberReady(true)}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vpd-card-expiry" className="text-xs font-medium">
                Expires
              </Label>
              <div id="vpd-card-expiry" className={stripeFieldWrapper}>
                <div className="w-full">
                  <CardExpiryElement
                    options={cardExpiryOptions}
                    onReady={() => setCardExpiryReady(true)}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vpd-card-cvc" className="text-xs font-medium">
                CVV
              </Label>
              <div id="vpd-card-cvc" className={stripeFieldWrapper}>
                <div className="w-full">
                  <CardCvcElement
                    options={cardCvcOptions}
                    onReady={() => setCardCvcReady(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vpd-account-holder" className="text-xs font-medium">
              Name on account
            </Label>
            <Input
              id="vpd-account-holder"
              type="text"
              autoComplete="name"
              placeholder="First Last"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vpd-routing-number" className="text-xs font-medium">
              Routing number
            </Label>
            <Input
              id="vpd-routing-number"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456789"
              maxLength={9}
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ''))}
            />
            {routingIsComplete && (
              <p className="text-xs text-muted-foreground">
                {detectedBankName ? (
                  <>Bank: <span className="font-medium text-foreground">{detectedBankName}</span></>
                ) : abaMap ? (
                  <>Routing number not recognized — Stripe will verify at submit.</>
                ) : (
                  <>Looking up bank...</>
                )}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vpd-account-number" className="text-xs font-medium">
              Account number
            </Label>
            <Input
              id="vpd-account-number"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Account number"
              maxLength={17}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Bank verification takes 1-2 business days via microdeposits.
          </p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {/* Button color matches Rodolfo reference screenshot 2026-07-10
          (periwinkle #8b9ec6). Sampled from the reference image pixel median.
          Applied inline via arbitrary-value utilities — promote to a
          --primary-soft design-system token later (own PR, argus review). */}
      <Button
        onClick={handleSubmit}
        disabled={!stripe || (isCard && !elements) || !fieldsReady || submitting}
        size="lg"
        className="w-full h-11 text-sm font-medium bg-[#8b9ec6] hover:bg-[#7a8fbb] text-white focus-visible:ring-[#8b9ec6]"
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
