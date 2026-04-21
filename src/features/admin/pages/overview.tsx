import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Users,
  Activity,
  Wrench,
  Eye,
  Layers,
  Banknote,
  ArrowUpRight,
  Home,
  CheckCircle2,
  Clock,
  BarChart3,
  RotateCcw,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/shared/kpi-card'
import {
  MOCK_VENDORS,
  MOCK_HOMEOWNERS,
  MOCK_SETTINGS,
} from '@/lib/mock-data'
import { fetchAllClosedSales, fetchAllTransactions } from '@/lib/api/analytics'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import type { AppSettings, ClosedSale, Transaction } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

// Vendors + homeowners still mock-backed — Phase 5 scope is analytics aggregation
// against real closed_sales + transactions + leads, NOT vendor/homeowner profile
// wiring (that's a separate per-feature Tranche 2 item).
const subscriptionRevenue = MOCK_VENDORS.length * MOCK_SETTINGS.subscription_fee
const activeVendors = MOCK_VENDORS.filter((v) => v.status === 'active').length
const activeHomeowners = MOCK_HOMEOWNERS.filter((h) => h.status === 'active').length

export default function OverviewPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<AppSettings>({ ...MOCK_SETTINGS })

  // Phase 5: admin analytics fetched from Supabase at mount (seeded by
  // scripts/seed-phase5-analytics.mjs). Fall back to empty arrays on
  // fetch failure so the page still renders — admin sees zeros-everywhere
  // instead of a blank page, matching "honest about DB state" posture.
  const [closedSales, setClosedSales] = useState<ClosedSale[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const refreshAnalytics = () => {
    Promise.all([fetchAllClosedSales(), fetchAllTransactions()])
      .then(([cs, tx]) => {
        setClosedSales(cs)
        setTransactions(tx)
      })
      .catch((err) => console.error('[admin/overview] analytics fetch failed:', err))
  }
  useEffect(() => {
    refreshAnalytics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useRefetchOnFocus(refreshAnalytics)

  // Mock-side merge: QA persona Mark-Sold writes to sentProjects (zustand,
  // not Supabase). Include mock-originated sold projects in GMV/App-Revenue
  // and synthesize commission rows for the transaction-totals card. Phase 2b
  // admin-SoT per kratos msg 1776725252468.
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  // Ship #192 — admin visibility of reschedule activity. Selector
  // returns the raw map (stable reference under reducer writes);
  // derivation into sorted list happens in render body.
  const rescheduleRequestsMap = useProjectsStore((s) => s.rescheduleRequestsByLead)
  const rehydrateProjects = useCallback(() => useProjectsStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateProjects)

  // Per-vendor commission % override (ship #130).
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  const rehydrateModeration = useCallback(() => useAdminModerationStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateModeration)
  const resolveCommissionPct = useCallback(
    (id: string, defaultPct: number) => vendorCommissionOverrides[id] ?? defaultPct,
    [vendorCommissionOverrides],
  )

  const mockSoldSales = useMemo(() => {
    return sentProjects.filter((p) => p.status === 'sold' && p.saleAmount && p.saleAmount > 0 && p.soldAt)
  }, [sentProjects])

  const totalGMV = useMemo(() => {
    const supabaseGMV = closedSales.reduce((s, c) => s + c.sale_amount, 0)
    const mockGMV = mockSoldSales.reduce((s, p) => s + (p.saleAmount ?? 0), 0)
    return supabaseGMV + mockGMV
  }, [closedSales, mockSoldSales])
  const appRevenue = useMemo(() => {
    const supabaseComm = closedSales.reduce((s, c) => s + c.commission, 0)
    // Use each vendor's effective commission_pct (admin override or default);
    // fall back to 15% if the vendor can't be resolved by company name.
    const mockComm = mockSoldSales.reduce((s, p) => {
      // Ship #165: prefer contractor.vendor_id FK over company-name match.
      const vendor = p.contractor?.vendor_id
        ? MOCK_VENDORS.find((v) => v.id === p.contractor!.vendor_id)
        : MOCK_VENDORS.find((v) => v.company === p.contractor?.company)
      const pct = (vendor ? resolveCommissionPct(vendor.id, vendor.commission_pct) : 15) / 100
      return s + Math.round((p.saleAmount ?? 0) * pct)
    }, 0)
    return supabaseComm + mockComm
  }, [closedSales, mockSoldSales, resolveCommissionPct])

  // Synthesize mock commission rows for the transaction-totals card so
  // Paid-Commissions + GMV stay visually aligned. Effective commission_pct
  // honored per vendor.
  const mockCommissions = useMemo<Transaction[]>(() => {
    return mockSoldSales.map((p): Transaction => {
      // Ship #165: prefer contractor.vendor_id FK over company-name match.
      const vendor = p.contractor?.vendor_id
        ? MOCK_VENDORS.find((v) => v.id === p.contractor!.vendor_id)
        : MOCK_VENDORS.find((v) => v.company === p.contractor?.company)
      const pct = (vendor ? resolveCommissionPct(vendor.id, vendor.commission_pct) : 15) / 100
      return {
        id: `mock-tx-${p.id}`,
        type: 'commission',
        status: 'paid',
        vendor_id: p.contractor?.vendor_id ?? vendor?.id ?? '',
        company: p.contractor?.company ?? 'Unknown vendor',
        detail: p.item.serviceName,
        customer: p.homeowner?.name ?? '',
        amount: Math.round((p.saleAmount ?? 0) * pct),
        date: p.soldAt!,
      }
    })
  }, [mockSoldSales, resolveCommissionPct])
  const MOCK_TRANSACTIONS = useMemo(() => {
    const supabaseIds = new Set(transactions.map((t) => t.id))
    return [...transactions, ...mockCommissions.filter((t) => !supabaseIds.has(t.id))]
  }, [transactions, mockCommissions])

  const toggles: { key: keyof AppSettings; label: string; icon: React.ElementType }[] = [
    { key: 'maintenance_mode', label: 'Maintenance Mode', icon: Wrench },
    { key: 'ar_mode', label: 'AR Mode', icon: Eye },
    { key: 'phase2_enabled', label: 'Phase 2 Features', icon: Layers },
    { key: 'financing_enabled', label: 'Financing Options', icon: Banknote },
  ]

  // 4-category transactions chart data (ship #158): Commissions Paid /
  // Pending Commissions / Memberships / Payouts by last-6-months. Replaces
  // the prior flat-85/15 Revenue Split which was misleading because per-
  // vendor commission_pct varies.
  const transactionChartData = useMemo(() => {
    const now = new Date()
    const months: {
      month: string
      commissionsPaid: number
      pendingCommissions: number
      memberships: number
      payouts: number
    }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const inRange = (iso: string) => {
        const t = new Date(iso).getTime()
        return t >= d.getTime() && t < end.getTime()
      }
      const monthTxs = MOCK_TRANSACTIONS.filter((t) => inRange(t.date))
      months.push({
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        commissionsPaid: monthTxs.filter((t) => t.type === 'commission' && t.status === 'paid').reduce((s, t) => s + t.amount, 0),
        pendingCommissions: monthTxs.filter((t) => t.type === 'commission' && t.status === 'pending').reduce((s, t) => s + t.amount, 0),
        memberships: monthTxs.filter((t) => t.type === 'membership').reduce((s, t) => s + t.amount, 0),
        payouts: monthTxs.filter((t) => t.type === 'payout').reduce((s, t) => s + t.amount, 0),
      })
    }
    return months
  }, [MOCK_TRANSACTIONS])

  const transactionCategoryTotals = useMemo(() => {
    const allTotal = transactionChartData.reduce((s, m) => s + m.commissionsPaid + m.pendingCommissions + m.memberships + m.payouts, 0)
    const by = transactionChartData.reduce(
      (acc, m) => ({
        commissionsPaid: acc.commissionsPaid + m.commissionsPaid,
        pendingCommissions: acc.pendingCommissions + m.pendingCommissions,
        memberships: acc.memberships + m.memberships,
        payouts: acc.payouts + m.payouts,
      }),
      { commissionsPaid: 0, pendingCommissions: 0, memberships: 0, payouts: 0 },
    )
    const pct = (n: number) => (allTotal > 0 ? Math.round((n / allTotal) * 100) : 0)
    return {
      ...by,
      allTotal,
      pctCommissionsPaid: pct(by.commissionsPaid),
      pctPendingCommissions: pct(by.pendingCommissions),
      pctMemberships: pct(by.memberships),
      pctPayouts: pct(by.payouts),
    }
  }, [transactionChartData])

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Overview" description="Platform performance at a glance" />

      {/* KPI Row */}
      <div className="kpi-grid grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
        {[
          {
            title: 'Total GMV',
            value: `$${totalGMV.toLocaleString()}`,
            change: '+12.4% vs last month',
            trend: 'up' as const,
            icon: DollarSign,
            iconColor: 'bg-emerald-500',
          },
          {
            title: 'App Revenue (15%)',
            value: `$${appRevenue.toLocaleString()}`,
            change: '+8.2% vs last month',
            trend: 'up' as const,
            icon: TrendingUp,
            iconColor: 'bg-amber-500',
          },
          {
            title: 'Subscription Revenue',
            value: `$${subscriptionRevenue.toLocaleString()}`,
            change: `${MOCK_VENDORS.length} vendors`,
            trend: 'up' as const,
            icon: CreditCard,
            iconColor: 'bg-blue-500',
          },
          {
            title: 'Active Vendors',
            value: activeVendors.toString(),
            change: `${MOCK_VENDORS.length} total`,
            trend: 'up' as const,
            icon: Users,
            iconColor: 'bg-violet-500',
            link: '/admin/vendors',
          },
          {
            title: 'Active Homeowners',
            value: activeHomeowners.toString(),
            change: `${MOCK_HOMEOWNERS.length} total`,
            trend: 'up' as const,
            icon: Home,
            iconColor: 'bg-cyan-500',
            link: '/admin/homeowners',
          },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.title}
            custom={i}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            onClick={kpi.link ? () => navigate(kpi.link!) : undefined}
            className={kpi.link ? 'cursor-pointer' : ''}
          >
            <KpiCard {...kpi} />
          </motion.div>
        ))}
      </div>

      {/* Revenue Split + Platform Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transactions Breakdown — 4-category stacked bar chart, last 6 months */}
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Transactions Breakdown
              </CardTitle>
              <p className="text-xs text-muted-foreground">Last 6 months · ${transactionCategoryTotals.allTotal.toLocaleString()} total</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={transactionChartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="overviewCommPaidGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.55} />
                      </linearGradient>
                      <linearGradient id="overviewCommPendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.55} />
                      </linearGradient>
                      <linearGradient id="overviewMemGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.55} />
                      </linearGradient>
                      <linearGradient id="overviewPayoutGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity={0.55} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                    {/* Tooltip removed per kratos msg 1776751586723 —
                        pills below chart already convey the breakdown. */}
                    <Bar dataKey="commissionsPaid" stackId="tx" fill="url(#overviewCommPaidGrad)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pendingCommissions" stackId="tx" fill="url(#overviewCommPendGrad)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="memberships" stackId="tx" fill="url(#overviewMemGrad)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="payouts" stackId="tx" fill="url(#overviewPayoutGrad)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Category totals — compact pills, readable text (ship #161:
                  font bumped 10px → 12px per Rodolfo; pill shape preserved). */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t text-[12px]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Paid</span>
                  <span className="text-muted-foreground">${transactionCategoryTotals.commissionsPaid.toLocaleString()} · {transactionCategoryTotals.pctCommissionsPaid}%</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-amber-700 dark:text-amber-400 font-semibold">Pending</span>
                  <span className="text-muted-foreground">${transactionCategoryTotals.pendingCommissions.toLocaleString()} · {transactionCategoryTotals.pctPendingCommissions}%</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-blue-700 dark:text-blue-400 font-semibold">Memberships</span>
                  <span className="text-muted-foreground">${transactionCategoryTotals.memberships.toLocaleString()} · {transactionCategoryTotals.pctMemberships}%</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1">
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                  <span className="text-purple-700 dark:text-purple-400 font-semibold">Payouts</span>
                  <span className="text-muted-foreground">${transactionCategoryTotals.payouts.toLocaleString()} · {transactionCategoryTotals.pctPayouts}%</span>
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Platform Health */}
        <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Platform Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {toggles.map((t) => {
                  const IconComp = t.icon
                  return (
                    <div key={t.key} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-muted p-2">
                          <IconComp className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">{t.label}</span>
                      </div>
                      <Switch
                        aria-label={t.label}
                        checked={settings[t.key] as boolean}
                        onCheckedChange={(val: boolean) =>
                          setSettings((prev) => ({ ...prev, [t.key]: val }))
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Transaction Totals */}
      <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  label: 'Paid Commissions',
                  total: MOCK_TRANSACTIONS.filter((t) => t.type === 'commission' && t.status === 'paid').reduce((s, t) => s + t.amount, 0),
                  count: MOCK_TRANSACTIONS.filter((t) => t.type === 'commission' && t.status === 'paid').length,
                  color: 'text-emerald-700 dark:text-emerald-400',
                  bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40',
                  icon: CheckCircle2,
                  iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
                },
                {
                  label: 'Pending Commissions',
                  total: MOCK_TRANSACTIONS.filter((t) => t.type === 'commission' && t.status === 'pending').reduce((s, t) => s + t.amount, 0),
                  count: MOCK_TRANSACTIONS.filter((t) => t.type === 'commission' && t.status === 'pending').length,
                  color: 'text-amber-700 dark:text-amber-400',
                  bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40',
                  icon: Clock,
                  iconBg: 'bg-amber-100 dark:bg-amber-900/40',
                },
                {
                  label: 'Memberships',
                  total: MOCK_TRANSACTIONS.filter((t) => t.type === 'membership').reduce((s, t) => s + t.amount, 0),
                  count: MOCK_TRANSACTIONS.filter((t) => t.type === 'membership').length,
                  color: 'text-blue-600 dark:text-blue-400',
                  bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40',
                  icon: CreditCard,
                  iconBg: 'bg-blue-100 dark:bg-blue-900/40',
                },
                {
                  label: 'Payouts',
                  total: MOCK_TRANSACTIONS.filter((t) => t.type === 'payout').reduce((s, t) => s + t.amount, 0),
                  count: MOCK_TRANSACTIONS.filter((t) => t.type === 'payout').length,
                  color: 'text-amber-700 dark:text-amber-400',
                  bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40',
                  icon: Banknote,
                  iconBg: 'bg-amber-100 dark:bg-amber-900/40',
                },
              ].map((cat) => (
                <div key={cat.label} className={cn('rounded-lg border px-4 py-3 flex items-center gap-3', cat.bg)}>
                  <div className={cn('rounded-full p-1.5', cat.iconBg)}>
                    <cat.icon className={cn('h-4 w-4', cat.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{cat.label}</p>
                    <p className={cn('text-lg font-bold font-heading leading-tight', cat.color)}>
                      ${cat.total.toLocaleString()}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{cat.count} txns</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Ship #192 — reschedule activity visibility. Per Rodolfo ship
          #191 spec "make sure that this activity is also shown on admin
          side where the appointment lands". Reads rescheduleRequestsByLead
          from projects-store and surfaces the 8 most recent entries
          sorted by most-recent action (resolvedAt for closed, requestedAt
          for pending). Status color-coded to match the homeowner/vendor
          banner palette (amber = awaiting, emerald = approved, red =
          rejected). Empty-state hidden — no noise when there's nothing
          to show. */}
      {(() => {
        const entries = Object.entries(rescheduleRequestsMap).map(([leadId, req]) => ({
          leadId,
          req,
          timestamp: req.resolvedAt ?? req.requestedAt,
        }))
        if (entries.length === 0) return null
        entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        const recent = entries.slice(0, 8)
        return (
          <motion.div custom={8} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold font-heading flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    Reschedule Activity
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    {entries.length} total
                  </span>
                </div>
                <div className="space-y-2">
                  {recent.map(({ leadId, req, timestamp }) => {
                    const statusLabel =
                      req.status === 'pending'
                        ? (req.requestedBy === 'homeowner' ? 'Homeowner proposed' : 'Vendor proposed')
                        : req.status === 'approved'
                          ? 'Approved'
                          : 'Kept original'
                    const statusClasses =
                      req.status === 'pending'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                        : req.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    return (
                      <div
                        key={leadId + '-' + timestamp}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', statusClasses)}>
                            {statusLabel}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">
                              Lead {leadId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {req.proposedDate} · {req.proposedTime}
                              {req.originalDate && req.originalTime && (
                                <span className="ml-1.5">
                                  (was {req.originalDate} · {req.originalTime})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {new Date(timestamp).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )
      })()}
    </div>
  )
}
