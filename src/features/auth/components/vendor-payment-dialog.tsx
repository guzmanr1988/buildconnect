import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { CheckCircle2, CreditCard, Landmark } from 'lucide-react'
import { motion } from 'framer-motion'
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
import {
  detectCardBrand,
  PAYMENT_PURPOSE_LABELS,
  type VendorPaymentMethod,
  type VendorPaymentMethodKind,
  type VendorPaymentPurpose,
} from '@/stores/vendor-billing-store'

/*
 * Ship #179 (Rodolfo-direct 2026-04-21) — post-signup payment method
 * picker for vendor accounts. Three tabs: credit card / debit card /
 * checking. Each tab has its own field set. Submit normalizes the entry
 * into a VendorPaymentMethod shape (only last4 + holder retained — never
 * the full PAN / account number, even in mock).
 *
 * Mock-always-success per the keep-mocks-as-test-harness directive:
 * submit → brief green success screen → `onSuccess(method)` fires →
 * parent handles the redirect. The dialog cannot be dismissed via the
 * overlay / Escape during the success state so the success → redirect
 * handoff is atomic.
 */

const SUCCESS_DISPLAY_MS = 1500

export interface VendorPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Ship #189 — caller decides add-vs-update-vs-signup by binding the
  // appropriate store action to onSuccess. Dialog itself just produces
  // a normalized method object without an id; store assigns id on add,
  // preserves id on update.
  onSuccess: (method: Omit<VendorPaymentMethod, 'id'>) => void
  // When true, dialog is in post-signup gating mode — pressing overlay
  // / Escape does nothing since the user MUST pick a method to enter the
  // portal. Edit-mode (ship #180+) flips this false.
  blocking?: boolean
  // Optional initial method — edit-mode pre-fills the last-used kind +
  // holder name (other fields require re-entry for security).
  initialKind?: VendorPaymentMethodKind
  initialHolder?: string
  // Ship #189 — pre-fill the purpose selector when editing an existing
  // method. Add mode defaults to 'both' per the safest-first-time
  // heuristic.
  initialPurpose?: VendorPaymentPurpose
}

type UIState = 'entering' | 'submitting' | 'success'

// Type alias for the UI-visible kind after #185 merges credit+debit.
// Writes only ever produce these two; legacy persisted values still
// read via the back-compat aliases in PAYMENT_METHOD_LABELS.
type UIKind = 'card' | 'checking'

function normalizeInitialKind(kind: VendorPaymentMethodKind): UIKind {
  if (kind === 'checking') return 'checking'
  return 'card' // 'card', 'credit_card', 'debit_card' all land here
}

export function VendorPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  blocking = true,
  initialKind = 'card',
  initialHolder = '',
  initialPurpose = 'both',
}: VendorPaymentDialogProps) {
  const [kind, setKind] = useState<UIKind>(normalizeInitialKind(initialKind))
  const [purpose, setPurpose] = useState<VendorPaymentPurpose>(initialPurpose)
  const [uiState, setUIState] = useState<UIState>('entering')

  // Card fields
  const [firstName, setFirstName] = useState(() => initialHolder.split(' ')[0] ?? '')
  const [lastName, setLastName] = useState(() => initialHolder.split(' ').slice(1).join(' '))
  const [cardSlots, setCardSlots] = useState<[string, string, string, string]>(['', '', '', ''])
  const slotRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  // Ship #275 — defensive: guard setUIState with mountedRef so
  // unmount mid-setTimeout doesn't trigger setState-on-unmounted-
  // component warnings. CRITICAL: do NOT clear pending timers on
  // unmount — parent callbacks (onSuccess + onOpenChange) MUST fire
  // even if dialog unmounted, since parent owns the post-success
  // state machine (setPaymentDialogOpen / navigate / activateMembership).
  // Stranding the parent on dialog-unmount is the failure mode this
  // ship is fixing.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  // Checking fields
  const [holder, setHolder] = useState(initialHolder)
  const [bankName, setBankName] = useState('')
  const [routing, setRouting] = useState('')
  const [account, setAccount] = useState('')

  // Reset state when dialog opens fresh.
  useEffect(() => {
    if (open) {
      setKind(normalizeInitialKind(initialKind))
      setPurpose(initialPurpose)
      setUIState('entering')
      setFirstName(initialHolder.split(' ')[0] ?? '')
      setLastName(initialHolder.split(' ').slice(1).join(' '))
      setCardSlots(['', '', '', ''])
      setExpiry('')
      setCvv('')
      setHolder(initialHolder)
      setBankName('')
      setRouting('')
      setAccount('')
    }
  }, [open, initialKind, initialHolder, initialPurpose])

  const handleSlotChange = useCallback((idx: number, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4)
    setCardSlots((prev) => {
      const next = [...prev] as [string, string, string, string]
      next[idx] = digits
      return next
    })
    if (digits.length === 4 && idx < 3) {
      slotRefs[idx + 1].current?.focus()
    }
  }, [])

  const handleSlotKeyDown = useCallback((idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && cardSlots[idx] === '' && idx > 0) {
      slotRefs[idx - 1].current?.focus()
    }
  }, [cardSlots])

  // Ship #185 — live card-brand detection. Recomputed on every
  // cardNumber keystroke. Memoized so the render-time brand chip
  // doesn't re-run the regex unnecessarily on unrelated re-renders.
  const cardNumber = cardSlots.join('')
  const detectedBrand = useMemo(() => detectCardBrand(cardNumber), [cardNumber])

  // Validate + return the normalized method object. Null = form not
  // ready to submit. Very permissive validation since mock — just enough
  // to catch empty fields. Ship #189: purpose snapshots from the
  // segmented toggle; caller decides whether to add or update.
  function buildMethod(): Omit<VendorPaymentMethod, 'id'> | null {
    if (kind === 'card') {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
      if (!fullName || !cardNumber || !expiry.trim() || !cvv.trim()) return null
      const digits = cardNumber.replace(/\D/g, '')
      if (digits.length < 12) return null
      return {
        purpose,
        kind: 'card',
        last4: digits.slice(-4),
        holder: fullName,
        // Snapshot brand at submit time; falls through to undefined if
        // the number didn't match any known IIN prefix. Membership
        // display treats absent brand as plain "Card" label.
        brand: detectedBrand ?? undefined,
        expiry: expiry.trim(),
        addedAt: new Date().toISOString(),
      }
    }
    // checking
    if (!holder.trim() || !bankName.trim() || !routing.trim() || !account.trim()) return null
    const routingDigits = routing.replace(/\D/g, '')
    const accountDigits = account.replace(/\D/g, '')
    if (routingDigits.length < 8 || accountDigits.length < 4) return null
    return {
      purpose,
      kind: 'checking',
      last4: accountDigits.slice(-4),
      holder: holder.trim(),
      bankName: bankName.trim(),
      routingLast4: routingDigits.slice(-4),
      addedAt: new Date().toISOString(),
    }
  }

  const canSubmit = buildMethod() !== null && uiState === 'entering'

  function handleSubmit() {
    const method = buildMethod()
    if (!method) return
    // Ship #274 — VITE_DEMO_MODE-gated diagnostic telemetry on the
    // payment-success → vendor-redirect chain. Static trace exhausted
    // on Rodolfo's "stuck in loading" report; need real-trace data
    // to narrow stall location. Drop these logs once the regression
    // closes (post-cause identified).
    const isDemoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
    const diagLog = (phase: string, extra: Record<string, unknown> = {}) => {
      if (!isDemoMode) return
      // eslint-disable-next-line no-console
      console.log('[#274 payment-stuck-diag]', phase, { t: Date.now(), ...extra })
    }
    diagLog('handleSubmit:start', {
      kind: method.kind,
      last4: method.last4,
      uiState_before: 'entering',
    })
    setUIState('submitting')
    diagLog('handleSubmit:setUIState(submitting)')
    // Mock: pretend a short processing delay so the UI has weight. Real
    // integration would replace this with the processor's confirm call.
    setTimeout(() => {
      diagLog('handleSubmit:inner-timeout-fired (post-600ms)', { mounted: mountedRef.current })
      // Guard setUIState with mountedRef (avoid setState-on-unmounted
      // warning), but ALWAYS schedule the outer timeout — parent
      // callbacks need to fire regardless of dialog mount state so the
      // post-success state machine (setPaymentDialogOpen, navigate,
      // activateMembership) completes. Stranding the parent on
      // dialog-unmount is the failure mode this ship is fixing.
      if (mountedRef.current) {
        setUIState('success')
        diagLog('handleSubmit:setUIState(success)')
      } else {
        diagLog('handleSubmit:skipping-setUIState (unmounted) — parent callbacks still fire')
      }
      setTimeout(() => {
        diagLog('handleSubmit:outer-timeout-fired (post-2100ms)', { mounted: mountedRef.current })
        onSuccess(method)
        diagLog('handleSubmit:onSuccess-returned')
        onOpenChange(false)
        diagLog('handleSubmit:onOpenChange(false)-called')
      }, SUCCESS_DISPLAY_MS)
    }, 600)
  }

  // Block overlay/Escape dismiss while blocking + not in success state.
  function handleOpenChange(next: boolean) {
    if (!next && blocking && uiState !== 'success') return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {/* Dismiss-blocking handled via handleOpenChange above — Base UI
            Dialog routes overlay-click + Escape through onOpenChange,
            so the guard there is sufficient. */}
        {uiState === 'success' ? (
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
                Payment Successful
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

            {/* Ship #189 — purpose segmented toggle. Sits above the kind
                tabs because 'what is this method for' is the decision
                that frames 'what kind of method am I adding'. 3-way
                segmented group (Membership / Commissions / Both); 'Both'
                is the default for first-time setup. */}
            <div
              role="radiogroup"
              aria-label="Payment method purpose"
              className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
            >
              {(['both', 'membership', 'commissions'] as const).map((p) => {
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

            <Tabs value={kind} onValueChange={(v) => setKind(v as UIKind)} className="mt-2">
              {/* Ship #185 — merged Credit Card + Debit Card into single
                  'Card' tab per Rodolfo: "debit/credit merge them". The
                  user-visible differentiator is the brand chip on the
                  card-number input, not the credit-vs-debit toggle. */}
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

              <TabsContent value="card" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="vpd-first-name" className="text-xs font-semibold">First name</Label>
                    <Input
                      id="vpd-first-name"
                      data-payment-field="first-name"
                      autoComplete="cc-given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First"
                      className="h-10 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vpd-last-name" className="text-xs font-semibold">Last name</Label>
                    <Input
                      id="vpd-last-name"
                      data-payment-field="last-name"
                      autoComplete="cc-family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last"
                      className="h-10 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Card number</Label>
                    {detectedBrand && (
                      <motion.span
                        key={detectedBrand}
                        data-payment-brand={detectedBrand}
                        initial={{ opacity: 0, x: 4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary"
                      >
                        {detectedBrand}
                      </motion.span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2" data-payment-field="card-number">
                    {([0, 1, 2, 3] as const).map((idx) => (
                      <Input
                        key={idx}
                        ref={slotRefs[idx]}
                        id={idx === 0 ? 'vpd-card' : undefined}
                        data-payment-slot={idx}
                        autoComplete={idx === 0 ? 'cc-number' : 'off'}
                        inputMode="numeric"
                        value={cardSlots[idx]}
                        onChange={(e) => handleSlotChange(idx, e.target.value)}
                        onKeyDown={(e) => handleSlotKeyDown(idx, e)}
                        placeholder="••••"
                        maxLength={4}
                        className="h-10 text-sm font-mono tracking-widest text-center"
                      />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="vpd-expiry" className="text-xs font-semibold">Expires</Label>
                    <Input
                      id="vpd-expiry"
                      data-payment-field="expiry"
                      autoComplete="cc-exp"
                      inputMode="numeric"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      placeholder="MM/YY"
                      className="h-10 text-sm font-mono tracking-wide"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vpd-cvv" className="text-xs font-semibold">CVV</Label>
                    <Input
                      id="vpd-cvv"
                      data-payment-field="cvv"
                      autoComplete="cc-csc"
                      inputMode="numeric"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      placeholder="123"
                      className="h-10 text-sm font-mono tracking-wide"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="checking" className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="vpd-holder-ck" className="text-xs font-semibold">Account holder name</Label>
                  <Input
                    id="vpd-holder-ck"
                    data-payment-field="holder"
                    value={holder}
                    onChange={(e) => setHolder(e.target.value)}
                    placeholder="First Last"
                    className="h-10 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vpd-bank" className="text-xs font-semibold">Bank name</Label>
                  <Input
                    id="vpd-bank"
                    data-payment-field="bank-name"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Chase, Bank of America"
                    className="h-10 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="vpd-routing" className="text-xs font-semibold">Routing number</Label>
                    <Input
                      id="vpd-routing"
                      data-payment-field="routing"
                      inputMode="numeric"
                      value={routing}
                      onChange={(e) => setRouting(e.target.value)}
                      placeholder="9 digits"
                      className="h-10 text-sm font-mono tracking-wide"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vpd-account" className="text-xs font-semibold">Account number</Label>
                    <Input
                      id="vpd-account"
                      data-payment-field="account"
                      inputMode="numeric"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      placeholder="••••••••"
                      className="h-10 text-sm font-mono tracking-wide"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="pt-2 space-y-3">
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                size="lg"
                className={cn('w-full h-11 text-sm font-medium')}
              >
                {uiState === 'submitting' ? (
                  <motion.div
                    className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                ) : (
                  // Ship #185 — unified "Submit Payment" copy across
                  // both remaining tabs per Rodolfo's "submit payment
                  // for all 3 options" directive (three-tabs-collapsed-
                  // to-two still gets the unified verb).
                  'Submit Payment'
                )}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
                Payment info is stored securely and used for your membership and
                commission payouts. Update anytime from your vendor portal.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
