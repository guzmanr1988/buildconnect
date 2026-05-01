import { useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { FileText, DollarSign, ArrowDownToLine, Building2, TrendingUp, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared/page-header'
import { MOCK_CLOSED_SALES, MOCK_SETTINGS, MOCK_VENDORS } from '@/lib/mock-data'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useCommissionPaymentsStore } from '@/stores/commission-payments-store'
import { useVendorScope } from '@/lib/vendor-scope'
import type { ClosedSale } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

export default function VendorReportsPage() {
  const year = new Date().getFullYear()
  const { vendorId: VENDOR_ID } = useVendorScope()
  const vendor = MOCK_VENDORS.find((v) => v.id === VENDOR_ID) ?? MOCK_VENDORS[0]

  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  const commPct = vendorCommissionOverrides[VENDOR_ID] ?? vendor.commission_pct
  const vendorPct = 100 - commPct

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

  const commissionPaymentsBySale = useCommissionPaymentsStore((s) => s.paymentsBySale)

  const data = useMemo(() => {
    const totalSales = sales.reduce((s, c) => s + c.sale_amount, 0)
    const totalCommissionOwed = sales.reduce((s, c) => s + c.commission, 0)
    const totalVendorShare = sales.reduce((s, c) => s + c.vendor_share, 0)

    let totalPaidToBC = 0
    for (const sale of sales) {
      const payments = commissionPaymentsBySale[sale.id] ?? []
      if (payments.length > 0) {
        totalPaidToBC += payments.reduce((s, p) => s + p.amount, 0)
      } else if (sale.commission_paid) {
        totalPaidToBC += sale.commission
      }
    }
    const totalRemainingToBC = totalCommissionOwed - totalPaidToBC
    const membershipFee = MOCK_SETTINGS.subscription_fee

    const saleRows = [...sales]
      .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
      .map((sale) => {
        const payments = commissionPaymentsBySale[sale.id] ?? []
        const storePaid = payments.reduce((s, p) => s + p.amount, 0)
        const paid = storePaid > 0 ? storePaid : sale.commission_paid ? sale.commission : 0
        const remaining = sale.commission - paid
        const status: 'paid' | 'partial' | 'pending' = remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending'
        return { sale, paid, remaining, status }
      })

    return {
      totalSales,
      totalCommissionOwed,
      totalVendorShare,
      totalPaidToBC,
      totalRemainingToBC,
      membershipFee,
      saleRows,
      closedDeals: sales.length,
      commissionPct: commPct,
      vendorPct,
    }
  }, [sales, commissionPaymentsBySale, commPct, vendorPct])

  const handlePrint = () => window.print()

  return (
    <div className="space-y-6">
      <PageHeader title="Tax Reports" description="Annual financial summary for tax purposes">
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
              <h2 className="text-xl font-bold font-heading">{vendor.company}</h2>
            </div>
            <h3 className="text-lg font-semibold text-muted-foreground">Annual Tax Report — {year}</h3>
            <p className="text-xs text-muted-foreground">
              Prepared on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {' '} · Fiscal Year {year}
            </p>
            <p className="text-xs text-muted-foreground">
              BuildConnect Commission Rate: <span className="font-semibold text-foreground">{data.commissionPct}%</span>
              {' '} · Your Revenue Share: <span className="font-semibold text-foreground">{data.vendorPct}%</span>
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Summary */}
      <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Annual Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Total Sales Volume', value: fmt(data.totalSales), color: 'text-foreground' },
                { label: 'Your Revenue Share', value: fmt(data.totalVendorShare), color: 'text-emerald-700 dark:text-emerald-400' },
                { label: 'Commission Owed to BC', value: fmt(data.totalCommissionOwed), color: 'text-amber-700 dark:text-amber-400' },
                { label: 'Commission Paid to BC', value: fmt(data.totalPaidToBC), color: 'text-sky-700 dark:text-sky-400' },
                { label: 'Commission Remaining', value: fmt(data.totalRemainingToBC), color: data.totalRemainingToBC > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400' },
                { label: 'Closed Deals', value: data.closedDeals.toString(), color: 'text-foreground' },
              ].map((item) => (
                <div key={item.label} className="text-center rounded-lg bg-muted/30 p-3">
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
                    <TableHead className="font-semibold">Category</TableHead>
                    <TableHead className="font-semibold text-right">Amount</TableHead>
                    <TableHead className="font-semibold text-right">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Gross Sales Revenue</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(data.totalSales)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">Total project value</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-muted-foreground">— BuildConnect Commission ({data.commissionPct}%)</TableCell>
                    <TableCell className="text-right text-amber-700 dark:text-amber-400">({fmt(data.totalCommissionOwed)})</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">Platform fee</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/30 border-t-2">
                    <TableCell className="font-bold">Your Net Revenue ({data.vendorPct}%)</TableCell>
                    <TableCell className="text-right font-bold text-lg text-emerald-700 dark:text-emerald-400">{fmt(data.totalVendorShare)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm font-semibold">Reportable income</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Commission Payment Status */}
      <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownToLine className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              Commission Payment Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Project</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold text-right">Sale Amount</TableHead>
                    <TableHead className="font-semibold text-right">BC Commission</TableHead>
                    <TableHead className="font-semibold text-right">Paid</TableHead>
                    <TableHead className="font-semibold text-right">Remaining</TableHead>
                    <TableHead className="font-semibold text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.saleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">No closed sales yet</TableCell>
                    </TableRow>
                  ) : (
                    data.saleRows.map(({ sale, paid, remaining, status }) => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium max-w-[140px] truncate">{sale.project || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{sale.homeowner_name}</TableCell>
                        <TableCell className="text-right">{fmt(sale.sale_amount)}</TableCell>
                        <TableCell className="text-right text-amber-700 dark:text-amber-400">{fmt(sale.commission)}</TableCell>
                        <TableCell className="text-right text-emerald-700 dark:text-emerald-400">{fmt(paid)}</TableCell>
                        <TableCell className={cn('text-right font-medium', remaining > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400')}>
                          {fmt(remaining)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            status === 'paid'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : status === 'partial'
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                          )}>
                            {status === 'paid' ? 'Paid' : status === 'partial' ? 'Partial' : 'Pending'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {data.saleRows.length > 0 && (
                    <TableRow className="bg-muted/30 border-t-2">
                      <TableCell colSpan={3} className="font-bold">Totals</TableCell>
                      <TableCell className="text-right font-bold text-amber-700 dark:text-amber-400">{fmt(data.totalCommissionOwed)}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-700 dark:text-emerald-400">{fmt(data.totalPaidToBC)}</TableCell>
                      <TableCell className={cn('text-right font-bold', data.totalRemainingToBC > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400')}>{fmt(data.totalRemainingToBC)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <Separator className="my-4" />

            <div className="flex items-center justify-between px-2">
              <span className="text-sm font-bold">Outstanding Balance to BuildConnect</span>
              <span className={cn('text-xl font-bold font-heading', data.totalRemainingToBC > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400')}>
                {fmt(data.totalRemainingToBC)}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Membership */}
      <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Membership & Platform Fees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Fee Type</TableHead>
                    <TableHead className="font-semibold text-right">Monthly</TableHead>
                    <TableHead className="font-semibold text-right">Annual Estimate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">BuildConnect Membership</TableCell>
                    <TableCell className="text-right text-blue-600 dark:text-blue-400">{fmt(data.membershipFee)}</TableCell>
                    <TableCell className="text-right font-semibold text-blue-600 dark:text-blue-400">{fmt(data.membershipFee * 12)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Footer */}
      <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
        <div className="text-center text-xs text-muted-foreground py-4 border-t">
          <p>{vendor.company} · Annual Tax Report · Fiscal Year {year}</p>
          <p className="mt-1">Generated by BuildConnect Platform for vendor tax and accounting purposes.</p>
          <p className="mt-1">Prepared on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </motion.div>
    </div>
  )
}
