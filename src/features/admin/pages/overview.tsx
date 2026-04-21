import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
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
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
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
}

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
      const vendor = MOCK_VENDORS.find((v) => v.company === p.contractor?.company)
      const pct = (vendor ? resolveCommissionPct(vendor.id, vendor.commission_pct) : 15) / 100
      return s + Math.round((p.saleAmount ?? 0) * pct)
    }, 0)
    return supabaseComm + mockComm
  }, [closedSales, mockSoldSales, resolveCommissionPct])

  // Synthesize mock commission rows for the transaction-totals card so
  // Paid-Commissions + GMV stay visually aligned. Effective commission_pct
  // honored per vendor.
  const mockCommissions = useMemo<Transaction[]>(() => {
    return mockSoldSales.map((p) => {
      const vendor = MOCK_VENDORS.find((v) => v.company === p.contractor?.company)
      const pct = (vendor ? resolveCommissionPct(vendor.id, vendor.commission_pct) : 15) / 100
      return {
        id: `mock-tx-${p.id}`,
        type: 'commission',
        status: 'paid',
        company: p.contractor?.company ?? 'Unknown vendor',
        detail: p.item.serviceName,
        customer: p.homeowner?.name,
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
                    <RechartsTooltip
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = {
                          commissionsPaid: 'Commissions Paid',
                          pendingCommissions: 'Pending Commissions',
                          memberships: 'Memberships',
                          payouts: 'Payouts',
                        }
                        return [`$${value.toLocaleString()}`, labels[name] || name]
                      }}
                      contentStyle={{
                        borderRadius: '0.75rem',
                        border: '1px solid hsl(var(--border))',
                        backgroundColor: 'hsl(var(--popover))',
                        color: 'hsl(var(--popover-foreground))',
                        fontSize: '12px',
                        padding: '8px 12px',
                      }}
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                    />
                    <Bar dataKey="commissionsPaid" stackId="tx" fill="url(#overviewCommPaidGrad)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pendingCommissions" stackId="tx" fill="url(#overviewCommPendGrad)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="memberships" stackId="tx" fill="url(#overviewMemGrad)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="payouts" stackId="tx" fill="url(#overviewPayoutGrad)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Category totals + percentages */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                    <span className="text-muted-foreground">Commissions Paid</span>
                  </span>
                  <span className="font-semibold">${transactionCategoryTotals.commissionsPaid.toLocaleString()} <span className="text-muted-foreground">({transactionCategoryTotals.pctCommissionsPaid}%)</span></span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                    <span className="text-muted-foreground">Pending Commissions</span>
                  </span>
                  <span className="font-semibold">${transactionCategoryTotals.pendingCommissions.toLocaleString()} <span className="text-muted-foreground">({transactionCategoryTotals.pctPendingCommissions}%)</span></span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                    <span className="text-muted-foreground">Memberships</span>
                  </span>
                  <span className="font-semibold">${transactionCategoryTotals.memberships.toLocaleString()} <span className="text-muted-foreground">({transactionCategoryTotals.pctMemberships}%)</span></span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-purple-500" />
                    <span className="text-muted-foreground">Payouts</span>
                  </span>
                  <span className="font-semibold">${transactionCategoryTotals.payouts.toLocaleString()} <span className="text-muted-foreground">({transactionCategoryTotals.pctPayouts}%)</span></span>
                </div>
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
    </div>
  )
}
