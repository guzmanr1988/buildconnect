import { useMemo } from 'react'
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
  MOCK_VENDORS, MOCK_HOMEOWNERS, MOCK_CLOSED_SALES,
  MOCK_TRANSACTIONS, MOCK_SETTINGS,
} from '@/lib/mock-data'

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

  const data = useMemo(() => {
    const commissionTx = MOCK_TRANSACTIONS.filter((t) => t.type === 'commission')
    const membershipTx = MOCK_TRANSACTIONS.filter((t) => t.type === 'membership')
    const payoutTx = MOCK_TRANSACTIONS.filter((t) => t.type === 'payout')

    const totalGMV = MOCK_CLOSED_SALES.reduce((s, c) => s + c.sale_amount, 0)
    const totalCommissionRevenue = commissionTx.reduce((s, t) => s + t.amount, 0)
    const commissionPaid = commissionTx.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0)
    const commissionPending = commissionTx.filter((t) => t.status === 'pending').reduce((s, t) => s + t.amount, 0)
    const totalMembershipRevenue = membershipTx.reduce((s, t) => s + t.amount, 0)
    const totalPayouts = payoutTx.reduce((s, t) => s + t.amount, 0)
    const totalRevenue = totalCommissionRevenue + totalMembershipRevenue
    const netIncome = totalRevenue - totalPayouts

    const vendorBreakdown = MOCK_VENDORS.map((v) => {
      const sales = MOCK_CLOSED_SALES.filter((s) => s.vendor_id === v.id)
      const gmv = sales.reduce((s, c) => s + c.sale_amount, 0)
      const commission = sales.reduce((s, c) => s + c.commission, 0)
      const membership = MOCK_SETTINGS.subscription_fee
      return { company: v.company, name: v.name, commissionPct: v.commission_pct, gmv, commission, membership }
    })

    return {
      totalGMV, totalCommissionRevenue, commissionPaid, commissionPending,
      totalMembershipRevenue, totalPayouts, totalRevenue, netIncome,
      vendorBreakdown, closedDeals: MOCK_CLOSED_SALES.length,
      activeVendors: MOCK_VENDORS.filter((v) => v.status === 'active').length,
      totalVendors: MOCK_VENDORS.length,
      activeHomeowners: MOCK_HOMEOWNERS.filter((h) => h.status === 'active').length,
    }
  }, [])

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
