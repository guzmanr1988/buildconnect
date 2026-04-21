import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useProjectsStore } from '@/stores/projects-store'
import { MOCK_TRANSACTIONS, MOCK_LEADS, MOCK_VENDORS } from '@/lib/mock-data'
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
  // In-place project-detail Dialog (ship #140): opens on same surface
  // without navigating away.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  // Transaction-detail Dialog (ship #143) for membership + payout rows.
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
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

  const mockSoldTransactions = useMemo<Transaction[]>(() => {
    return sentProjects
      .filter((p) => p.status === 'sold' && p.saleAmount && p.saleAmount > 0 && p.soldAt)
      .map((p) => ({
        id: `mock-tx-${p.id}`,
        type: 'commission' as TransactionType,
        status: 'paid' as TransactionStatus,
        company: p.contractor?.company ?? 'Unknown vendor',
        detail: p.item.serviceName,
        customer: p.homeowner?.name,
        amount: Math.round((p.saleAmount ?? 0) * 0.15),
        date: p.soldAt!,
      }))
  }, [sentProjects])

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
      ...mockPayouts,
    ]
    for (const tx of unified) {
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
  }, [transactions, mockSoldTransactions])

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

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description={`${unifiedTxCount} total transactions`} />

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
                      {grouped[cat.key].map((tx) => {
                        // Row click routing (ship #146 bug fix on #143):
                        // - Commission rows resolve the project context via a
                        //   3-tier bridge: (a) mock-tx-<sp.id> prefix strip,
                        //   (b) match sentProjects by homeowner-name +
                        //   vendor-company, (c) match MOCK_LEADS by
                        //   homeowner_name + vendor-company. Without this
                        //   bridge, Supabase UUIDs and tx-N ids don't match
                        //   any sentProject.id / MOCK_LEADS.id and the
                        //   Dialog opens empty (Rodolfo caught on pending
                        //   commission row — kratos msg 1776747436781).
                        // - Membership + payout rows: TransactionDetailDialog
                        //   as before.
                        let projectId: string | null = null
                        if (tx.type === 'commission') {
                          if (tx.id.startsWith('mock-tx-')) {
                            projectId = tx.id.slice('mock-tx-'.length)
                          } else {
                            const sp = sentProjects.find(
                              (p) =>
                                p.homeowner?.name === tx.customer &&
                                p.contractor?.company === tx.company,
                            )
                            if (sp) {
                              projectId = sp.id
                            } else {
                              const vendor = MOCK_VENDORS.find((v) => v.company === tx.company)
                              const lead = MOCK_LEADS.find(
                                (l) =>
                                  l.homeowner_name === tx.customer &&
                                  (vendor ? l.vendor_id === vendor.id : true),
                              )
                              if (lead) projectId = lead.id
                            }
                          }
                        }
                        const onRowClick = tx.type === 'commission' && projectId
                          ? () => setSelectedProjectId(projectId!)
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
                        )
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
            </CardContent>
          </Card>
        </motion.div>
      ))}

      <ProjectDetailDialog
        open={!!selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
        projectId={selectedProjectId}
      />
      <TransactionDetailDialog
        open={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        transaction={selectedTransaction}
      />
    </div>
  )
}
