import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  DollarSign,
  ArrowRight,
  BarChart3,
  ArrowUpDown,
} from 'lucide-react'
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
import { PageHeader } from '@/components/shared/page-header'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  MOCK_VENDORS,
  MOCK_SETTINGS,
} from '@/lib/mock-data'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { fetchAllClosedSales } from '@/lib/api/analytics'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import type { ClosedSale } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

const CHART_COLORS = ['#f59e0b', '#3b82f6', '#06b6d4', '#10b981', '#ef4444']

export default function RevenuePage() {
  // Phase 5: closed_sales fetched from Supabase at mount.
  const [closedSales, setClosedSales] = useState<ClosedSale[]>([])
  const refreshClosedSales = () => {
    fetchAllClosedSales()
      .then(setClosedSales)
      .catch((err) => console.error('[admin/revenue] fetch failed:', err))
  }
  useEffect(() => {
    refreshClosedSales()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useRefetchOnFocus(refreshClosedSales)

  // Mock-side merge: QA persona Mark-Sold writes to sentProjects (zustand,
  // not Supabase) so those sales never reach closed_sales. Admin should see
  // the full mock loop + real Supabase data side by side. Phase 2 admin-SoT
  // audit per kratos msg 1776725170680.
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const rehydrateProjects = useCallback(() => useProjectsStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateProjects)

  // Per-vendor commission % override (ship #130). Admin edits on
  // /admin/vendors write to this store; all revenue math ripples through
  // getVendorCommission so the commercial shape stays consistent.
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  const rehydrateModeration = useCallback(() => useAdminModerationStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateModeration)
  const resolveCommissionPct = useCallback(
    (id: string, defaultPct: number) => vendorCommissionOverrides[id] ?? defaultPct,
    [vendorCommissionOverrides],
  )

  // Reverse-map Supabase vendor UUIDs → MOCK_VENDORS entries for display
  // (profile wiring is a separate Tranche 2 item; vendor display data still
  // mock-sourced).
  const vendorByUuid = useMemo(() => {
    const m = new Map<string, typeof MOCK_VENDORS[number]>()
    for (const [mockId, uuid] of Object.entries(DEMO_VENDOR_UUID_BY_MOCK_ID)) {
      const v = MOCK_VENDORS.find((mv) => mv.id === mockId)
      if (v) m.set(uuid, v)
    }
    return m
  }, [])

  const vendorBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { company: string; totalRevenue: number; appShare: number; vendorShare: number; deals: number; subActive: boolean; commissionPct: number }
    >()

    // Seed with the 3 featured demo vendors (mapped via DEMO_VENDOR_UUID_BY_MOCK_ID)
    // so they render even with zero sales.
    for (const vendor of MOCK_VENDORS) {
      map.set(vendor.id, {
        company: vendor.company,
        totalRevenue: 0,
        appShare: 0,
        vendorShare: 0,
        deals: 0,
        subActive: vendor.status === 'active',
        commissionPct: resolveCommissionPct(vendor.id, vendor.commission_pct),
      })
    }

    // Aggregate closed sales against the mock-vendor keys via UUID reverse-lookup.
    for (const sale of closedSales) {
      const vendor = vendorByUuid.get(sale.vendor_id)
      const entry = vendor ? map.get(vendor.id) : undefined
      if (entry) {
        entry.totalRevenue += sale.sale_amount
        entry.appShare += sale.commission
        entry.vendorShare += sale.vendor_share
        entry.deals += 1
      }
    }

    // Mock-side merge: sentProjects with status=sold + saleAmount add to the
    // matching vendor by company name (mock vendors don't have a UUID bridge
    // — they're identified by contractor.company on the sent-project entry).
    // Dedupe safeguard: if a sentProject has been mirrored into closed_sales
    // (same vendor + same amount + same day), skip to avoid double-counting.
    for (const sp of sentProjects) {
      if (sp.status !== 'sold' || !sp.saleAmount || sp.saleAmount <= 0) continue
      const entry = Array.from(map.values()).find((v) => v.company === sp.contractor?.company)
      if (!entry) continue
      const commissionPct = entry.commissionPct / 100
      const platformFee = Math.round(sp.saleAmount * commissionPct)
      entry.totalRevenue += sp.saleAmount
      entry.appShare += platformFee
      entry.vendorShare += (sp.saleAmount - platformFee)
      entry.deals += 1
    }

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [closedSales, vendorByUuid, sentProjects, resolveCommissionPct])

  const chartData = vendorBreakdown.map((v) => ({
    name: v.company.length > 16 ? v.company.slice(0, 14) + '...' : v.company,
    revenue: v.totalRevenue,
    commission: v.appShare,
  }))

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" description="Per-vendor commission model breakdown and analytics" />

      {/* Model Callout */}
      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm border-amber-200 dark:border-amber-800/40 bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-medium">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 px-2 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">Custom %</span>
                <span className="text-foreground">Vendor Share</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 px-2 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">Per Vendor</span>
                <span className="text-foreground">BuildConnect Fee</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 items-center justify-center rounded-full bg-emerald-500 px-3 text-white text-xs font-bold">
                  ${MOCK_SETTINGS.subscription_fee}/mo
                </span>
                <span className="text-foreground">Subscription</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Revenue Chart */}
      <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Revenue per Vendor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `$${value.toLocaleString()}`,
                      name === 'revenue' ? 'Total Revenue' : 'Commission (15%)',
                    ]}
                    contentStyle={{
                      borderRadius: '0.75rem',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]} name="revenue">
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                  <Bar dataKey="commission" radius={[6, 6, 0, 0]} fill="#f59e0b" opacity={0.7} name="commission" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Total Revenue Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Revenue (All Vendors)</p>
                <p className="text-xl font-bold font-heading">${vendorBreakdown.reduce((s, v) => s + v.totalRevenue, 0).toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Platform Commission</p>
                <p className="text-xl font-bold font-heading text-amber-700 dark:text-amber-400">${vendorBreakdown.reduce((s, v) => s + v.appShare, 0).toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Vendor Earnings</p>
                <p className="text-xl font-bold font-heading text-blue-600 dark:text-blue-400">${vendorBreakdown.reduce((s, v) => s + v.vendorShare, 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Per-Vendor Breakdown Table */}
      <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Per-Vendor Revenue Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">
                    <span className="flex items-center gap-1">
                      Company
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-right">
                    <span className="flex items-center justify-end gap-1">
                      Total Revenue
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-right">Platform Fee</TableHead>
                  <TableHead className="font-semibold text-right">Vendor Share</TableHead>
                  <TableHead className="font-semibold text-center">Fee %</TableHead>
                  <TableHead className="font-semibold text-center">Closed Deals</TableHead>
                  <TableHead className="font-semibold text-center">Subscription</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorBreakdown.map((v) => (
                  <TableRow key={v.company}>
                    <TableCell className="font-medium">{v.company}</TableCell>
                    <TableCell className="text-right font-semibold">
                      ${v.totalRevenue.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-amber-700 dark:text-amber-400">
                      ${v.appShare.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-blue-600 dark:text-blue-400">
                      ${v.vendorShare.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">{v.deals}</TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                        {v.commissionPct}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          v.subActive
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        )}
                      >
                        {v.subActive ? 'Active' : 'Pending'}
                      </span>
                    </TableCell>
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
