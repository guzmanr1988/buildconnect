import { CreditCard, Building2, Calendar, DollarSign, ArrowDownToLine } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types'

// Shared transaction-detail dialog (ship #143 per kratos msg 1776746516039).
// Commission rows route to ProjectDetailDialog via the lead context (ship
// #140). Non-commission rows (membership + payout) land here — structured
// detail with mock card/destination since real Stripe PaymentMethod wiring
// is Tranche-2.

interface TransactionDetailDialogProps {
  open: boolean
  onClose: () => void
  transaction: Transaction | null
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Display-layer branded transaction ID per kratos msg 1776747090796.
// Internal tx.id (Supabase UUID / mock tx-N) stays untouched for routing +
// dedupe. UI shows BC<type-letter><4-digit> derived from the same hash used
// by the mock-payment-method/destination so the branded ID is stable per
// transaction. Format: BCC0001 (commission) / BCM0001 (membership) /
// BCP0001 (payout).
export function formatTransactionId(txId: string, txType: 'commission' | 'membership' | 'payout'): string {
  const letter = txType === 'commission' ? 'C' : txType === 'membership' ? 'M' : 'P'
  let hash = 0
  for (let i = 0; i < txId.length; i++) hash = ((hash << 5) - hash) + txId.charCodeAt(i) | 0
  const seq = String(Math.abs(hash) % 10000).padStart(4, '0')
  return `BC${letter}${seq}`
}

// Deterministic mock payment-method derivation from tx.id — gives Rodolfo
// something stable and realistic-looking to demo until Stripe wiring lands.
// Hash → last4 digits; cycles through 3 card brands.
function mockPaymentMethod(txId: string) {
  let hash = 0
  for (let i = 0; i < txId.length; i++) hash = ((hash << 5) - hash) + txId.charCodeAt(i) | 0
  const abs = Math.abs(hash)
  const last4 = String(abs % 10000).padStart(4, '0')
  const brands = ['Visa', 'Mastercard', 'Amex'] as const
  const brand = brands[abs % brands.length]
  return { brand, last4 }
}

// Deterministic mock destination-account for payouts (bank-name + last4).
function mockDestination(txId: string) {
  let hash = 0
  for (let i = 0; i < txId.length; i++) hash = ((hash << 5) - hash) + txId.charCodeAt(i) | 0
  const abs = Math.abs(hash)
  const last4 = String((abs >> 4) % 10000).padStart(4, '0')
  const banks = ['Chase', 'Bank of America', 'Wells Fargo'] as const
  const bankName = banks[abs % banks.length]
  return { bankName, last4 }
}

// Subscription period heuristic for membership: first-of-month of tx.date → last-of-month.
function subscriptionPeriod(isoDate: string) {
  const d = new Date(isoDate)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const fmtShort = (dd: Date) => dd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmtShort(start)} – ${fmtShort(end)}`
}

const STATUS_COLOR: Record<Transaction['status'], string> = {
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  closed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

export function TransactionDetailDialog({ open, onClose, transaction }: TransactionDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        {transaction && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-2">
                {transaction.type === 'membership' ? (
                  <CreditCard className="h-4 w-4 text-blue-600" />
                ) : transaction.type === 'payout' ? (
                  <ArrowDownToLine className="h-4 w-4 text-amber-600" />
                ) : (
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                )}
                {transaction.type === 'membership' ? 'Membership' : transaction.type === 'payout' ? 'Payout' : 'Commission'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {/* Summary card */}
              <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction ID</span>
                  <span className="font-mono text-xs font-semibold">{formatTransactionId(transaction.id, transaction.type)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold">{fmt(transaction.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{fmtDate(transaction.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                      STATUS_COLOR[transaction.status],
                    )}
                  >
                    {transaction.status}
                  </span>
                </div>
              </div>

              {/* Linked vendor */}
              <div className="rounded-xl border p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Linked Vendor</h4>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{transaction.company}</span>
                </div>
                {transaction.detail && (
                  <p className="text-xs text-muted-foreground">{transaction.detail}</p>
                )}
              </div>

              {/* Membership: period + mock card */}
              {transaction.type === 'membership' && (() => {
                const pm = mockPaymentMethod(transaction.id)
                return (
                  <>
                    <div className="rounded-xl border p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subscription Period</h4>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{subscriptionPeriod(transaction.date)}</span>
                      </div>
                    </div>
                    <div className="rounded-xl border p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Method</h4>
                      <div className="flex items-center gap-2 text-sm">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{pm.brand} **** {pm.last4}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">Mock</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Real Stripe PaymentMethod wiring lands in Tranche-2.</p>
                    </div>
                    <div className="rounded-xl border p-4 space-y-1.5">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bank Statement Descriptor</h4>
                      <p className="font-mono text-sm font-semibold">ORIG CO NAME: BUILDC</p>
                      <p className="text-[11px] text-muted-foreground">This is what the vendor sees on their bank/card statement.</p>
                    </div>
                  </>
                )
              })()}

              {/* Payout: mock destination bank */}
              {transaction.type === 'payout' && (() => {
                const dest = mockDestination(transaction.id)
                return (
                  <>
                    <div className="rounded-xl border p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Destination Account</h4>
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{dest.bankName} **** {dest.last4}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">Mock</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Real ACH destination wiring lands in Tranche-2.</p>
                    </div>
                    <div className="rounded-xl border p-4 space-y-1.5">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bank Statement Descriptor</h4>
                      <p className="font-mono text-sm font-semibold">ORIG CO NAME: BUILDC</p>
                      <p className="text-[11px] text-muted-foreground">This is what the vendor sees on their bank statement when payouts arrive.</p>
                    </div>
                  </>
                )
              })()}
            </div>
            <Button variant="outline" className="w-full mt-2" onClick={onClose}>
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
