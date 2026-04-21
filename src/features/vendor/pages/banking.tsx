import { useState, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  DollarSign, Wallet, Building2, AlertTriangle, CreditCard,
  CheckCircle2, Clock, Landmark, ArrowUpRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { KpiCard } from '@/components/shared/kpi-card'
import { PageHeader } from '@/components/shared/page-header'
import { MOCK_CLOSED_SALES, MOCK_VENDORS } from '@/lib/mock-data'
import type { ClosedSale } from '@/types'
import { useAuthStore } from '@/stores/auth-store'
import {
  useVendorBillingStore,
  PAYMENT_METHOD_LABELS,
} from '@/stores/vendor-billing-store'
import { VendorPaymentDialog } from '@/features/auth/components/vendor-payment-dialog'
import { cn } from '@/lib/utils'

const VENDOR_ID = 'v-1'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function VendorBanking() {
  const vendor = MOCK_VENDORS.find((v) => v.id === VENDOR_ID)!
  const commPct = vendor.commission_pct
  const vendorPct = 100 - commPct
  const sales = useMemo(() => MOCK_CLOSED_SALES.filter((s) => s.vendor_id === VENDOR_ID), [])

  // Ship #188 (Rodolfo-direct 2026-04-21 pivot #10) — unified payment
  // method reads from vendor-billing-store (same SoT as /vendor/membership
  // and the signup payment dialog). Falls back to the hardcoded mock
  // VENDOR_ID key when no profile is hydrated so the demo surface still
  // renders correctly; real vendors key off their own profile.id matching
  // what the signup flow wrote.
  const profile = useAuthStore((s) => s.profile)
  const billingVendorId = profile?.id ?? VENDOR_ID
  const paymentMethod = useVendorBillingStore((s) => s.paymentMethodByVendor[billingVendorId])
  const setPaymentMethod = useVendorBillingStore((s) => s.setPaymentMethod)

  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingSale, setPayingSale] = useState<ClosedSale | null>(null)
  const [payStep, setPayStep] = useState<1 | 2>(1)
  const [paidSales, setPaidSales] = useState<Set<string>>(new Set())
  const [editPaymentOpen, setEditPaymentOpen] = useState(false)

  const totalSales = sales.reduce((s, x) => s + x.sale_amount, 0)
  const totalEarnings = sales.reduce((s, x) => s + x.vendor_share, 0)
  const totalCommission = sales.reduce((s, x) => s + x.commission, 0)
  const paidCommission = sales.filter((s) => s.commission_paid || paidSales.has(s.id)).reduce((s, x) => s + x.commission, 0)
  const unpaidCommission = totalCommission - paidCommission
  const hasUnpaid = unpaidCommission > 0

  const openPayDialog = (sale: ClosedSale) => {
    setPayingSale(sale)
    setPayStep(1)
    setPayDialogOpen(true)
  }

  const confirmPay = () => {
    if (payStep === 1) {
      setPayStep(2)
      return
    }
    if (payingSale) {
      setPaidSales((prev) => new Set([...prev, payingSale.id]))
    }
    setPayDialogOpen(false)
  }

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  } satisfies Variants
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  } satisfies Variants

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Banking & Commissions" description="Track sales, commissions, and payouts" />

      {/* Summary KPI Row — 2x2 at every width per Rodolfo-direct 2026-04-21
          ship #176 ("make it 2x2 on the displayed numbers on top of unpaid
          commissions"). Was grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-4
          (a 1x4 row on desktop); now stays 2 cols everywhere so the 4
          tiles land in a clean 2x2 block. */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div variants={item}>
          <KpiCard title="Total Sales" value={fmt(totalSales)} icon={DollarSign} iconColor="bg-primary" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title={`Your Earnings (${vendorPct}%)`} value={fmt(totalEarnings)} icon={Wallet} iconColor="bg-emerald-500" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title={`Commission Due (${commPct}%)`} value={fmt(unpaidCommission)} icon={Building2} iconColor="bg-amber-500" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title="Paid to BuildConnect" value={fmt(paidCommission)} icon={CheckCircle2} iconColor="bg-slate-500" />
        </motion.div>
      </div>

      {/* Commission Warning Banner */}
      {hasUnpaid && (
        <motion.div variants={item}>
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Unpaid commission: {fmt(unpaidCommission)}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Please settle outstanding commissions to maintain your account in good standing.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Closed Sales Ledger */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="font-heading">Closed Sales Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Lead ID</TableHead>
                    <TableHead className="font-semibold">Homeowner</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">Project</TableHead>
                    <TableHead className="font-semibold text-right">Sale Total</TableHead>
                    <TableHead className="font-semibold text-right">Your {vendorPct}%</TableHead>
                    <TableHead className="font-semibold text-right">Platform {commPct}%</TableHead>
                    <TableHead className="font-semibold hidden sm:table-cell">Close Date</TableHead>
                    <TableHead className="font-semibold text-center">Status</TableHead>
                    <TableHead className="font-semibold text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => {
                    const isPaid = sale.commission_paid || paidSales.has(sale.id)
                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="font-mono text-xs">{sale.lead_id}</TableCell>
                        <TableCell className="font-medium">{sale.homeowner_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm hidden md:table-cell">{sale.project}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(sale.sale_amount)}</TableCell>
                        <TableCell className="text-right text-emerald-700 dark:text-emerald-400 font-medium">{fmt(sale.vendor_share)}</TableCell>
                        <TableCell className="text-right text-amber-700 dark:text-amber-400 font-medium">{fmt(sale.commission)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{fmtDate(sale.closed_at)}</TableCell>
                        <TableCell className="text-center">
                          {isPaid ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                              <Clock className="h-3 w-3 mr-1" /> Unpaid
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {!isPaid && (
                            <Button size="sm" variant="outline" onClick={() => openPayDialog(sale)} className="text-xs">
                              <CreditCard className="h-3 w-3 mr-1" /> Pay
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Ship #188 — unified Payment Method card. Replaces the former
          separate Bank Accounts + Debit/Credit Cards sections per
          Rodolfo "merge together bank account and debit/credit card
          payment like you did on membership". Reads from vendor-billing
          -store (same SoT as /vendor/membership + signup dialog); Update
          opens the same VendorPaymentDialog in non-blocking edit mode.
          Vocabulary resolves via PAYMENT_METHOD_LABELS + paymentMethod
          .brand per the post-#185 "Visa ****4242" shape. */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="font-heading">Payment Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentMethod ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl shrink-0',
                    paymentMethod.kind === 'checking'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-primary/10 text-primary',
                  )}>
                    {paymentMethod.kind === 'checking' ? (
                      <Landmark className="h-5 w-5" />
                    ) : (
                      <CreditCard className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {paymentMethod.kind === 'checking'
                        ? PAYMENT_METHOD_LABELS[paymentMethod.kind]
                        : paymentMethod.brand ?? PAYMENT_METHOD_LABELS[paymentMethod.kind]}
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                        •••• {paymentMethod.last4}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {paymentMethod.kind === 'checking'
                        ? `${paymentMethod.bankName} · ${paymentMethod.holder}`
                        : `${paymentMethod.holder}${paymentMethod.expiry ? ` · Exp ${paymentMethod.expiry}` : ''}`}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditPaymentOpen(true)}
                  className="gap-1.5"
                >
                  Update
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">No payment method on file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add a card or checking account to pay membership + receive commission payouts.
                  </p>
                </div>
                <Button size="sm" onClick={() => setEditPaymentOpen(true)}>
                  Add method
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-border/50">
              Used for both your monthly membership and commission payouts. A
              3% processing fee applies when paying via card; bank account
              (ACH) transfers are fee-free.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Ship #188 — unified Add/Update flow routes through
          VendorPaymentDialog (shared with signup + membership). Mounted
          non-blocking so Escape + overlay-click dismiss works in edit
          mode. Dedicated Add Card + Link Bank Account dialogs removed. */}
      <VendorPaymentDialog
        open={editPaymentOpen}
        onOpenChange={setEditPaymentOpen}
        blocking={false}
        initialKind={paymentMethod?.kind}
        initialHolder={paymentMethod?.holder}
        onSuccess={(method) => {
          setPaymentMethod(billingVendorId, method)
        }}
      />

      {/* Pay Commission Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {payStep === 1 ? 'Pay Commission' : 'Confirm Payment'}
            </DialogTitle>
            <DialogDescription>
              {payStep === 1
                ? 'Review the commission details before proceeding.'
                : 'This action cannot be undone. Confirm to process payment.'}
            </DialogDescription>
          </DialogHeader>
          {payingSale && (
            <div className="space-y-4 py-2">
              {payStep === 1 ? (
                <>
                  <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lead</span>
                      <span className="font-medium">{payingSale.lead_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Homeowner</span>
                      <span className="font-medium">{payingSale.homeowner_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sale Total</span>
                      <span className="font-medium">{fmt(payingSale.sale_amount)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Commission (15%)</span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">{fmt(payingSale.commission)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="rounded-2xl bg-amber-100 dark:bg-amber-900/30 p-4 inline-block mb-3">
                    <CreditCard className="h-8 w-8 text-amber-700 dark:text-amber-400" />
                  </div>
                  <p className="text-lg font-bold font-heading">{fmt(payingSale.commission)}</p>
                  <p className="text-sm text-muted-foreground mt-1">will be sent to BuildConnect</p>
                  {/* Ship #188 — payment source now reads from the
                      unified vendor-billing-store entry. Same
                      vocabulary as the Payment Method card above +
                      /vendor/membership. */}
                  {paymentMethod && (
                    <p className="text-xs text-muted-foreground mt-2">
                      From {paymentMethod.kind === 'checking'
                        ? `${paymentMethod.bankName ?? 'Checking'} ****${paymentMethod.last4}`
                        : `${paymentMethod.brand ?? PAYMENT_METHOD_LABELS[paymentMethod.kind]} ****${paymentMethod.last4}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmPay}>
              {payStep === 1 ? 'Continue' : 'Confirm & Pay'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  )
}
