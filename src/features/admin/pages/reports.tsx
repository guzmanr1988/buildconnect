import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText, DollarSign, CreditCard, ArrowDownToLine, Building2,
  TrendingUp, Users, Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared/page-header'
import {
  MOCK_VENDORS, MOCK_HOMEOWNERS, MOCK_SETTINGS,
} from '@/lib/mock-data'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { fetchAllClosedSales, fetchAllTransactions } from '@/lib/api/analytics'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import type { ClosedSale, Transaction } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

export default function ReportsPage() {
  const year = new Date().getFullYear()

  // Phase 5: pull analytics from Supabase at mount.
  const [closedSales, setClosedSales] = useState<ClosedSale[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const refreshAnalytics = useCallback(() => {
    Promise.all([fetchAllClosedSales(), fetchAllTransactions()])
      .then(([cs, tx]) => { setClosedSales(cs); setTransactions(tx) })
      .catch((err) => console.error('[admin/reports] fetch failed:', err))
  }, [])
  useEffect(() => {
    refreshAnalytics()
  }, [refreshAnalytics])
  useRefetchOnFocus(refreshAnalytics)

  // Mock-side merge: Phase 2c admin-SoT per kratos msg 1776725610193.
  // QA persona Mark-Sold writes to zustand sentProjects; include those in
  // the reports aggregates so admin tax/accounting view is unified.
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const rehydrateProjects = useCallback(() => useProjectsStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateProjects)
  const mockSoldSales = useMemo(
    () => sentProjects.filter((p) => p.status === 'sold' && p.saleAmount && p.saleAmount > 0 && p.soldAt),
    [sentProjects],
  )

  // Per-vendor commission % override (ship #130).
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  const rehydrateModeration = useCallback(() => useAdminModerationStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateModeration)
  const resolveCommissionPct = useCallback(
    (id: string, defaultPct: number) => vendorCommissionOverrides[id] ?? defaultPct,
    [vendorCommissionOverrides],
  )

  // Reverse-map Supabase vendor UUIDs to MOCK_VENDORS mock-ids for the
  // per-vendor breakdown (vendor display data still mock-sourced;
  // profile wiring is separate Tranche 2).
  const vendorByUuid = useMemo(() => {
    const m = new Map<string, typeof MOCK_VENDORS[number]>()
    for (const [mockId, uuid] of Object.entries(DEMO_VENDOR_UUID_BY_MOCK_ID)) {
      const v = MOCK_VENDORS.find((mv) => mv.id === mockId)
      if (v) m.set(uuid, v)
    }
    return m
  }, [])

  const data = useMemo(() => {
    const commissionTx = transactions.filter((t) => t.type === 'commission')
    const membershipTx = transactions.filter((t) => t.type === 'membership')
    const payoutTx = transactions.filter((t) => t.type === 'payout')

    const mockGMV = mockSoldSales.reduce((s, p) => s + (p.saleAmount ?? 0), 0)
    const mockCommission = mockSoldSales.reduce((s, p) => {
      const v = MOCK_VENDORS.find((x) => x.company === p.contractor?.company)
      const pct = (v ? resolveCommissionPct(v.id, v.commission_pct) : 15) / 100
      return s + Math.round((p.saleAmount ?? 0) * pct)
    }, 0)

    const totalGMV = closedSales.reduce((s, c) => s + c.sale_amount, 0) + mockGMV
    const totalCommissionRevenue = commissionTx.reduce((s, t) => s + t.amount, 0) + mockCommission
    const commissionPaid = commissionTx.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0) + mockCommission
    const commissionPending = commissionTx.filter((t) => t.status === 'pending').reduce((s, t) => s + t.amount, 0)
    const totalMembershipRevenue = membershipTx.reduce((s, t) => s + t.amount, 0)
    const totalPayouts = payoutTx.reduce((s, t) => s + t.amount, 0)
    const totalRevenue = totalCommissionRevenue + totalMembershipRevenue
    const netIncome = totalRevenue - totalPayouts

    const vendorBreakdown = MOCK_VENDORS.map((v) => {
      const effectivePct = resolveCommissionPct(v.id, v.commission_pct)
      const uuid = DEMO_VENDOR_UUID_BY_MOCK_ID[v.id]
      const supabaseSales = uuid ? closedSales.filter((s) => s.vendor_id === uuid) : []
      const mockForVendor = mockSoldSales.filter((p) => p.contractor?.company === v.company)
      const supabaseGmv = supabaseSales.reduce((s, c) => s + c.sale_amount, 0)
      const supabaseCommission = supabaseSales.reduce((s, c) => s + c.commission, 0)
      const mockGmv = mockForVendor.reduce((s, p) => s + (p.saleAmount ?? 0), 0)
      const mockComm = mockForVendor.reduce((s, p) => s + Math.round((p.saleAmount ?? 0) * (effectivePct / 100)), 0)
      const membership = MOCK_SETTINGS.subscription_fee
      return {
        company: v.company,
        name: v.name,
        commissionPct: effectivePct,
        gmv: supabaseGmv + mockGmv,
        commission: supabaseCommission + mockComm,
        membership,
      }
    })

    return {
      totalGMV, totalCommissionRevenue, commissionPaid, commissionPending,
      totalMembershipRevenue, totalPayouts, totalRevenue, netIncome,
      vendorBreakdown, closedDeals: closedSales.length + mockSoldSales.length,
      activeVendors: MOCK_VENDORS.filter((v) => v.status === 'active').length,
      totalVendors: MOCK_VENDORS.length,
      activeHomeowners: MOCK_HOMEOWNERS.filter((h) => h.status === 'active').length,
    }
  }, [closedSales, transactions, mockSoldSales, resolveCommissionPct])

  // Suppress unused-import lint for vendorByUuid (kept for future use)
  void vendorByUuid

  const handlePrint = () => window.print()

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Annual financial reports for tax and accounting">
        <Button onClick={handlePrint} variant="outline" size="sm" className="gap-1.5 print:hidden">
          <Printer className="h-4 w-4" />
          Print Report
        </Button>
      </PageHeader>

      {/* Report Header */}
      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm border-2 border-primary/20">
          <CardContent className="p-6 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Building2 className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-bold font-heading">BuildConnect Inc.</h2>
            </div>
            <h3 className="text-lg font-semibold text-muted-foreground">Annual Financial Report — {year}</h3>
            <p className="text-xs text-muted-foreground">
              Prepared on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {' '} · Fiscal Year {year}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Executive Summary */}
      <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Gross Merchandise Value', value: fmt(data.totalGMV), color: 'text-foreground' },
                { label: 'Total Revenue', value: fmt(data.totalRevenue), color: 'text-emerald-700 dark:text-emerald-400' },
                { label: 'Total Payouts', value: fmt(data.totalPayouts), color: 'text-amber-700 dark:text-amber-400' },
                { label: 'Net Income', value: fmt(data.netIncome), color: 'text-primary' },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <p className={cn('text-lg font-bold font-heading', item.color)}>{item.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Revenue Breakdown */}
      <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              Revenue Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Revenue Source</TableHead>
                    <TableHead className="font-semibold text-right">Amount</TableHead>
                    <TableHead className="font-semibold text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Commission Revenue</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">{fmt(data.totalCommissionRevenue)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{data.totalRevenue > 0 ? ((data.totalCommissionRevenue / data.totalRevenue) * 100).toFixed(1) : 0}%</TableCell>
                  </TableRow>
                  <TableRow className="text-sm">
                    <TableCell className="pl-8 text-muted-foreground">— Collected</TableCell>
                    <TableCell className="text-right text-emerald-700 dark:text-emerald-400">{fmt(data.commissionPaid)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="text-sm">
                    <TableCell className="pl-8 text-muted-foreground">— Pending (Accounts Receivable)</TableCell>
                    <TableCell className="text-right text-amber-700 dark:text-amber-400">{fmt(data.commissionPending)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Membership / Subscription Revenue</TableCell>
                    <TableCell className="text-right font-semibold text-blue-600 dark:text-blue-400">{fmt(data.totalMembershipRevenue)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{data.totalRevenue > 0 ? ((data.totalMembershipRevenue / data.totalRevenue) * 100).toFixed(1) : 0}%</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/30 border-t-2">
                    <TableCell className="font-bold">Total Revenue</TableCell>
                    <TableCell className="text-right font-bold text-lg">{fmt(data.totalRevenue)}</TableCell>
                    <TableCell className="text-right font-semibold">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Expenses / Payouts */}
      <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownToLine className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              Expenses & Payouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Expense Category</TableHead>
                    <TableHead className="font-semibold text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Vendor Payouts</TableCell>
                    <TableCell className="text-right font-semibold text-amber-700 dark:text-amber-400">{fmt(data.totalPayouts)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/30 border-t-2">
                    <TableCell className="font-bold">Total Expenses</TableCell>
                    <TableCell className="text-right font-bold text-lg">{fmt(data.totalPayouts)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <Separator className="my-4" />

            <div className="flex items-center justify-between px-2">
              <span className="text-sm font-bold">Net Income (Revenue - Expenses)</span>
              <span className="text-xl font-bold font-heading text-primary">{fmt(data.netIncome)}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Per-Vendor Breakdown */}
      <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Vendor Revenue Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Vendor</TableHead>
                    <TableHead className="font-semibold text-center">Fee %</TableHead>
                    <TableHead className="font-semibold text-right">GMV</TableHead>
                    <TableHead className="font-semibold text-right">Commission</TableHead>
                    <TableHead className="font-semibold text-right">Membership</TableHead>
                    <TableHead className="font-semibold text-right">Total Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.vendorBreakdown.map((v) => (
                    <TableRow key={v.company}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{v.company}</p>
                          <p className="text-xs text-muted-foreground">{v.name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                          {v.commissionPct}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(v.gmv)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-700 dark:text-emerald-400">{fmt(v.commission)}</TableCell>
                      <TableCell className="text-right font-medium text-blue-600 dark:text-blue-400">{fmt(v.membership)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(v.commission + v.membership)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30 border-t-2">
                    <TableCell colSpan={2} className="font-bold">Totals</TableCell>
                    <TableCell className="text-right font-bold">{fmt(data.totalGMV)}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-700 dark:text-emerald-400">{fmt(data.totalCommissionRevenue)}</TableCell>
                    <TableCell className="text-right font-bold text-blue-600 dark:text-blue-400">{fmt(data.totalMembershipRevenue)}</TableCell>
                    <TableCell className="text-right font-bold text-lg">{fmt(data.totalRevenue)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Platform Metrics */}
      <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Platform Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: 'Closed Deals', value: data.closedDeals.toString() },
                { label: 'Active Vendors', value: data.activeVendors.toString() },
                { label: 'Total Vendors', value: data.totalVendors.toString() },
                { label: 'Active Homeowners', value: data.activeHomeowners.toString() },
                { label: 'Subscription Rate', value: `$${MOCK_SETTINGS.subscription_fee}/mo` },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
                  <p className="text-lg font-bold font-heading">{m.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Footer */}
      <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
        <div className="text-center text-xs text-muted-foreground py-4 border-t">
          <p>BuildConnect Inc. · Annual Financial Report · Fiscal Year {year}</p>
          <p className="mt-1">This report is generated for internal use and tax preparation purposes.</p>
          <p className="mt-1">Prepared by BuildConnect Platform · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </motion.div>
    </div>
  )
}
