import { useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/shared/kpi-card'
import {
  MOCK_VENDORS,
  MOCK_HOMEOWNERS,
  MOCK_CLOSED_SALES,
  MOCK_TRANSACTIONS,
  MOCK_SETTINGS,
} from '@/lib/mock-data'
import type { AppSettings } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

const totalGMV = MOCK_CLOSED_SALES.reduce((s, c) => s + c.sale_amount, 0)
const appRevenue = MOCK_CLOSED_SALES.reduce((s, c) => s + c.commission, 0)
const subscriptionRevenue = MOCK_VENDORS.length * MOCK_SETTINGS.subscription_fee
const activeVendors = MOCK_VENDORS.filter((v) => v.status === 'active').length
const activeHomeowners = MOCK_HOMEOWNERS.filter((h) => h.status === 'active').length

export default function OverviewPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<AppSettings>({ ...MOCK_SETTINGS })

  const toggles: { key: keyof AppSettings; label: string; icon: React.ElementType }[] = [
    { key: 'maintenance_mode', label: 'Maintenance Mode', icon: Wrench },
    { key: 'ar_mode', label: 'AR Mode', icon: Eye },
    { key: 'phase2_enabled', label: 'Phase 2 Features', icon: Layers },
    { key: 'financing_enabled', label: 'Financing Options', icon: Banknote },
  ]

  const vendorPct = 85
  const platformPct = 15

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
        {/* Revenue Split */}
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Revenue Split
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Vendor Share</span>
                <span className="font-semibold">{vendorPct}%</span>
              </div>
              <div className="relative h-4 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${vendorPct}%` }}
                />
                <div
                  className="absolute inset-y-0 right-0 rounded-full bg-amber-500 transition-all"
                  style={{ width: `${platformPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">Vendor ({vendorPct}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Platform ({platformPct}%)</span>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center text-sm">
                <span className="text-muted-foreground">
                  Total GMV <span className="font-semibold text-foreground">${totalGMV.toLocaleString()}</span>
                  {' '}&middot;{' '}
                  Platform Earnings <span className="font-semibold text-amber-600 dark:text-amber-400">${appRevenue.toLocaleString()}</span>
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
                  color: 'text-emerald-600 dark:text-emerald-400',
                  bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40',
                  icon: CheckCircle2,
                  iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
                },
                {
                  label: 'Pending Commissions',
                  total: MOCK_TRANSACTIONS.filter((t) => t.type === 'commission' && t.status === 'pending').reduce((s, t) => s + t.amount, 0),
                  count: MOCK_TRANSACTIONS.filter((t) => t.type === 'commission' && t.status === 'pending').length,
                  color: 'text-amber-600 dark:text-amber-400',
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
                  color: 'text-amber-600 dark:text-amber-400',
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
