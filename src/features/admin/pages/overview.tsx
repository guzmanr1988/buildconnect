import { useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/shared/kpi-card'
import {
  MOCK_VENDORS,
  MOCK_CLOSED_SALES,
  MOCK_TRANSACTIONS,
  MOCK_SETTINGS,
} from '@/lib/mock-data'
import type { AppSettings, TransactionType, TransactionStatus } from '@/types'

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

function txTypeBadge(type: TransactionType) {
  const map: Record<TransactionType, { label: string; className: string }> = {
    commission: {
      label: 'Commission',
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    membership: {
      label: 'Membership',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
    payout: {
      label: 'Payout',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    },
  }
  const cfg = map[type]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.className)}>
      {cfg.label}
    </span>
  )
}

function txStatusBadge(status: TransactionStatus) {
  const map: Record<TransactionStatus, { label: string; className: string }> = {
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
  const cfg = map[status]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.className)}>
      {cfg.label}
    </span>
  )
}

export default function OverviewPage() {
  const [settings, setSettings] = useState<AppSettings>({ ...MOCK_SETTINGS })

  const toggles: { key: keyof AppSettings; label: string; icon: React.ElementType }[] = [
    { key: 'maintenance_mode', label: 'Maintenance Mode', icon: Wrench },
    { key: 'ar_mode', label: 'AR Mode', icon: Eye },
    { key: 'phase2_enabled', label: 'Phase 2 Features', icon: Layers },
    { key: 'financing_enabled', label: 'Financing Options', icon: Banknote },
  ]

  const recentTransactions = [...MOCK_TRANSACTIONS]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const vendorPct = 85
  const platformPct = 15

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Overview" description="Platform performance at a glance" />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          },
        ].map((kpi, i) => (
          <motion.div key={kpi.title} custom={i} variants={fadeUp} initial="hidden" animate="visible">
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

      {/* Recent Transactions */}
      <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Company</TableHead>
                  <TableHead className="font-semibold">Detail</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{txTypeBadge(tx.type)}</TableCell>
                    <TableCell className="font-medium">{tx.company}</TableCell>
                    <TableCell className="text-muted-foreground">{tx.detail}</TableCell>
                    <TableCell className="text-right font-medium">${tx.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(tx.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>{txStatusBadge(tx.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
