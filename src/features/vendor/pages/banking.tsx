import { useState, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  DollarSign, Wallet, Building2, AlertTriangle, CreditCard,
  CheckCircle2, Clock, Landmark, ArrowUpRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
  PAYMENT_PURPOSE_LABELS,
  type VendorPaymentMethod,
} from '@/stores/vendor-billing-store'
import { useVendorEmployeesStore } from '@/stores/vendor-employees-store'
import { useVendorPaymentsStore } from '@/stores/vendor-payments-store'
import { useVendorScope } from '@/lib/vendor-scope'
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

  // Ship #188 / #189 — payment methods are a list per vendor. Source
  // is vendor-billing-store.paymentMethodsByVendor (post-#189 migrate
  // wraps any pre-#189 single-method entry into the new array shape).
  // Falls back to the hardcoded mock VENDOR_ID key when no profile is
  // hydrated so demo surfaces render; real vendors key off profile.id.
  const profile = useAuthStore((s) => s.profile)
  const billingVendorId = profile?.id ?? VENDOR_ID
  // Ship #190 — CRITICAL fix on top of #189: the `?? []` fallback
  // INSIDE the zustand selector returns a new empty-array reference
  // on every render when the map entry is undefined → React #185
  // infinite-loop crash. Same defect class as #111 and the banked
  // ZUSTAND-SELECTOR-STABLE-REFERENCE memory. Fix: select the
  // possibly-undefined value (stable either way) and fall back to a
  // fresh [] in render body where identity-instability is harmless.
  const paymentMethodsRaw = useVendorBillingStore((s) => s.paymentMethodsByVendor[billingVendorId])
  const paymentMethods = paymentMethodsRaw ?? []
  const addPaymentMethod = useVendorBillingStore((s) => s.addPaymentMethod)
  const updatePaymentMethod = useVendorBillingStore((s) => s.updatePaymentMethod)
  const removePaymentMethod = useVendorBillingStore((s) => s.removePaymentMethod)
  // Commission-source lookup for the Pay Commission dialog — first
  // method whose purpose is 'commissions' or 'both'.
  const commissionMethod = useVendorBillingStore((s) =>
    s.paymentMethodsByVendor[billingVendorId]?.find(
      (m) => m.purpose === 'commissions' || m.purpose === 'both',
    ),
  )

  // Ship #21 — Account Rep Payments toggle (bottom of page). Shares
  // state with the /vendor/account-reps header Switch via
  // bankEnabledByVendor on useVendorEmployeesStore. Keys via
  // useVendorScope specifically so both surfaces resolve the SAME
  // map entry — keying by profile.id here would fragment state across
  // the two surfaces for demo logins (useVendorScope reverse-maps
  // profile.id → v-1/v-2/v-3 for apex/shield/paradise demos).
  const { vendorId: payrollVendorId } = useVendorScope()
  const bankEnabledMap = useVendorEmployeesStore((s) => s.bankEnabledByVendor)
  const payrollBankEnabled = bankEnabledMap[payrollVendorId] ?? false
  const setPayrollBankEnabled = useVendorEmployeesStore((s) => s.setBankEnabled)

  // Ship #22 — Account Rep payment history. Keyed via the same
  // useVendorScope vendorId as the #21 toggle (shared key-source
  // per banked key-source-consistency rule). Raw-map selector +
  // render-body fallback (post-#190 pattern).
  const accountRepPaymentsMap = useVendorPaymentsStore((s) => s.paymentsByVendor)
  const accountRepPayments = accountRepPaymentsMap[payrollVendorId] ?? []

  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingSale, setPayingSale] = useState<ClosedSale | null>(null)
  const [payStep, setPayStep] = useState<1 | 2>(1)
  const [paidSales, setPaidSales] = useState<Set<string>>(new Set())
  // Ship #189 — dialog state tracks which method is being edited
  // (null = add-new-mode). Separate deleteTarget state for the
  // last-for-purpose confirmation.
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null)
  const [methodDialogOpen, setMethodDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<VendorPaymentMethod | null>(null)

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

      {/* Ship #189 — payment methods as a list (extends #188 single
          card). Each row = icon + kind/brand + masked last4 + purpose
          chip + Edit + Delete. "Add another method" trailer. Reads
          from vendor-billing-store.paymentMethodsByVendor (array). */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading">Payment Methods</CardTitle>
              {paymentMethods.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingMethodId(null)
                    setMethodDialogOpen(true)
                  }}
                  className="text-xs gap-1"
                >
                  <ArrowUpRight className="h-3 w-3" />
                  Add another
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentMethods.length === 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">No payment methods on file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add a card or checking account to pay membership + receive commission payouts.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingMethodId(null)
                    setMethodDialogOpen(true)
                  }}
                >
                  Add method
                </Button>
              </div>
            ) : (
              paymentMethods.map((method) => {
                const kindLabel =
                  method.kind === 'checking'
                    ? PAYMENT_METHOD_LABELS[method.kind]
                    : method.brand ?? PAYMENT_METHOD_LABELS[method.kind]
                const sub =
                  method.kind === 'checking'
                    ? `${method.bankName} · ${method.holder}`
                    : `${method.holder}${method.expiry ? ` · Exp ${method.expiry}` : ''}`
                return (
                  <div
                    key={method.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                        {method.kind === 'checking' ? (
                          <Landmark className="h-5 w-5" />
                        ) : (
                          <CreditCard className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {kindLabel}
                          <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                            •••• {method.last4}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{sub}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] font-semibold',
                          method.purpose === 'membership' && 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
                          method.purpose === 'commissions' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                          method.purpose === 'both' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
                        )}
                      >
                        {PAYMENT_PURPOSE_LABELS[method.purpose]}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setEditingMethodId(method.id)
                          setMethodDialogOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          // Ship #189 — delete confirmation only when
                          // this is the last method covering its
                          // purpose (orphan-prevention). Otherwise
                          // single-click delete with toast undo.
                          const wouldOrphanPurpose = (purp: 'membership' | 'commissions') => {
                            if (method.purpose !== purp && method.purpose !== 'both') return false
                            const remaining = paymentMethods.filter(
                              (m) => m.id !== method.id && (m.purpose === purp || m.purpose === 'both'),
                            )
                            return remaining.length === 0
                          }
                          const orphans =
                            wouldOrphanPurpose('membership') || wouldOrphanPurpose('commissions')
                          if (orphans) {
                            setDeleteTarget(method)
                          } else {
                            removePaymentMethod(billingVendorId, method.id)
                            toast.success('Payment method removed', {
                              action: {
                                label: 'Undo',
                                onClick: () => addPaymentMethod(billingVendorId, {
                                  purpose: method.purpose,
                                  kind: method.kind,
                                  last4: method.last4,
                                  holder: method.holder,
                                  brand: method.brand,
                                  expiry: method.expiry,
                                  bankName: method.bankName,
                                  routingLast4: method.routingLast4,
                                  addedAt: method.addedAt,
                                }),
                              },
                            })
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-border/50">
              Methods tagged Membership or Commissions route only that
              payment type; All Payments covers both. A 3% processing fee
              applies when paying via card; bank account (ACH) transfers
              are fee-free.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Ship #21 — Account Rep Payments toggle. Shared state with
          the header toggle on /vendor/account-reps via
          bankEnabledByVendor + useVendorScope (same key source on
          both surfaces). Flipping here updates the same map entry;
          both surfaces auto-sync on next render via zustand
          subscription. */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition" data-vendor-banking-payroll-toggle>
          <CardHeader>
            <CardTitle className="font-heading">Account Rep Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Payroll integration</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Turn on to manage account rep bank details + payroll here. Turn off if you're using an outside payroll system — bank fields stay hidden on every account rep profile until re-enabled. Flipping this also updates the same toggle on your Account Reps tab. Any bank info already entered is preserved whether the toggle is on or off.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  id="banking-payroll-toggle"
                  checked={payrollBankEnabled}
                  onCheckedChange={(v) => {
                    setPayrollBankEnabled(payrollVendorId, !!v)
                    toast.success(v ? 'Payroll integration enabled' : 'Payroll integration disabled')
                  }}
                  data-vendor-banking-payroll-toggle-switch
                />
                <Label htmlFor="banking-payroll-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                  {payrollBankEnabled ? 'On' : 'Off'}
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Ship #22 — Account Rep Payment History. Reads from
          vendor-payments store keyed by useVendorScope.vendorId (same
          resolver as the #21 toggle above). Shows recent mock
          payments with frozen ACH-style descriptor ('BUILDCONNECT ·
          [VENDOR] · PAYROLL') visible per 'mock closes loop as if
          real' directive. Empty state prompts the vendor to pay from
          /vendor/account-reps. */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition" data-vendor-account-rep-payment-history>
          <CardHeader>
            <CardTitle className="font-heading">Account Rep Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            {accountRepPayments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">No account rep payments yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Payments sent from the Account Reps tab will show up here with the bank descriptor on file.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Account Rep</TableHead>
                      <TableHead className="font-semibold hidden sm:table-cell">Destination</TableHead>
                      <TableHead className="font-semibold hidden md:table-cell">Descriptor</TableHead>
                      <TableHead className="font-semibold text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountRepPayments.map((p) => (
                      <TableRow key={p.id} data-account-rep-payment-row data-account-rep-payment-id={p.id}>
                        <TableCell className="text-sm">{fmtDate(p.paidAt)}</TableCell>
                        <TableCell className="font-medium">{p.accountRepName}</TableCell>
                        <TableCell className="font-mono text-xs hidden sm:table-cell">
                          {p.bankName} ••••{p.bankAccountLast4}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground hidden md:table-cell">
                          {p.descriptor}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmt(p.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Ship #189 — single VendorPaymentDialog handles both Add and
          Edit. When editingMethodId is set, pre-fills kind/holder/
          purpose from that method; onSuccess branches to update. When
          null, onSuccess branches to add. */}
      <VendorPaymentDialog
        open={methodDialogOpen}
        onOpenChange={(open) => {
          setMethodDialogOpen(open)
          if (!open) setEditingMethodId(null)
        }}
        blocking={false}
        initialKind={
          editingMethodId
            ? paymentMethods.find((m) => m.id === editingMethodId)?.kind
            : undefined
        }
        initialHolder={
          editingMethodId
            ? paymentMethods.find((m) => m.id === editingMethodId)?.holder
            : undefined
        }
        initialPurpose={
          editingMethodId
            ? paymentMethods.find((m) => m.id === editingMethodId)?.purpose
            : 'both'
        }
        onSuccess={(method) => {
          if (editingMethodId) {
            updatePaymentMethod(billingVendorId, editingMethodId, method)
          } else {
            addPaymentMethod(billingVendorId, method)
          }
        }}
      />

      {/* Ship #189 — orphan-prevention confirmation. Fires only when
          removing this method would leave zero coverage for either
          Membership or Commissions flow. Non-orphaning deletes are
          single-click with toast-undo per the banked discipline
          (don't train users to click-through confirmation dialogs). */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive">
              Remove this payment method?
            </DialogTitle>
            <DialogDescription>
              This is your only method covering{' '}
              {deleteTarget?.purpose === 'both' ? 'membership and commissions' : deleteTarget?.purpose === 'membership' ? 'membership' : 'commissions'}.
              Removing it will leave those flows without a payment source until
              you add another.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDeleteTarget(null)}
            >
              Keep it
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => {
                if (deleteTarget) {
                  removePaymentMethod(billingVendorId, deleteTarget.id)
                  toast.success('Payment method removed')
                }
                setDeleteTarget(null)
              }}
            >
              Remove anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  {/* Ship #189 — Pay Commission source reads the first
                      method tagged 'commissions' or 'both'. If no such
                      method exists, line is hidden (matches #188 empty
                      state). */}
                  {commissionMethod && (
                    <p className="text-xs text-muted-foreground mt-2">
                      From {commissionMethod.kind === 'checking'
                        ? `${commissionMethod.bankName ?? 'Checking'} ****${commissionMethod.last4}`
                        : `${commissionMethod.brand ?? PAYMENT_METHOD_LABELS[commissionMethod.kind]} ****${commissionMethod.last4}`}
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
