import { useState, useMemo, useCallback } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  DollarSign, Wallet, Building2, AlertTriangle, CreditCard,
  CheckCircle2, Clock, Landmark, ArrowUpRight, Users, MinusCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import {
  useVendorBillingStore,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PURPOSE_LABELS,
  type VendorPaymentMethod,
} from '@/stores/vendor-billing-store'
import { useVendorEmployeesStore } from '@/stores/vendor-employees-store'
import { useUsersStore } from '@/stores/users-store'
import { useVendorPaymentsStore } from '@/stores/vendor-payments-store'
import { useCommissionPaymentsStore, type CommissionPayment } from '@/stores/commission-payments-store'
import { useRepPayConfigStore, type RepPayMode } from '@/stores/rep-pay-config-store'
import { useVendorScope } from '@/lib/vendor-scope'
import { VendorPaymentDialog } from '@/features/auth/components/vendor-payment-dialog'
import { cn } from '@/lib/utils'

interface PartialPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sale: ClosedSale | null
  payments: CommissionPayment[]
  addPayment: (saleId: string, amount: number, totalCommission: number, note?: string) => void
}

function PartialPaymentDialog({ open, onOpenChange, sale, payments, addPayment }: PartialPaymentDialogProps) {
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')

  if (!sale) return null

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = sale.commission - totalPaid
  const parsed = parseFloat(amountStr)
  const isValid = !isNaN(parsed) && parsed > 0 && parsed <= remaining

  const handleSubmit = () => {
    if (!isValid) return
    addPayment(sale.id, parsed, sale.commission, note)
    setAmountStr('')
    setNote('')
    onOpenChange(false)
  }

  const handleClose = (o: boolean) => {
    if (!o) { setAmountStr(''); setNote('') }
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Pay Commission</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {sale.lead_id} · {sale.homeowner_name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Commission</span>
              <span className="font-semibold">{fmt(sale.commission)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Already Paid</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{fmt(totalPaid)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Remaining</span>
              <span className={cn('font-bold', remaining > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>
                {fmt(remaining)}
              </span>
            </div>
          </div>

          {remaining > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">Payment amount</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">$</span>
                <Input
                  type="number"
                  min={0.01}
                  max={remaining}
                  step={0.01}
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="flex-1"
                />
              </div>
              {parsed > remaining && !isNaN(parsed) && (
                <p className="text-xs text-destructive">Exceeds remaining balance of {fmt(remaining)}</p>
              )}
            </div>
          )}

          {remaining > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">Note (optional)</label>
              <Input
                placeholder="e.g. Phase 1 complete, cash down payment…"
                value={note}
                maxLength={140}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}

          {payments.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment History</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {payments.map((p) => (
                  <div key={p.id} className="rounded-md bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        {new Date(p.paidAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">{fmt(p.amount)}</span>
                    </div>
                    <p className="text-muted-foreground italic">{p.note ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {remaining <= 0 ? 'Close' : 'Cancel'}
          </Button>
          {remaining > 0 && (
            <Button className="w-full sm:w-auto gap-1.5" disabled={!isValid} onClick={handleSubmit}>
              <CreditCard className="h-4 w-4" /> Record Payment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function VendorBanking() {
  // Ship #234 — swap VENDOR_ID='v-1' hardcode for useVendorScope so banking
  // keys the SAME vendor as dashboard/lead-inbox/profile/messages. Resolves
  // the LS-alias-first, UUID-map-second, profile.id-fallback chain per the
  // banked useVendorScope discipline. Previously banking was v-1-only and
  // invisible to v-2..v-5 demo vendors.
  const { vendorId: VENDOR_ID } = useVendorScope()
  const vendor = MOCK_VENDORS.find((v) => v.id === VENDOR_ID) ?? MOCK_VENDORS[0]

  // Ship #234 — admin commission-% override propagation. Matches the
  // admin/overview resolveCommissionPct pattern (admin/overview.tsx
  // lines 101-125). When admin edits a vendor's commission % on
  // /admin/vendors, vendor banking KPIs + live-sale synthesis pick up
  // the new rate on next render via zustand subscription.
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  const commPct = vendorCommissionOverrides[VENDOR_ID] ?? vendor.commission_pct
  const vendorPct = 100 - commPct

  // Ship #234 — merge vendor-mark-sold (sentProjects status='sold') into
  // the closed-sales pipeline so vendor banking surfaces QA flow revenue,
  // not only the static MOCK_CLOSED_SALES fixture. Synthesizes ClosedSale-
  // shape rows from sentProjects with commission computed via the current
  // effective rate. Matches admin/overview mockSoldSales pattern.
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const sales = useMemo<ClosedSale[]>(() => {
    const fixture = MOCK_CLOSED_SALES.filter((s) => s.vendor_id === VENDOR_ID)
    const live = sentProjects
      .filter((p) =>
        p.contractor?.vendor_id === VENDOR_ID
          && p.status === 'sold'
          && typeof p.saleAmount === 'number'
          && p.saleAmount > 0,
      )
      .map<ClosedSale>((p) => {
        const saleAmount = p.saleAmount as number
        const commission = Math.round(saleAmount * (commPct / 100))
        return {
          id: `live-${p.id}`,
          lead_id: `L-${p.id.slice(0, 4).toUpperCase()}`,
          vendor_id: VENDOR_ID,
          homeowner_id: 'live',
          sale_amount: saleAmount,
          vendor_share: saleAmount - commission,
          commission,
          commission_paid: false,
          closed_at: p.soldAt ?? p.sentAt,
          homeowner_name: p.homeowner?.name ?? 'Customer',
          project: p.item?.serviceName ?? '',
        }
      })
    return [...fixture, ...live]
  }, [sentProjects, VENDOR_ID, commPct])

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
  const commissionPaymentsBySale = useCommissionPaymentsStore((s) => s.paymentsBySale)
  const addCommissionPayment = useCommissionPaymentsStore((s) => s.addPayment)

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

  // Per-rep pay config — config-only (no payout math per banked
  // project_buildconnect_vendor_compensation_private rule).
  const allUsers = useUsersStore((s) => s.users)
  const vendorReps = useMemo(
    () => allUsers.filter((u) => u.role === 'account_rep' && u.account_rep_for_vendor_id === payrollVendorId),
    [allUsers, payrollVendorId],
  )
  const repPayConfigs = useRepPayConfigStore((s) => s.configByRep)
  const setRepPayConfig = useRepPayConfigStore((s) => s.setRepPayConfig)
  // Local draft state: repId → { mode, valueStr } for controlled inputs
  const [repPayDrafts, setRepPayDrafts] = useState<Record<string, { mode: RepPayMode; valueStr: string }>>({})
  const getRepDraft = useCallback((repId: string) => {
    if (repPayDrafts[repId]) return repPayDrafts[repId]
    const saved = repPayConfigs[repId]
    return { mode: (saved?.mode ?? 'flat') as RepPayMode, valueStr: saved ? String(saved.value) : '' }
  }, [repPayDrafts, repPayConfigs])

  // Ship #22 — Account Rep payment history. Keyed via the same
  // useVendorScope vendorId as the #21 toggle (shared key-source
  // per banked key-source-consistency rule). Raw-map selector +
  // render-body fallback (post-#190 pattern).
  const accountRepPaymentsMap = useVendorPaymentsStore((s) => s.paymentsByVendor)
  const accountRepPayments = accountRepPaymentsMap[payrollVendorId] ?? []

  const [detailSale, setDetailSale] = useState<ClosedSale | null>(null)
  const [payTarget, setPayTarget] = useState<ClosedSale | null>(null)
  // Ship #189 — dialog state tracks which method is being edited
  // (null = add-new-mode). Separate deleteTarget state for the
  // last-for-purpose confirmation.
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null)
  const [methodDialogOpen, setMethodDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<VendorPaymentMethod | null>(null)

  const totalSales = sales.reduce((s, x) => s + x.sale_amount, 0)
  const totalEarnings = sales.reduce((s, x) => s + x.vendor_share, 0)
  const totalCommission = sales.reduce((s, x) => s + x.commission, 0)
  const paidCommission = useMemo(() =>
    sales.reduce((acc, sale) => {
      if (sale.commission_paid) return acc + sale.commission
      const payments = commissionPaymentsBySale[sale.id] ?? []
      return acc + payments.reduce((s, p) => s + p.amount, 0)
    }, 0),
    [sales, commissionPaymentsBySale],
  )
  const unpaidCommission = totalCommission - paidCommission
  const hasUnpaid = unpaidCommission > 0

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
                    const salePayments = commissionPaymentsBySale[sale.id] ?? []
                    const salePaid = salePayments.reduce((s, p) => s + p.amount, 0)
                    const saleRemaining = sale.commission - salePaid
                    const status = sale.commission_paid || saleRemaining <= 0
                      ? 'paid'
                      : salePaid > 0 ? 'partial' : 'pending'
                    return (
                      <TableRow
                        key={sale.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setDetailSale(sale)}
                      >
                        <TableCell className="font-mono text-xs">{sale.lead_id}</TableCell>
                        <TableCell className="font-medium">{sale.homeowner_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm hidden md:table-cell">{sale.project}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(sale.sale_amount)}</TableCell>
                        <TableCell className="text-right text-emerald-700 dark:text-emerald-400 font-medium">{fmt(sale.vendor_share)}</TableCell>
                        <TableCell className="text-right text-amber-700 dark:text-amber-400 font-medium">{fmt(sale.commission)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{fmtDate(sale.closed_at)}</TableCell>
                        <TableCell className="text-center">
                          {status === 'paid' ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                            </Badge>
                          ) : status === 'partial' ? (
                            <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-xs">
                              <MinusCircle className="h-3 w-3 mr-1" /> Partial
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                              <Clock className="h-3 w-3 mr-1" /> Unpaid
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {status !== 'paid' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); setPayTarget(sale) }}
                              className="text-xs"
                            >
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

            {/* Per-rep pay config — gated on payroll integration ON.
                Config only: flat amount or %; no payout computed here. */}
            {payrollBankEnabled && vendorReps.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 pt-1">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rep Pay Configuration</p>
                </div>
                {vendorReps.map((rep) => {
                  const draft = getRepDraft(rep.id)
                  const saved = repPayConfigs[rep.id]
                  const isDirty =
                    draft.mode !== (saved?.mode ?? 'flat') ||
                    draft.valueStr !== (saved ? String(saved.value) : '')
                  return (
                    <div key={rep.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{rep.name}</p>
                          <p className="text-xs text-muted-foreground">{rep.email}</p>
                        </div>
                        {saved && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {saved.mode === 'flat' ? `$${saved.value.toLocaleString()} flat` : `${saved.value}% commission`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={draft.mode}
                          onValueChange={(v) =>
                            setRepPayDrafts((prev) => ({
                              ...prev,
                              [rep.id]: { ...draft, mode: v as RepPayMode },
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="flat">Flat amount</SelectItem>
                            <SelectItem value="percent">% commission</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          className="h-8 w-28 text-xs"
                          type="number"
                          min={0}
                          placeholder={draft.mode === 'flat' ? '0.00' : '0'}
                          value={draft.valueStr}
                          onChange={(e) =>
                            setRepPayDrafts((prev) => ({
                              ...prev,
                              [rep.id]: { ...draft, valueStr: e.target.value },
                            }))
                          }
                        />
                        <span className="text-xs text-muted-foreground shrink-0">{draft.mode === 'flat' ? 'USD' : '%'}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs ml-auto"
                          disabled={!isDirty || draft.valueStr === '' || Number(draft.valueStr) < 0}
                          onClick={() => {
                            const val = Number(draft.valueStr)
                            if (isNaN(val) || val < 0) return
                            setRepPayConfig(rep.id, { mode: draft.mode, value: val })
                            setRepPayDrafts((prev) => { const n = { ...prev }; delete n[rep.id]; return n })
                            toast.success(`Pay config saved for ${rep.name}`)
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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

      {/* Closed Sales detail popup — read-only; all numbers from the
          same ClosedSale object + commission store so MATH IS GOD */}
      <Dialog open={!!detailSale} onOpenChange={(open) => !open && setDetailSale(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Sale Details</DialogTitle>
            <DialogDescription className="font-mono text-xs">{detailSale?.lead_id}</DialogDescription>
          </DialogHeader>
          {detailSale && (() => {
            const salePayments = commissionPaymentsBySale[detailSale.id] ?? []
            const storePaid = salePayments.reduce((s, p) => s + p.amount, 0)
            // fixture commission_paid flag = fully paid outside the store
            const salePaid = detailSale.commission_paid && storePaid === 0 ? detailSale.commission : storePaid
            const saleRemaining = detailSale.commission - salePaid
            const status = saleRemaining <= 0
              ? 'paid'
              : salePaid > 0 ? 'partial' : 'pending'
            return (
              <>
                <div className="space-y-4 py-1">
                  <div className="rounded-xl bg-muted/50 p-4 space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer</span>
                      <span className="font-medium">{detailSale.homeowner_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Project</span>
                      <span className="font-medium">{detailSale.project || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Close Date</span>
                      <span className="font-medium">{fmtDate(detailSale.closed_at)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sale Total</span>
                      <span className="font-semibold">{fmt(detailSale.sale_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Your Share ({vendorPct}%)</span>
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">{fmt(detailSale.vendor_share)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Commission ({commPct}%)</span>
                      <span className="font-medium text-amber-700 dark:text-amber-400">{fmt(detailSale.commission)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid to Date</span>
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">{fmt(salePaid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Remaining</span>
                      <span className={cn('font-medium', saleRemaining > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>
                        {fmt(saleRemaining)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Commission Status</span>
                      {status === 'paid' ? (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                        </Badge>
                      ) : status === 'partial' ? (
                        <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-xs">
                          <MinusCircle className="h-3 w-3 mr-1" /> Partial
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                          <Clock className="h-3 w-3 mr-1" /> Unpaid
                        </Badge>
                      )}
                    </div>
                  </div>

                  {salePayments.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment History</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {salePayments.map((p) => (
                          <div key={p.id} className="rounded-md bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                {new Date(p.paidAt).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                  hour: 'numeric', minute: '2-digit',
                                })}
                              </span>
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">{fmt(p.amount)}</span>
                            </div>
                            <p className="text-muted-foreground italic">{p.note ?? '—'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDetailSale(null)}>
                    Close
                  </Button>
                  {status !== 'paid' && (
                    <Button
                      className="w-full sm:w-auto gap-1.5"
                      onClick={() => setPayTarget(detailSale)}
                    >
                      <CreditCard className="h-4 w-4" /> Pay Commission
                    </Button>
                  )}
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

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

      <PartialPaymentDialog
        open={!!payTarget}
        onOpenChange={(open) => !open && setPayTarget(null)}
        sale={payTarget}
        payments={payTarget ? (commissionPaymentsBySale[payTarget.id] ?? []) : []}
        addPayment={addCommissionPayment}
      />

    </motion.div>
  )
}
