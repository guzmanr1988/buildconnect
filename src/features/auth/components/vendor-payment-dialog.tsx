import { useEffect, useState } from 'react'
import { CheckCircle2, CreditCard, Landmark, Wallet } from 'lucide-react'
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
  PAYMENT_METHOD_LABELS,
  type VendorPaymentMethod,
  type VendorPaymentMethodKind,
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
  onSuccess: (method: VendorPaymentMethod) => void
  // When true, dialog is in post-signup gating mode — pressing overlay
  // / Escape does nothing since the user MUST pick a method to enter the
  // portal. Edit-mode (ship #180) will flip this false.
  blocking?: boolean
  // Optional initial method — edit-mode pre-fills the last-used kind +
  // holder name (other fields require re-entry for security).
  initialKind?: VendorPaymentMethodKind
  initialHolder?: string
}

type UIState = 'entering' | 'submitting' | 'success'

export function VendorPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  blocking = true,
  initialKind = 'credit_card',
  initialHolder = '',
}: VendorPaymentDialogProps) {
  const [kind, setKind] = useState<VendorPaymentMethodKind>(initialKind)
  const [uiState, setUIState] = useState<UIState>('entering')

  // Credit / debit fields
  const [holder, setHolder] = useState(initialHolder)
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  // Checking fields
  const [bankName, setBankName] = useState('')
  const [routing, setRouting] = useState('')
  const [account, setAccount] = useState('')

  // Reset state when dialog opens fresh.
  useEffect(() => {
    if (open) {
      setKind(initialKind)
      setUIState('entering')
      setHolder(initialHolder)
      setCardNumber('')
      setExpiry('')
      setCvv('')
      setBankName('')
      setRouting('')
      setAccount('')
    }
  }, [open, initialKind, initialHolder])

  // Validate + return the normalized method object. Null = form not
  // ready to submit. Very permissive validation since mock — just enough
  // to catch empty fields.
  function buildMethod(): VendorPaymentMethod | null {
    if (kind === 'credit_card' || kind === 'debit_card') {
      if (!holder.trim() || !cardNumber.trim() || !expiry.trim() || !cvv.trim()) return null
      const digits = cardNumber.replace(/\D/g, '')
      if (digits.length < 12) return null
      return {
        kind,
        last4: digits.slice(-4),
        holder: holder.trim(),
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
    setUIState('submitting')
    // Mock: pretend a short processing delay so the UI has weight. Real
    // integration would replace this with the processor's confirm call.
    setTimeout(() => {
      setUIState('success')
      // Parent onSuccess fires after the success state shows. Auto-close
      // follows SUCCESS_DISPLAY_MS later so the user sees the green check.
      setTimeout(() => {
        onSuccess(method)
        onOpenChange(false)
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

            <Tabs value={kind} onValueChange={(v) => setKind(v as VendorPaymentMethodKind)} className="mt-2">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="credit_card" className="text-xs gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  Credit Card
                </TabsTrigger>
                <TabsTrigger value="debit_card" className="text-xs gap-1.5">
                  <Wallet className="h-3.5 w-3.5" />
                  Debit Card
                </TabsTrigger>
                <TabsTrigger value="checking" className="text-xs gap-1.5">
                  <Landmark className="h-3.5 w-3.5" />
                  Checking
                </TabsTrigger>
              </TabsList>

              {/* Credit + debit share the same form shape. */}
              {(['credit_card', 'debit_card'] as const).map((k) => (
                <TabsContent key={k} value={k} className="space-y-3 mt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="vpd-holder" className="text-xs font-semibold">Name on card</Label>
                    <Input
                      id="vpd-holder"
                      autoComplete="cc-name"
                      value={holder}
                      onChange={(e) => setHolder(e.target.value)}
                      placeholder="First Last"
                      className="h-10 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vpd-card" className="text-xs font-semibold">Card number</Label>
                    <Input
                      id="vpd-card"
                      autoComplete="cc-number"
                      inputMode="numeric"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="1234 5678 9012 3456"
                      className="h-10 text-sm font-mono tracking-wide"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="vpd-expiry" className="text-xs font-semibold">Expires</Label>
                      <Input
                        id="vpd-expiry"
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
              ))}

              <TabsContent value="checking" className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="vpd-holder-ck" className="text-xs font-semibold">Account holder name</Label>
                  <Input
                    id="vpd-holder-ck"
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
                  <>Submit {PAYMENT_METHOD_LABELS[kind]}</>
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
