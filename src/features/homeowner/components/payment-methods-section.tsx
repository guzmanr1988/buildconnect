// Payment Methods (pay-in) section for the homeowner profile page.
//
// D1 of the kratos msg 1782449152661 sequence (D2 → D1 → D3). FE wires
// hephaestus's four payment-method-* edge fns; contract-locked at kratos
// msg 1782450542327 with the EXACT shapes below (BE owner: hephaestus):
//
//   payment-method-setup-intent-create
//     body: { kind: 'card' | 'us_bank_account', purpose: 'service_pay_in' }
//     → { client_secret, customer_id, setup_intent_id }
//     kind is Stripe-native — server validates the literal, no UI mapping.
//
//   payment-method-list { purpose: 'service_pay_in' }
//     → { ok: true, payment_methods: PaymentMethodListItem[] }
//     Row shape: { id, kind, brand, last4, exp_month, exp_year, bank_name,
//                  routing_last4, purpose, status, is_default, created_at }.
//     Discriminated by kind: card rows have brand/last4/exp_*, bank rows have
//     bank_name/last4 (account)/routing_last4 — the other side is null.
//     is_default is computed at READ-TIME from Stripe customer.invoice_settings
//     .default_payment_method — there is NO is_default DB column. FE treats
//     is_default as server-truth.
//
//   payment-method-set-default { payment_method_id } → { ok }
//     Server atomic via Stripe customer.invoice_settings.default_payment_method
//     (single-field, single-default invariant enforced server-side). FE does
//     NOT optimistically toggle other rows — just call + re-fetch list.
//
//   payment-method-detach { payment_method_id } → { ok }
//
// Add-flow: mount Stripe Elements on the SetupIntent client_secret →
// stripe.confirmSetup({ return_url }). The payment_methods row lands via
// the setup_intent.succeeded webhook (server-side source of truth), NOT
// client-side, so abandoned saves leave no orphan row. Return URL points
// back at the profile with ?pm=added so we can show a success toast and
// invalidate the list query.
//
// Lives in the slot above where the homeowner Connect/Payouts square used
// to be (file_747 reconcile, D2 removed the Connect callsite).

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CreditCard,
  Landmark,
  Loader2,
  AlertCircle,
  Plus,
  CheckCircle2,
  Star,
  Trash2,
} from 'lucide-react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getStripe } from '@/lib/stripe-client'
import { useAuthStore } from '@/stores/auth-store'

// service_pay_in is the new homeowner pay-in purpose for Concierge rep-
// requests + future service charges. Distinct from vendor purposes
// ('both'|'membership'|'commissions') so the list query and SetupIntent
// scope cleanly to the homeowner flow.
const PAY_IN_PURPOSE = 'service_pay_in' as const

const QUERY_KEY = ['payment_methods', PAY_IN_PURPOSE] as const

const stripePromise = getStripe()

export interface PaymentMethodListItem {
  id: string
  kind: 'card' | 'us_bank_account'
  brand: string | null
  last4: string
  exp_month: number | null
  exp_year: number | null
  bank_name: string | null
  routing_last4: string | null
  purpose: 'service_pay_in' | string
  status: 'active' | 'pending_verification' | string
  is_default: boolean
  created_at: string
}

interface ListResponseShape {
  ok: boolean
  payment_methods: PaymentMethodListItem[]
  error?: string
}

// Locked to the canonical hephaestus shape per kratos msg 1782450542327:
// { ok: true, payment_methods: [...] }. The parallel-build tolerant hedge
// (bare-array OR { ok, methods }) collapsed here per feedback memory
// "tolerant parsers for internal FE/BE contract drift are parallel-build
// interim only — collapse on contract-lock."
function parseListResponse(
  data: unknown,
): { ok: true; methods: PaymentMethodListItem[] } | { ok: false; error: string } {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'payment-method-list returned a non-object response.' }
  }
  const obj = data as ListResponseShape
  if (obj.ok === false) {
    return { ok: false, error: obj.error || 'payment-method-list returned ok:false.' }
  }
  if (!Array.isArray(obj.payment_methods)) {
    return { ok: false, error: 'payment-method-list response missing payment_methods array.' }
  }
  return { ok: true, methods: obj.payment_methods }
}

function brandLabel(item: PaymentMethodListItem): string {
  if (item.kind === 'us_bank_account') {
    return item.bank_name || 'Bank account'
  }
  // Card brands: visa, mastercard, amex, discover, etc. Stripe returns lowercase.
  const brand = item.brand
  if (!brand) return 'Card'
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

// Card exp comes back as two nullable numerics on the canonical row shape
// (exp_month + exp_year). Format as MM/YY for the row label. Bank rows
// have both fields null per the kind discriminator and skip the label.
function formatCardExpiry(month: number | null, year: number | null): string | null {
  if (!month || !year) return null
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

function MethodIcon({ kind }: { kind: PaymentMethodListItem['kind'] }) {
  if (kind === 'us_bank_account') {
    return <Landmark className="h-4 w-4 text-muted-foreground" />
  }
  return <CreditCard className="h-4 w-4 text-muted-foreground" />
}

export function PaymentMethodsSection() {
  const sessionToken = useAuthStore((s) => s.session?.access_token ?? null)
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!sessionToken,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<unknown>('payment-method-list', {
        body: { purpose: PAY_IN_PURPOSE },
      })
      if (error) throw new Error(error.message)
      const parsed = parseListResponse(data)
      if (!parsed.ok) throw new Error(parsed.error)
      return parsed.methods
    },
  })

  // Handle the post-confirmSetup redirect: the return_url is /home/profile
  // ?pm=added. Stripe also appends setup_intent + redirect_status query
  // params. We invalidate the list query (the webhook is the canonical
  // source-of-truth — list refetch picks up the new row when the row lands)
  // + show a success toast + strip the query params so a manual refresh
  // doesn't re-trigger.
  useEffect(() => {
    if (searchParams.get('pm') !== 'added') return
    const status = searchParams.get('redirect_status')
    if (status === 'succeeded' || status === null) {
      toast.success('Payment method saved.')
    } else if (status === 'processing') {
      toast.info('Verifying your payment method…')
    } else if (status === 'requires_payment_method') {
      toast.error('Payment method could not be saved. Please try again.')
    }
    void qc.invalidateQueries({ queryKey: QUERY_KEY })
    const next = new URLSearchParams(searchParams)
    next.delete('pm')
    next.delete('setup_intent')
    next.delete('setup_intent_client_secret')
    next.delete('redirect_status')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, qc])

  const setDefaultMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>(
        'payment-method-set-default',
        { body: { payment_method_id: paymentMethodId } },
      )
      if (error) throw new Error(error.message)
      if (data && data.ok === false) throw new Error(data.error || 'Failed to set default.')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Default payment method updated.')
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Could not set default.')
    },
  })

  const detachMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>(
        'payment-method-detach',
        { body: { payment_method_id: paymentMethodId } },
      )
      if (error) throw new Error(error.message)
      if (data && data.ok === false) throw new Error(data.error || 'Failed to remove method.')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Payment method removed.')
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Could not remove payment method.')
    },
  })

  const methods = data ?? []
  const pendingId =
    setDefaultMutation.isPending ? setDefaultMutation.variables :
    detachMutation.isPending ? detachMutation.variables :
    null

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <Card className="mb-6" data-testid="payment-methods-section">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2.5">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-heading">Payment Methods</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">
              Saved cards and bank accounts you can use to pay for services.
              You can add more, pick a default, or remove any at any time.
            </p>

            {isLoading && (
              <div
                data-testid="payment-methods-loading"
                className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your saved methods…
              </div>
            )}

            {error && (
              <div
                role="alert"
                data-testid="payment-methods-error"
                className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error instanceof Error ? error.message : String(error)}</span>
              </div>
            )}

            {!isLoading && !error && methods.length === 0 && (
              <div
                data-testid="payment-methods-empty"
                className="mt-4 rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center"
              >
                <p className="text-sm font-medium text-foreground">No payment methods yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a card or bank account to pay for services in one tap.
                </p>
              </div>
            )}

            {!isLoading && !error && methods.length > 0 && (
              <ul className="mt-4 space-y-2" data-testid="payment-methods-list">
                {methods.map((m) => {
                  const isPending = pendingId === m.id
                  return (
                    <li
                      key={m.id}
                      data-testid="payment-method-row"
                      data-payment-method-id={m.id}
                      data-payment-method-default={m.is_default ? 'true' : 'false'}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-lg border bg-card/50 p-3',
                        m.is_default && 'border-emerald-500/40 bg-emerald-500/5',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <MethodIcon kind={m.kind} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {brandLabel(m)} •••• {m.last4}
                            {m.kind === 'card' && formatCardExpiry(m.exp_month, m.exp_year) && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                exp {formatCardExpiry(m.exp_month, m.exp_year)}
                              </span>
                            )}
                          </p>
                          {m.kind === 'us_bank_account' && m.routing_last4 && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Routing •••• {m.routing_last4}
                            </p>
                          )}
                          {m.is_default && (
                            <p className="mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Default
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!m.is_default && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={isPending}
                            onClick={() => setDefaultMutation.mutate(m.id)}
                            data-testid="payment-method-set-default"
                          >
                            <Star className="h-3.5 w-3.5 mr-1" />
                            Set default
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={isPending}
                          onClick={() => detachMutation.mutate(m.id)}
                          aria-label="Remove payment method"
                          data-testid="payment-method-detach"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={() => setAddDialogOpen(true)}
              data-testid="payment-methods-add-cta"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add card or bank
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      <AddPaymentMethodDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </>
  )
}

interface AddPaymentMethodDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type UIKind = 'card' | 'checking'
type StripeKind = 'card' | 'us_bank_account'

function stripeKindFor(uiKind: UIKind): StripeKind {
  return uiKind === 'checking' ? 'us_bank_account' : 'card'
}

function AddPaymentMethodDialog({ open, onOpenChange }: AddPaymentMethodDialogProps) {
  const sessionToken = useAuthStore((s) => s.session?.access_token ?? null)
  const [kind, setKind] = useState<UIKind>('card')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null)
  const [intentLoading, setIntentLoading] = useState(false)
  const [intentError, setIntentError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setClientSecret(null)
      setSetupIntentId(null)
      setIntentError(null)
      setKind('card')
    }
  }, [open])

  // SetupIntent fetch. Re-fires on kind change so a card-vs-bank tab flip
  // gets the right payment_method_types on the intent (Stripe scopes the
  // PaymentElement's render to whatever types were requested at create).
  useEffect(() => {
    if (!open) return
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
          client_secret?: string
          customer_id?: string
          setup_intent_id?: string
          ok?: boolean
          error?: string
        }>('payment-method-setup-intent-create', {
          body: { kind: stripeKindFor(kind), purpose: PAY_IN_PURPOSE },
        })
        if (cancelled) return
        if (error) {
          setIntentError(error.message)
        } else if (!data?.client_secret || !data.setup_intent_id) {
          setIntentError(data?.error || 'Failed to initialize secure payment form.')
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
  }, [open, kind, sessionToken])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Add a payment method</DialogTitle>
          <DialogDescription>
            Save a card or bank account to pay for services. Details go
            directly to our secure payments partner — BuildConnect never
            sees or stores the raw numbers.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={kind} onValueChange={(v) => setKind(v as UIKind)} className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="card" className="text-xs gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Card
            </TabsTrigger>
            <TabsTrigger value="checking" className="text-xs gap-1.5">
              <Landmark className="h-3.5 w-3.5" />
              Bank
            </TabsTrigger>
          </TabsList>

          <TabsContent value="card" className="mt-4">
            <SetupForm
              kind="card"
              intentLoading={intentLoading}
              intentError={intentError}
              elementsOptions={elementsOptions}
              setupIntentId={setupIntentId}
            />
          </TabsContent>
          <TabsContent value="checking" className="mt-4">
            <SetupForm
              kind="checking"
              intentLoading={intentLoading}
              intentError={intentError}
              elementsOptions={elementsOptions}
              setupIntentId={setupIntentId}
            />
          </TabsContent>
        </Tabs>

        <p className="pt-2 text-[11px] text-center text-muted-foreground leading-relaxed">
          Card and bank details are entered directly into our secure payments
          partner. BuildConnect never sees or stores the raw numbers.
        </p>
      </DialogContent>
    </Dialog>
  )
}

interface SetupFormProps {
  kind: UIKind
  intentLoading: boolean
  intentError: string | null
  elementsOptions: StripeElementsOptions | null
  setupIntentId: string | null
}

function SetupForm({
  kind,
  intentLoading,
  intentError,
  elementsOptions,
  setupIntentId,
}: SetupFormProps) {
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
            <p className="text-sm">Preparing secure payment form…</p>
          </>
        )}
      </div>
    )
  }

  return (
    <Elements key={setupIntentId} stripe={stripePromise} options={elementsOptions}>
      <SetupFormInner kind={kind} />
    </Elements>
  )
}

function SetupFormInner({ kind }: { kind: UIKind }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentElementReady, setPaymentElementReady] = useState(false)

  async function handleSubmit() {
    if (!stripe || !elements) return
    setError(null)
    setSubmitting(true)

    // return_url brings the user back to the profile with ?pm=added so the
    // section's useEffect can invalidate the list query + show a success
    // toast. Stripe will only redirect when 3DS / bank-auth requires it
    // (redirect:'if_required'); for inline card-saves the promise resolves
    // here and we route success the same way via toast + invalidate.
    const returnUrl = `${window.location.origin}/home/profile?pm=added`

    try {
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      })

      if (confirmError) {
        setError(confirmError.message || 'Could not save payment method.')
        setSubmitting(false)
        return
      }
      if (!setupIntent) {
        setError('Stripe did not return a SetupIntent.')
        setSubmitting(false)
        return
      }

      // Inline-success branch (no redirect needed). The webhook will write
      // the row server-side; nudge the user back to the profile so the
      // section refetches. We piggy-back on the same ?pm=added query the
      // redirect path uses so the success handler is single-source.
      if (setupIntent.status === 'succeeded' || setupIntent.status === 'processing') {
        window.location.assign(returnUrl)
        return
      }

      setError(`Unexpected SetupIntent status: ${setupIntent.status}`)
      setSubmitting(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  const submitLabel = kind === 'checking' ? 'Save bank account' : 'Save card'

  return (
    <div className="space-y-4">
      <PaymentElement onReady={() => setPaymentElementReady(true)} />
      {error && (
        <div
          role="alert"
          data-testid="add-payment-method-error"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <Button
        onClick={handleSubmit}
        disabled={!stripe || !elements || !paymentElementReady || submitting}
        size="lg"
        className="w-full h-11 text-sm font-medium"
        data-testid="add-payment-method-submit"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
      </Button>
    </div>
  )
}
