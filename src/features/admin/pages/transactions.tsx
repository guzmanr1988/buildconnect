import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { DollarSign, CreditCard, Wallet, ArrowDownToLine, CheckCircle2, Clock, ChevronDown, ChevronRight, CalendarDays, ChevronLeft, MinusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { fetchAllTransactions } from '@/lib/api/analytics'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useCommissionPaymentsStore, type CommissionPayment } from '@/stores/commission-payments-store'
import { MOCK_TRANSACTIONS, MOCK_VENDORS } from '@/lib/mock-data'
import { useEffectiveMockLeads, useEffectiveMockClosedSales } from '@/lib/mock-data-effective'
import { ProjectDetailDialog } from '@/components/shared/project-detail-dialog'
import { TransactionDetailDialog, formatTransactionId } from '@/components/shared/transaction-detail-dialog'
import type { Transaction, TransactionType, TransactionStatus } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

const STATUS_CONFIG: Record<TransactionStatus, { label: string; className: string }> = {
  paid: {
    label: 'Paid',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  closed: {
    label: 'Closed',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type SectionKey = 'commission_paid' | 'commission_pending' | 'membership' | 'payout'

const CATEGORIES: { key: SectionKey; type: TransactionType; title: string; icon: typeof DollarSign; iconColor: string; headerColor: string; isCommission: boolean }[] = [
  { key: 'commission_paid', type: 'commission', title: 'Commissions Paid', icon: CheckCircle2, iconColor: 'bg-emerald-500', headerColor: 'text-emerald-700 dark:text-emerald-400', isCommission: true },
  { key: 'commission_pending', type: 'commission', title: 'Pending Commissions', icon: Clock, iconColor: 'bg-amber-500', headerColor: 'text-amber-700 dark:text-amber-400', isCommission: true },
  { key: 'membership', type: 'membership', title: 'Memberships', icon: CreditCard, iconColor: 'bg-blue-500', headerColor: 'text-blue-700 dark:text-blue-400', isCommission: false },
  { key: 'payout', type: 'payout', title: 'Payouts', icon: ArrowDownToLine, iconColor: 'bg-amber-500', headerColor: 'text-amber-700 dark:text-amber-400', isCommission: false },
]

function saleIdFromTxId(txId: string): string | null {
  if (txId.startsWith('mock-cs-tx-')) return txId.slice('mock-cs-tx-'.length)
  if (txId.startsWith('mock-tx-')) return `live-${txId.slice('mock-tx-'.length)}`
  return null
}

interface AdminCommissionPaymentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tx: Transaction | null
  payments: CommissionPayment[]
}

function AdminCommissionPaymentsDialog({ open, onOpenChange, tx, payments }: AdminCommissionPaymentsDialogProps) {
  if (!tx) return null
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  // Use frozen totalCommissionAtWrite (set at first payment write). For no-payment rows
  // tx.amount = original commission; for rows where amount was overridden to remaining,
  // totalCommissionAtWrite restores the original.
  const originalTotal = payments[0]?.totalCommissionAtWrite ?? (totalPaid + tx.amount)
  const remaining = originalTotal - totalPaid
  const status = remaining <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'pending'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Commission Payment Detail</DialogTitle>
          <DialogDescription>{tx.company}{tx.customer ? ` · ${tx.customer}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Source context */}
          <div className="rounded-xl bg-muted/50 p-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vendor</span>
              <span className="font-medium">{tx.company}</span>
            </div>
            {tx.detail && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Project</span>
                <span className="font-medium text-right max-w-[60%]">{tx.detail}</span>
              </div>
            )}
            {tx.customer && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{tx.customer}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Commission</span>
              <span className="font-semibold">{fmt(originalTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid to Date</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{fmt(totalPaid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Remaining</span>
              <span className={cn('font-bold', remaining > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>
                {fmt(remaining)}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
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

          {payments.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment History</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
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
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">No payments recorded yet.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function TransactionsPage() {
  // Ship #250 — effective-fixture hook honors the demoDataHidden flag.
  const mockLeads = useEffectiveMockLeads()
  const mockClosedSales = useEffectiveMockClosedSales()
  // Phase 5: transactions fetched from Supabase at mount.
  const [transactions, setTransactions] = useState<Transaction[]>([])
  // In-place project-detail Dialog (ship #140): opens on same surface
  // without navigating away.
  const commissionPaymentsBySale = useCommissionPaymentsStore((s) => s.paymentsBySale)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  // Ship #148: for commission rows the fallback tx is kept so Dialog can
  // synthesize a commission-view when projectId fails to resolve.
  const [selectedCommissionTx, setSelectedCommissionTx] = useState<Transaction | null>(null)
  // Transaction-detail Dialog (ship #143) for membership + payout rows.
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [adminPaymentsTarget, setAdminPaymentsTarget] = useState<Transaction | null>(null)
  const [adminPaymentsPayments, setAdminPaymentsPayments] = useState<CommissionPayment[]>([])
  // Ship #159: month-grouping expand/collapse state per `${catKey}-${monthKey}`.
  // Default state: current month expanded + prior months collapsed.
  const currentMonthKey = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({})
  // Ship #193 (Rodolfo-direct 2026-04-21) — 12-month lookup filter.
  // 'all' = no filter (default). Any other value is a YYYY-MM key
  // matching the month-grouping scheme from #159. Applies uniformly
  // to all 4 transaction categories so the scope stays consistent
  // across tabs per Rodolfo's "all tabs" directive.
  const [monthFilter, setMonthFilter] = useState<string>('all')

  // Ship #196 — year+month popover picker state + month-label helper.
  // availableYears derivation lives below mockSoldTransactions since
  // it depends on that memo (tsc caught the ordering at write-time).
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear())

  const monthFilterLabel = useMemo(() => {
    if (monthFilter === 'all') return 'All time'
    const [y, m] = monthFilter.split('-').map(Number)
    if (!y || !m) return 'All time'
    const d = new Date(y, m - 1, 1)
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [monthFilter])

  const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const toggleMonth = (catKey: string, monthKey: string) => {
    const k = `${catKey}-${monthKey}`
    setExpandedMonths((prev) => ({ ...prev, [k]: !(prev[k] ?? monthKey === currentMonthKey) }))
  }
  const isMonthExpanded = (catKey: string, monthKey: string) => {
    const k = `${catKey}-${monthKey}`
    return expandedMonths[k] ?? monthKey === currentMonthKey
  }
  const refreshTransactions = () => {
    fetchAllTransactions()
      .then(setTransactions)
      .catch((err) => console.error('[admin/transactions] fetch failed:', err))
  }
  useEffect(() => {
    refreshTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useRefetchOnFocus(refreshTransactions)

  // Mock-side merge: vendor Mark-Sold on QA personas writes to the zustand
  // sentProjects store (not Supabase), so admin would miss those commissions.
  // Synthesize commission rows from sold sentProjects so admin sees the full
  // loop. Phase 2 admin-SoT audit per kratos msg 1776725170680.
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const rehydrateProjects = useCallback(() => useProjectsStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateProjects)

  // Ship #235 — admin commission-% override propagation on mock-synthesized
  // transaction rows. Previously hardcoded 0.15 (15%) regardless of the
  // per-vendor override. Matches admin/overview resolveCommissionPct pattern.
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)

  const mockSoldTransactions = useMemo<Transaction[]>(() => {
    return sentProjects
      .filter((p) => p.status === 'sold' && p.saleAmount && p.saleAmount > 0 && p.soldAt)
      .map((p): Transaction => {
        const vendorId = p.contractor?.vendor_id
        const vendor = vendorId
          ? MOCK_VENDORS.find((v) => v.id === vendorId)
          : MOCK_VENDORS.find((v) => v.company === p.contractor?.company)
        const effectivePct = vendor
          ? (vendorCommissionOverrides[vendor.id] ?? vendor.commission_pct)
          : 10
        return {
          id: `mock-tx-${p.id}`,
          type: 'commission' as TransactionType,
          status: 'paid' as TransactionStatus,
          vendor_id: p.contractor?.vendor_id ?? '',
          company: p.contractor?.company ?? 'Unknown vendor',
          detail: p.item.serviceName,
          customer: p.homeowner?.name ?? '',
          amount: Math.round((p.saleAmount ?? 0) * (effectivePct / 100)),
          date: p.soldAt!,
        }
      })
  }, [sentProjects, vendorCommissionOverrides])

  // Synthesize commission rows from fixture closed sales (MOCK_CLOSED_SALES)
  // so seed data appears even before any live markSold flow runs.
  // Uses closedSale.commission (already 10% post-#360). Shares shape with
  // mockSoldTransactions — see feedback_format_sot_shared_helper for future
  // extraction if synthesis logic grows beyond these two paths.
  const mockFixtureCommissions = useMemo<Transaction[]>(() => {
    return mockClosedSales.map((cs) => ({
      id: `mock-cs-tx-${cs.id}`,
      type: 'commission' as TransactionType,
      status: 'paid' as TransactionStatus,
      vendor_id: cs.vendor_id ?? '',
      company: MOCK_VENDORS.find((v) => v.id === cs.vendor_id)?.company ?? 'Unknown vendor',
      detail: cs.project?.split('—')[0].trim() ?? '',
      customer: cs.homeowner_name ?? '',
      amount: cs.commission,
      date: cs.closed_at,
    }))
  }, [mockClosedSales])

  // Ship #196 — all years that have at least one transaction (merged
  // mock + real + MOCK_TRANSACTIONS fixture), always includes the
  // current year so Rodolfo can select forward-looking months even
  // before any data lands. Sorted ascending.
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    years.add(new Date().getFullYear())
    for (const tx of transactions) years.add(new Date(tx.date).getFullYear())
    for (const tx of mockSoldTransactions) years.add(new Date(tx.date).getFullYear())
    for (const tx of mockFixtureCommissions) years.add(new Date(tx.date).getFullYear())
    for (const tx of MOCK_TRANSACTIONS) years.add(new Date(tx.date).getFullYear())
    return Array.from(years).sort((a, b) => a - b)
  }, [transactions, mockSoldTransactions, mockFixtureCommissions])

  const grouped = useMemo(() => {
    const result: Record<SectionKey, Transaction[]> = {
      commission_paid: [],
      commission_pending: [],
      membership: [],
      payout: [],
    }
    // Dedupe: if Supabase fetch returned a row with id matching our mock synth,
    // prefer the Supabase row (it's the authoritative version once the Tranche-2
    // closed_sales→transactions write path lands).
    // Also merge MOCK_TRANSACTIONS payouts (ship #144): Supabase has membership
    // + commission seeds but zero payout seeds, so the Payouts category would
    // render empty without this fallback. Memberships untouched (Supabase owns
    // the authoritative amounts).
    const supabaseIds = new Set(transactions.map((t) => t.id))
    const mockPayouts = MOCK_TRANSACTIONS.filter(
      (t) => t.type === 'payout' && !supabaseIds.has(t.id),
    )
    const unified = [
      ...transactions,
      ...mockSoldTransactions.filter((t) => !supabaseIds.has(t.id)),
      ...mockFixtureCommissions.filter((t) => !supabaseIds.has(t.id)),
      ...mockPayouts,
    ]
    for (const tx of unified) {
      if (tx.type === 'commission') {
        // Rodolfo spec: each payment entry becomes its own row in Commissions Paid.
        // Pending Commissions shows one row per sale with amount = remaining balance.
        // If no store payments, fall back to tx.status (fixture/Supabase paid→paid, pending→pending).
        const saleId = saleIdFromTxId(tx.id)
        const salePayments = saleId ? (commissionPaymentsBySale[saleId] ?? []) : []
        if (salePayments.length > 0) {
          const salePaid = salePayments.reduce((s, p) => s + p.amount, 0)
          for (const p of salePayments) {
            result.commission_paid.push({
              ...tx,
              id: `comm-partial-${p.id}`,
              amount: p.amount,
              date: p.paidAt,
              status: 'paid',
            })
          }
          const remaining = tx.amount - salePaid
          if (remaining > 0) {
            result.commission_pending.push({ ...tx, amount: remaining, status: 'pending' })
          }
        } else {
          if (tx.status === 'paid') result.commission_paid.push(tx)
          else result.commission_pending.push(tx)
        }
      } else if (tx.type === 'membership') {
        result.membership.push(tx)
      } else {
        result.payout.push(tx)
      }
    }
    for (const key of Object.keys(result) as SectionKey[]) {
      result[key].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }
    // Ship #193 — apply 12-month lookup filter uniformly across all
    // category sections. 'all' bypasses; any other monthFilter value
    // is a YYYY-MM key matching transaction.date's year-month.
    if (monthFilter !== 'all') {
      for (const key of Object.keys(result) as SectionKey[]) {
        result[key] = result[key].filter((tx) => {
          const d = new Date(tx.date)
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          return monthKey === monthFilter
        })
      }
    }
    return result
  }, [transactions, mockSoldTransactions, mockFixtureCommissions, monthFilter, commissionPaymentsBySale])

  const sectionTotals = useMemo(() => ({
    commission_paid: grouped.commission_paid.reduce((s, t) => s + t.amount, 0),
    commission_pending: grouped.commission_pending.reduce((s, t) => s + t.amount, 0),
    membership: grouped.membership.reduce((s, t) => s + t.amount, 0),
    payout: grouped.payout.reduce((s, t) => s + t.amount, 0),
  }), [grouped])

  const totals = useMemo(() => ({
    commission: sectionTotals.commission_paid + sectionTotals.commission_pending,
    membership: sectionTotals.membership,
    payout: sectionTotals.payout,
  }), [sectionTotals])

  const grandTotal = totals.commission + totals.membership + totals.payout
  const unifiedTxCount = grouped.commission_paid.length + grouped.commission_pending.length + grouped.membership.length + grouped.payout.length

  // Ship #159: group a section's transactions by year-month, sort groups
  // newest-first, sort rows within each group newest-first too. Returns
  // array of { monthKey, monthLabel, txs, total, count }.
  const groupByMonth = (txs: Transaction[]) => {
    const byKey = new Map<string, { monthKey: string; monthLabel: string; txs: Transaction[] }>()
    for (const tx of txs) {
      const d = new Date(tx.date)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      if (!byKey.has(monthKey)) byKey.set(monthKey, { monthKey, monthLabel, txs: [] })
      byKey.get(monthKey)!.txs.push(tx)
    }
    return Array.from(byKey.values())
      .map((g) => ({
        ...g,
        txs: g.txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        total: g.txs.reduce((s, t) => s + t.amount, 0),
        count: g.txs.length,
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description={`${unifiedTxCount} total transactions`}>
        {/* Ship #196 (Rodolfo-direct amendment to #193) — year+month
            popover picker. CalendarDays icon is now the interactive
            trigger (Rodolfo's literal expectation: "click on calendar
            icon to be able to select by year and month"). Single-picker
            design covers both quick-access (recent months) + historical
            (any year with data) in one UI. Filter applies uniformly
            across all 4 category sections per #193 scope. */}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 text-sm font-medium"
              data-tx-month-filter="trigger"
            >
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {monthFilterLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-3" align="end">
            <div className="space-y-3">
              {/* All time reset — banks the #193 default as a one-click
                  escape from any month filter regardless of year. */}
              <Button
                variant={monthFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  setMonthFilter('all')
                  setPickerOpen(false)
                }}
              >
                All time
              </Button>

              {/* Year navigation. Disabled at the bounds so Rodolfo
                  can't chase empty years forward/back. */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={availableYears.indexOf(pickerYear) <= 0}
                  onClick={() => {
                    const idx = availableYears.indexOf(pickerYear)
                    if (idx > 0) setPickerYear(availableYears[idx - 1])
                  }}
                  aria-label="Previous year"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span
                  className="text-sm font-semibold font-heading tabular-nums"
                  data-tx-year-filter={String(pickerYear)}
                >
                  {pickerYear}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={availableYears.indexOf(pickerYear) >= availableYears.length - 1}
                  onClick={() => {
                    const idx = availableYears.indexOf(pickerYear)
                    if (idx >= 0 && idx < availableYears.length - 1) setPickerYear(availableYears[idx + 1])
                  }}
                  aria-label="Next year"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* 12-month grid. Highlights the currently-selected month
                  when the year matches monthFilter's year. */}
              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_ABBREV.map((abbrev, i) => {
                  const monthKey = `${pickerYear}-${String(i + 1).padStart(2, '0')}`
                  const selected = monthFilter === monthKey
                  return (
                    <Button
                      key={abbrev}
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setMonthFilter(monthKey)
                        setPickerOpen(false)
                      }}
                      data-tx-month-button={monthKey}
                    >
                      {abbrev}
                    </Button>
                  )
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </PageHeader>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
          <KpiCard title="Total Commissions" value={fmt(totals.commission)} icon={DollarSign} iconColor="bg-emerald-500" />
        </motion.div>
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
          <KpiCard title="Total Memberships" value={fmt(totals.membership)} icon={CreditCard} iconColor="bg-blue-500" />
        </motion.div>
        <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
          <KpiCard title="Total Payouts" value={fmt(totals.payout)} icon={ArrowDownToLine} iconColor="bg-amber-500" />
        </motion.div>
        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
          <KpiCard title="Grand Total" value={fmt(grandTotal)} icon={Wallet} iconColor="bg-primary" />
        </motion.div>
      </div>

      {/* Category Sections */}
      {CATEGORIES.map((cat, catIdx) => (
        <motion.div key={cat.key} custom={catIdx + 4} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition">
            <CardHeader>
              <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <cat.icon className={cn('h-5 w-5', cat.headerColor)} />
                  <span>{cat.title}</span>
                  <span className="text-sm font-normal text-muted-foreground">({grouped[cat.key].length})</span>
                </div>
                <span className={cn('text-lg font-bold', cat.headerColor)}>
                  {fmt(sectionTotals[cat.key])}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Ship #194 (Rodolfo-direct amendment to #193) — smooth
                  month-switch transition. AnimatePresence wrapping the
                  section content with a key tied to monthFilter re-
                  triggers exit→enter on filter change. Applied
                  uniformly across all 4 category sections so the whole
                  page cross-fades coherently when the lookup flips. */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${cat.key}-${monthFilter}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
              {grouped[cat.key].length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No {cat.title.toLowerCase()} yet</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">ID</TableHead>
                        <TableHead className="font-semibold">Company</TableHead>
                        <TableHead className="font-semibold">Detail</TableHead>
                        {cat.isCommission && <TableHead className="font-semibold">Customer</TableHead>}
                        <TableHead className="font-semibold text-right">Amount</TableHead>
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupByMonth(grouped[cat.key]).flatMap((group) => {
                        const expanded = isMonthExpanded(cat.key, group.monthKey)
                        const colSpan = cat.isCommission ? 7 : 6
                        const headerRow = (
                          <TableRow
                            key={`${group.monthKey}-header`}
                            className="bg-muted/40 hover:bg-muted/60 cursor-pointer"
                            onClick={() => toggleMonth(cat.key, group.monthKey)}
                          >
                            <TableCell colSpan={colSpan} className="py-2">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  {expanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                                    {group.monthLabel}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {group.count} {group.count === 1 ? 'transaction' : 'transactions'}
                                  </span>
                                </div>
                                <span className={cn('text-sm font-bold', cat.headerColor)}>
                                  {fmt(group.total)}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                        if (!expanded) return [headerRow]
                        const rows = group.txs.map((tx) => {
                        // Row click routing (ship #146 bug fix on #143):
                        // 3-tier bridge to find matching project/lead. Also
                        // used by #147 to surface customer full name +
                        // address inline on commission rows.
                        let projectId: string | null = null
                        let resolvedAddress: string | null = null
                        if (tx.type === 'commission') {
                          if (tx.id.startsWith('mock-tx-')) {
                            projectId = tx.id.slice('mock-tx-'.length)
                            const sp = sentProjects.find((p) => p.id === projectId)
                            resolvedAddress = sp?.homeowner?.address ?? null
                          } else {
                            // Tier 2: sentProjects name+vendor_id match
                            // Ship #165: prefer contractor.vendor_id FK over
                            // company-name match; fall back to company for
                            // pre-#165 persisted entries.
                            const sp = sentProjects.find(
                              (p) =>
                                p.homeowner?.name === tx.customer &&
                                (p.contractor?.vendor_id
                                  ? p.contractor.vendor_id === tx.vendor_id
                                  : p.contractor?.company === tx.company),
                            )
                            if (sp) {
                              projectId = sp.id
                              resolvedAddress = sp.homeowner?.address ?? null
                            } else {
                              // Tier 3: MOCK_LEADS homeowner_name+vendor_id match
                              // Ship #165: prefer tx.vendor_id FK.
                              const vendor = tx.vendor_id
                                ? MOCK_VENDORS.find((v) => v.id === tx.vendor_id)
                                : MOCK_VENDORS.find((v) => v.company === tx.company)
                              const lead = mockLeads.find(
                                (l) =>
                                  l.homeowner_name === tx.customer &&
                                  (vendor ? l.vendor_id === vendor.id : true),
                              )
                              if (lead) {
                                projectId = lead.id
                                resolvedAddress = lead.address
                              } else if (tx.detail) {
                                // Tier 4 (ship #148): detail-string match
                                // against MOCK_LEADS.project. Apollo's dump
                                // showed Supabase seed has tx.customer=null
                                // so name-based tiers fail; tx.detail
                                // carries the project description. Strip
                                // "Commission on " prefix + fuzzy-match
                                // against the full project-name field.
                                const stripped = tx.detail.replace(/^Commission on /i, '').trim()
                                const leadByDetail = mockLeads.find(
                                  (l) =>
                                    l.project === stripped ||
                                    l.project.includes(stripped) ||
                                    stripped.includes(l.project.split('—')[0].trim()),
                                )
                                if (leadByDetail) {
                                  projectId = leadByDetail.id
                                  resolvedAddress = leadByDetail.address
                                }
                              }
                            }
                          }
                        }
                        // Ship #148: commission rows ALWAYS open
                        // ProjectDetailDialog with the source tx as
                        // transactionFallback. If bridge resolves,
                        // projectId drives full project-context rendering;
                        // if bridge fails, transactionFallback lets Dialog
                        // synthesize commission view from tx fields. No
                        // empty-shell route for commission rows anymore.
                        const _commRowSaleId = tx.type === 'commission' ? saleIdFromTxId(tx.id) : null
                        const _commRowPayments = _commRowSaleId ? (commissionPaymentsBySale[_commRowSaleId] ?? []) : []
                        const onRowClick = tx.type === 'commission'
                          ? tx.id.startsWith('comm-partial-')
                            ? () => {
                                const pid = tx.id.slice('comm-partial-'.length)
                                const sid = Object.keys(commissionPaymentsBySale).find(k =>
                                  (commissionPaymentsBySale[k] ?? []).some(p => p.id === pid)
                                ) ?? null
                                const resolved = sid ? (commissionPaymentsBySale[sid] ?? []) : []
                                setAdminPaymentsTarget(tx)
                                setAdminPaymentsPayments(resolved)
                              }
                            : _commRowPayments.length > 0
                              ? () => {
                                  setAdminPaymentsTarget(tx)
                                  setAdminPaymentsPayments(_commRowPayments)
                                }
                              : () => {
                                  setSelectedProjectId(projectId)
                                  setSelectedCommissionTx(tx)
                                }
                          : () => setSelectedTransaction(tx)
                        return (
                        <TableRow
                          key={tx.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={onRowClick}
                        >
                          <TableCell className="font-mono text-xs font-semibold">{formatTransactionId(tx.id, tx.type)}</TableCell>
                          <TableCell className="font-medium">{tx.company}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">{tx.detail}</TableCell>
                          {cat.isCommission && (
                            <TableCell className="text-sm">
                              <div className="font-medium text-foreground">{tx.customer || '—'}</div>
                              {resolvedAddress && (
                                <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[240px]">
                                  {resolvedAddress}
                                </div>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-semibold">{fmt(tx.amount)}</TableCell>
                          <TableCell className="text-muted-foreground">{fmtDate(tx.date)}</TableCell>
                          <TableCell>
                            {cat.isCommission ? (() => {
                              const saleId = saleIdFromTxId(tx.id)
                              const salePayments = saleId ? (commissionPaymentsBySale[saleId] ?? []) : []
                              const salePaid = salePayments.reduce((s, p) => s + p.amount, 0)
                              const saleRemaining = tx.amount - salePaid
                              const status = saleRemaining <= 0 ? 'paid' : salePaid > 0 ? 'partial' : 'pending'
                              return (
                                <button
                                  className="text-left"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    let saleId = saleIdFromTxId(tx.id)
                                    if (!saleId && tx.id.startsWith('comm-partial-')) {
                                      const pid = tx.id.slice('comm-partial-'.length)
                                      saleId = Object.keys(commissionPaymentsBySale).find(k =>
                                        (commissionPaymentsBySale[k] ?? []).some(p => p.id === pid)
                                      ) ?? null
                                    }
                                    const resolved = saleId ? (commissionPaymentsBySale[saleId] ?? []) : []
                                    setAdminPaymentsTarget(tx)
                                    setAdminPaymentsPayments(resolved)
                                  }}
                                >
                                  {status === 'paid' ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs cursor-pointer hover:opacity-80">
                                      <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                                    </Badge>
                                  ) : status === 'partial' ? (
                                    <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-xs cursor-pointer hover:opacity-80">
                                      <MinusCircle className="h-3 w-3 mr-1" /> Partial
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs cursor-pointer hover:opacity-80">
                                      <Clock className="h-3 w-3 mr-1" /> Unpaid
                                    </Badge>
                                  )}
                                </button>
                              )
                            })() : (
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                  STATUS_CONFIG[tx.status].className
                                )}
                              >
                                {STATUS_CONFIG[tx.status].label}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                        )
                      })
                      return [headerRow, ...rows]
                      })}
                      {/* Category Total Row */}
                      <TableRow className="bg-muted/30 border-t-2">
                        <TableCell colSpan={cat.isCommission ? 4 : 3} className="font-semibold text-right">
                          Total {cat.title}
                        </TableCell>
                        <TableCell className={cn('text-right font-bold text-base', cat.headerColor)}>
                          {fmt(sectionTotals[cat.key])}
                        </TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      ))}

      <ProjectDetailDialog
        open={!!selectedCommissionTx}
        onClose={() => {
          setSelectedCommissionTx(null)
          setSelectedProjectId(null)
        }}
        projectId={selectedProjectId}
        transactionFallback={selectedCommissionTx}
      />
      <TransactionDetailDialog
        open={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        transaction={selectedTransaction}
      />
      <AdminCommissionPaymentsDialog
        open={!!adminPaymentsTarget}
        onOpenChange={(open) => { if (!open) { setAdminPaymentsTarget(null); setAdminPaymentsPayments([]) } }}
        tx={adminPaymentsTarget}
        payments={adminPaymentsPayments}
      />
    </div>
  )
}
