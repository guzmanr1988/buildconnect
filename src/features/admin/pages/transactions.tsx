import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { DollarSign, CreditCard, Wallet, ArrowDownToLine, CheckCircle2, Clock } from 'lucide-react'
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
import type { Transaction, TransactionType, TransactionStatus } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

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

export default function TransactionsPage() {
  // Phase 5: transactions fetched from Supabase at mount.
  const [transactions, setTransactions] = useState<Transaction[]>([])
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

  const grouped = useMemo(() => {
    const result: Record<SectionKey, Transaction[]> = {
      commission_paid: [],
      commission_pending: [],
      membership: [],
      payout: [],
    }
    for (const tx of transactions) {
      if (tx.type === 'commission') {
        if (tx.status === 'paid') result.commission_paid.push(tx)
        else result.commission_pending.push(tx)
      } else if (tx.type === 'membership') {
        result.membership.push(tx)
      } else {
        result.payout.push(tx)
      }
    }
    for (const key of Object.keys(result) as SectionKey[]) {
      result[key].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }
    return result
  }, [transactions])

  const sectionTotals = useMemo(() => ({
    commission_paid: grouped.commission_paid.reduce((s, t) => s + t.amount, 0),
    commission_pending: grouped.commission_pending.reduce((s, t) => s + t.amount, 0),
    membership: grouped.membership.reduce((s, t) => s + t.amount, 0),
    payout: grouped.payout.reduce((s, t) => s + t.amount, 0),
  }), [grouped])

  const totals = useMemo(() => ({
    commission: transactions.filter((t) => t.type === 'commission').reduce((s, t) => s + t.amount, 0),
    membership: sectionTotals.membership,
    payout: sectionTotals.payout,
  }), [transactions, sectionTotals])

  const grandTotal = totals.commission + totals.membership + totals.payout

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description={`${transactions.length} total transactions`} />

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
                      {grouped[cat.key].map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{tx.id}</TableCell>
                          <TableCell className="font-medium">{tx.company}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">{tx.detail}</TableCell>
                          {cat.isCommission && (
                            <TableCell className="text-sm">{tx.customer || '—'}</TableCell>
                          )}
                          <TableCell className="text-right font-semibold">{fmt(tx.amount)}</TableCell>
                          <TableCell className="text-muted-foreground">{fmtDate(tx.date)}</TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                STATUS_CONFIG[tx.status].className
                              )}
                            >
                              {STATUS_CONFIG[tx.status].label}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
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
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
