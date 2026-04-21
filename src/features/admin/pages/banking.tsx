import { useCallback, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Landmark,
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  Link2,
  Plus,
  Send,
  Users,
  RefreshCw,
  Calendar,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'
import {
  MOCK_VENDORS,
  MOCK_TRANSACTIONS,
  MOCK_CLOSED_SALES,
  MOCK_BANK_ACCOUNTS,
} from '@/lib/mock-data'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { formatTransactionId } from '@/components/shared/transaction-detail-dialog'
import type { TransactionType, TransactionStatus } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

const baselineRevenue = MOCK_CLOSED_SALES.reduce((s, c) => s + c.commission, 0)
const pendingPayouts = MOCK_TRANSACTIONS
  .filter((t) => t.type === 'payout' && t.status === 'pending')
  .reduce((s, t) => s + t.amount, 0)
const totalDisbursed = MOCK_TRANSACTIONS
  .filter((t) => t.type === 'payout' && t.status === 'paid')
  .reduce((s, t) => s + t.amount, 0)

const TYPE_CONFIG: Record<TransactionType, { label: string; className: string }> = {
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

// Mock deposit history
const depositHistory = [
  { id: 'dep-1', amount: 15825, reference: 'DEP-2026-0412', date: '2026-04-12', note: 'Commission batch deposit' },
  { id: 'dep-2', amount: 175, reference: 'DEP-2026-0401', date: '2026-04-01', note: 'Membership fees - April' },
]

// Mock disbursement history
const disbursementHistory = [
  { id: 'dis-1', vendor: 'Elite Paving Co', amount: 10200, memo: 'Monthly payout - March', date: '2026-03-15', status: 'paid' as const },
  { id: 'dis-2', vendor: 'Apex Roofing & Solar', amount: 24225, memo: 'Monthly payout - pending', date: '2026-04-15', status: 'pending' as const },
]

// Mock salary history
const salaryHistory = [
  { id: 'sal-1', employee: 'Jonathan Bode', role: 'CEO', amount: 8500, period: 'March 2026', date: '2026-03-30', status: 'paid' as const },
  { id: 'sal-2', employee: 'Jonathan Bode', role: 'CEO', amount: 8500, period: 'April 2026', date: '2026-04-30', status: 'pending' as const },
]

export default function BankingPage() {
  // Phase 2c admin-SoT per kratos msg 1776725610193. Add sentProjects-sold
  // commission on top of the MOCK_CLOSED_SALES baseline so banking KPIs +
  // chart reflect Mark-Sold actions taken through the mock loop.
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const rehydrateProjects = useCallback(() => useProjectsStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateProjects)

  // Per-vendor commission % override (ship #130).
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  const rehydrateModeration = useCallback(() => useAdminModerationStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateModeration)

  const mockCommission = useMemo(() => {
    return sentProjects
      .filter((p) => p.status === 'sold' && p.saleAmount && p.saleAmount > 0)
      .reduce((s, p) => {
        const v = MOCK_VENDORS.find((x) => x.company === p.contractor?.company)
        const pct = (v ? (vendorCommissionOverrides[v.id] ?? v.commission_pct) : 15) / 100
        return s + Math.round((p.saleAmount ?? 0) * pct)
      }, 0)
  }, [sentProjects, vendorCommissionOverrides])

  const totalRevenue = baselineRevenue + mockCommission

  // Revenue Trend redesign (ship #153 per kratos msg 1776749094611).
  // Synthesize last-12-months monthly breakdown: GMV / Commission Revenue /
  // Payouts / Net. Current month uses actual totalRevenue + mockCommission;
  // prior months are deterministic-mock with growth-trend curve so the
  // chart reads professionally. Range filter clips to 3m/6m/12m/YTD.
  const [trendRange, setTrendRange] = useState<'3m' | '6m' | '12m' | 'YTD'>('6m')
  const fullTrendData = useMemo(() => {
    const now = new Date()
    const months: { month: string; gmv: number; commission: number; payouts: number; net: number }[] = []
    // 12 months backward from current, with smooth growth-curve + current-month
    // using live data. Baseline ~$40k GMV at oldest month growing to ~$110k
    // at current; commission tracks ~15% of GMV; payouts ~60% of commission.
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      const growthFactor = 0.4 + (11 - i) * 0.06 // 0.4 → 1.06
      const noise = 1 + ((i * 7 + 13) % 10) / 100 - 0.05 // ±5%
      const gmv = Math.round(100000 * growthFactor * noise)
      const commission = Math.round(gmv * 0.15)
      const payouts = Math.round(commission * 0.6)
      const net = commission - payouts
      months.push({ month: monthLabel, gmv, commission, payouts, net })
    }
    // Override current month (i=0) with actual data from store + Supabase.
    if (months.length > 0) {
      const currentMonthGmv = Math.round(totalRevenue / 0.15)
      const currentMonthCommission = totalRevenue
      const currentMonthPayouts = Math.round(totalDisbursed)
      months[months.length - 1] = {
        ...months[months.length - 1],
        gmv: currentMonthGmv,
        commission: currentMonthCommission,
        payouts: currentMonthPayouts,
        net: currentMonthCommission - currentMonthPayouts,
      }
    }
    return months
  }, [totalRevenue])

  const revenueChartData = useMemo(() => {
    const n = fullTrendData.length
    const sliceN = trendRange === '3m' ? 3 : trendRange === '6m' ? 6 : trendRange === '12m' ? 12 : new Date().getMonth() + 1
    return fullTrendData.slice(Math.max(0, n - sliceN))
  }, [fullTrendData, trendRange])

  const trendDelta = useMemo(() => {
    if (revenueChartData.length < 2) return { pct: 0, up: true }
    const last = revenueChartData[revenueChartData.length - 1].commission
    const prev = revenueChartData[revenueChartData.length - 2].commission
    if (prev === 0) return { pct: 0, up: last >= 0 }
    const pct = Math.round(((last - prev) / prev) * 100)
    return { pct: Math.abs(pct), up: pct >= 0 }
  }, [revenueChartData])

  const [bankForm, setBankForm] = useState({
    bankName: '',
    routing: '',
    account: '',
    confirmAccount: '',
    accountType: '',
  })

  const [depositForm, setDepositForm] = useState({
    amount: '',
    reference: '',
    date: '',
    note: '',
  })

  const [disbursementForm, setDisbursementForm] = useState({
    vendorId: '',
    amount: '',
    memo: '',
  })

  const [salaryForm, setSalaryForm] = useState({
    employeeName: '',
    role: '',
    amount: '',
    period: '',
  })

  const [autoPayments, setAutoPayments] = useState([
    { id: 'ap-1', name: 'Vendor Payouts', description: 'Automatic monthly vendor payouts on the 15th', frequency: 'Monthly', day: 15, enabled: true, type: 'vendor' as const, totalPaid: 34425 },
    { id: 'ap-2', name: 'Salary — Jonathan Bode', description: 'CEO monthly salary payout', frequency: 'Monthly', day: 30, amount: 8500, enabled: true, type: 'salary' as const, totalPaid: 8500 },
    { id: 'ap-3', name: 'Membership Collection', description: 'Auto-collect vendor subscription fees on the 1st', frequency: 'Monthly', day: 1, enabled: false, type: 'collection' as const, totalPaid: 140 },
  ])

  const [editingAP, setEditingAP] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', frequency: '', day: '', amount: '' })

  // Ship #162: wire the dead submit buttons across all banking tabs.
  // All actions are mock-stubs (no real banking integration) but now
  // provide immediate feedback + clear the form so admin can see the
  // action completed. Tranche-2 wires real Stripe/ACH/payroll.
  const [newAP, setNewAP] = useState({ name: '', description: '', frequency: '', day: '', amount: '' })

  const handleLinkBank = () => {
    if (!bankForm.bankName.trim() || !bankForm.routing.trim() || !bankForm.account.trim()) {
      toast.error('Fill bank name, routing, and account number')
      return
    }
    if (bankForm.account !== bankForm.confirmAccount) {
      toast.error('Account numbers do not match')
      return
    }
    toast.success(`${bankForm.bankName} linked (mock)`, {
      description: 'Tranche-2: wire to Plaid/Stripe Financial Connections.',
    })
    setBankForm({ bankName: '', routing: '', account: '', confirmAccount: '', accountType: '' })
  }

  const handleRecordDeposit = () => {
    if (!depositForm.amount || Number(depositForm.amount) <= 0) {
      toast.error('Enter a valid deposit amount')
      return
    }
    toast.success(`Deposit recorded: $${Number(depositForm.amount).toLocaleString()} (mock)`, {
      description: depositForm.reference ? `Ref: ${depositForm.reference}` : 'Tranche-2: post to Supabase deposits table.',
    })
    setDepositForm({ amount: '', reference: '', date: '', note: '' })
  }

  const handleSendPayout = () => {
    if (!disbursementForm.vendorId || !disbursementForm.amount || Number(disbursementForm.amount) <= 0) {
      toast.error('Select vendor and enter a valid payout amount')
      return
    }
    const vendor = MOCK_VENDORS.find((v) => v.id === disbursementForm.vendorId)
    toast.success(`Payout sent: $${Number(disbursementForm.amount).toLocaleString()} → ${vendor?.company ?? 'Vendor'} (mock)`, {
      description: 'Tranche-2: ACH via Stripe payouts API.',
    })
    setDisbursementForm({ vendorId: '', amount: '', memo: '' })
  }

  const handleSendSalary = () => {
    if (!salaryForm.employeeName.trim() || !salaryForm.amount || Number(salaryForm.amount) <= 0) {
      toast.error('Enter employee name and valid amount')
      return
    }
    toast.success(`Salary sent: ${salaryForm.employeeName} $${Number(salaryForm.amount).toLocaleString()} (mock)`, {
      description: 'Tranche-2: wire to payroll provider.',
    })
    setSalaryForm({ employeeName: '', role: '', amount: '', period: '' })
  }

  const handleAddAutoPayment = () => {
    if (!newAP.name.trim() || !newAP.frequency || !newAP.day) {
      toast.error('Fill name, frequency, and day of month')
      return
    }
    const id = `ap-${Date.now()}`
    setAutoPayments((prev) => [
      ...prev,
      {
        id,
        name: newAP.name,
        description: newAP.description,
        frequency: newAP.frequency,
        day: Number(newAP.day),
        amount: newAP.amount ? Number(newAP.amount) : undefined,
        enabled: true,
        type: 'vendor' as const,
        totalPaid: 0,
      },
    ])
    toast.success(`Auto-payment "${newAP.name}" added`)
    setNewAP({ name: '', description: '', frequency: '', day: '', amount: '' })
  }

  const toggleAutoPay = (id: string) => {
    setAutoPayments((prev) =>
      prev.map((ap) => (ap.id === id ? { ...ap, enabled: !ap.enabled } : ap))
    )
  }

  const startEditAP = (ap: typeof autoPayments[0]) => {
    setEditForm({ name: ap.name, description: ap.description, frequency: ap.frequency, day: String(ap.day), amount: ap.amount ? String(ap.amount) : '' })
    setEditingAP(ap.id)
  }

  const saveEditAP = () => {
    if (!editingAP) return
    setAutoPayments((prev) => prev.map((ap) =>
      ap.id === editingAP ? { ...ap, name: editForm.name, description: editForm.description, frequency: editForm.frequency, day: Number(editForm.day), amount: editForm.amount ? Number(editForm.amount) : undefined } : ap
    ))
    setEditingAP(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Banking & Payouts" description="Manage platform finances, deposits, and vendor payouts" />

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
          <TabsList className="w-max sm:w-auto h-auto p-1 gap-1">
            <TabsTrigger value="overview" className="gap-1.5 px-3 py-2.5 text-sm sm:px-4 sm:py-2.5">
              <Landmark className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="link-bank" className="gap-1.5 px-3 py-2.5 text-sm sm:px-4 sm:py-2.5">
              <Link2 className="h-4 w-4" />
              Bank
            </TabsTrigger>
            <TabsTrigger value="deposits" className="gap-1.5 px-3 py-2.5 text-sm sm:px-4 sm:py-2.5">
              <ArrowDownToLine className="h-4 w-4" />
              Deposits
            </TabsTrigger>
            <TabsTrigger value="disbursements" className="gap-1.5 px-3 py-2.5 text-sm sm:px-4 sm:py-2.5">
              <ArrowUpFromLine className="h-4 w-4" />
              Payouts
            </TabsTrigger>
            <TabsTrigger value="ledger" className="gap-1.5 px-3 py-2.5 text-sm sm:px-4 sm:py-2.5">
              <BookOpen className="h-4 w-4" />
              Ledger
            </TabsTrigger>
            <TabsTrigger value="autopay" className="gap-1.5 px-3 py-2.5 text-sm sm:px-4 sm:py-2.5">
              <RefreshCw className="h-4 w-4" />
              Auto Pay
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard
                title="Total Revenue"
                value={`$${totalRevenue.toLocaleString()}`}
                change={`${trendDelta.up ? '+' : '-'}${trendDelta.pct}% vs prior month`}
                trend={trendDelta.up ? 'up' : 'down'}
                icon={DollarSign}
                iconColor="bg-emerald-500"
              />
              <KpiCard
                title="Pending Payouts"
                value={`$${pendingPayouts.toLocaleString()}`}
                icon={ArrowUpFromLine}
                iconColor="bg-amber-500"
              />
              <KpiCard
                title="Total Disbursed"
                value={`$${totalDisbursed.toLocaleString()}`}
                change="All time"
                trend="up"
                icon={Send}
                iconColor="bg-blue-500"
              />
            </div>
          </motion.div>

          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      Revenue Trend
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-2xl font-bold font-heading">${totalRevenue.toLocaleString()}</span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                          trendDelta.up
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                        )}
                      >
                        {trendDelta.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {trendDelta.up ? '+' : '-'}{trendDelta.pct}%
                      </span>
                      <span className="text-xs text-muted-foreground">vs prior month</span>
                    </div>
                  </div>
                  <Tabs value={trendRange} onValueChange={(v) => setTrendRange(v as typeof trendRange)} className="shrink-0">
                    <TabsList className="h-8">
                      <TabsTrigger value="3m" className="text-xs px-3">3M</TabsTrigger>
                      <TabsTrigger value="6m" className="text-xs px-3">6M</TabsTrigger>
                      <TabsTrigger value="12m" className="text-xs px-3">12M</TabsTrigger>
                      <TabsTrigger value="YTD" className="text-xs px-3">YTD</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueChartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="gradientGmv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradientCommission" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradientNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                        axisLine={false}
                        tickLine={false}
                      />
                      {/* Tooltip removed per kratos msg 1776751586723 —
                          legend + delta indicators convey context. */}
                      <Area type="monotone" dataKey="gmv" stroke="#3b82f6" strokeWidth={2} fill="url(#gradientGmv)" />
                      <Area type="monotone" dataKey="commission" stroke="#f59e0b" strokeWidth={2} fill="url(#gradientCommission)" />
                      <Area type="monotone" dataKey="net" stroke="#10b981" strokeWidth={2} fill="url(#gradientNet)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 pt-3 border-t mt-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                    <span className="text-muted-foreground">GMV</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                    <span className="text-muted-foreground">Commission</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                    <span className="text-muted-foreground">Net</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Linked Accounts */}
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-primary" />
                  Linked Bank Accounts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {MOCK_BANK_ACCOUNTS.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bank accounts linked yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Bank</TableHead>
                        <TableHead className="font-semibold">Account Holder</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Last 4</TableHead>
                        <TableHead className="font-semibold">Linked</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MOCK_BANK_ACCOUNTS.map((acc) => (
                        <TableRow key={acc.id}>
                          <TableCell className="font-medium">{acc.bank_name}</TableCell>
                          <TableCell>{acc.account_holder}</TableCell>
                          <TableCell className="capitalize">{acc.account_type}</TableCell>
                          <TableCell className="font-mono">****{acc.account_last4}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(acc.linked_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Link Bank Tab ── */}
        <TabsContent value="link-bank" className="mt-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition max-w-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Link ACH Bank Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input
                    placeholder="e.g. Chase, Bank of America"
                    value={bankForm.bankName}
                    onChange={(e) => setBankForm((p) => ({ ...p, bankName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Routing Number</Label>
                  <Input
                    placeholder="9 digits"
                    maxLength={9}
                    value={bankForm.routing}
                    onChange={(e) => setBankForm((p) => ({ ...p, routing: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input
                    placeholder="Account number"
                    value={bankForm.account}
                    onChange={(e) => setBankForm((p) => ({ ...p, account: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Account Number</Label>
                  <Input
                    placeholder="Re-enter account number"
                    value={bankForm.confirmAccount}
                    onChange={(e) => setBankForm((p) => ({ ...p, confirmAccount: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select
                    value={bankForm.accountType}
                    onValueChange={(val) => setBankForm((p) => ({ ...p, accountType: val as string }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Checking</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full gap-2" onClick={handleLinkBank}>
                  <Link2 className="h-4 w-4" />
                  Link Bank Account
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Deposits Tab ── */}
        <TabsContent value="deposits" className="space-y-6 mt-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition max-w-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" />
                  Record Deposit
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={depositForm.amount}
                      onChange={(e) => setDepositForm((p) => ({ ...p, amount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference</Label>
                    <Input
                      placeholder="DEP-2026-XXXX"
                      value={depositForm.reference}
                      onChange={(e) => setDepositForm((p) => ({ ...p, reference: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={depositForm.date}
                    onChange={(e) => setDepositForm((p) => ({ ...p, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Textarea
                    placeholder="Description of deposit..."
                    value={depositForm.note}
                    onChange={(e) => setDepositForm((p) => ({ ...p, note: e.target.value }))}
                  />
                </div>
                <Button className="w-full gap-2" onClick={handleRecordDeposit}>
                  <ArrowDownToLine className="h-4 w-4" />
                  Record Deposit
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4 text-primary" />
                  Deposit History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Reference</TableHead>
                      <TableHead className="font-semibold text-right">Amount</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depositHistory.map((dep) => (
                      <TableRow key={dep.id}>
                        <TableCell className="font-mono text-xs">{dep.reference}</TableCell>
                        <TableCell className="text-right font-semibold">${dep.amount.toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(dep.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{dep.note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Disbursements Tab ── */}
        <TabsContent value="disbursements" className="space-y-6 mt-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition max-w-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  Vendor Payout
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Vendor</Label>
                  <Select
                    value={disbursementForm.vendorId}
                    onValueChange={(val) =>
                      setDisbursementForm((p) => ({ ...p, vendorId: val as string }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {MOCK_VENDORS.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={disbursementForm.amount}
                    onChange={(e) =>
                      setDisbursementForm((p) => ({ ...p, amount: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Memo</Label>
                  <Textarea
                    placeholder="Payout description..."
                    value={disbursementForm.memo}
                    onChange={(e) =>
                      setDisbursementForm((p) => ({ ...p, memo: e.target.value }))
                    }
                  />
                </div>
                <Button className="w-full gap-2" onClick={handleSendPayout}>
                  <Send className="h-4 w-4" />
                  Send Payout
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpFromLine className="h-4 w-4 text-primary" />
                  Disbursement History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Vendor</TableHead>
                      <TableHead className="font-semibold text-right">Amount</TableHead>
                      <TableHead className="font-semibold">Memo</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disbursementHistory.map((dis) => (
                      <TableRow key={dis.id}>
                        <TableCell className="font-medium">{dis.vendor}</TableCell>
                        <TableCell className="text-right font-semibold">
                          ${dis.amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{dis.memo}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(dis.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              dis.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                            )}
                          >
                            {dis.status === 'paid' ? 'Paid' : 'Pending'}
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

          {/* Salary Payouts */}
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition max-w-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Salary Payout
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Employee Name</Label>
                    <Input
                      placeholder="Full name"
                      value={salaryForm.employeeName}
                      onChange={(e) => setSalaryForm((p) => ({ ...p, employeeName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role / Title</Label>
                    <Input
                      placeholder="e.g. CEO, Manager"
                      value={salaryForm.role}
                      onChange={(e) => setSalaryForm((p) => ({ ...p, role: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={salaryForm.amount}
                      onChange={(e) => setSalaryForm((p) => ({ ...p, amount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pay Period</Label>
                    <Input
                      placeholder="e.g. April 2026"
                      value={salaryForm.period}
                      onChange={(e) => setSalaryForm((p) => ({ ...p, period: e.target.value }))}
                    />
                  </div>
                </div>
                <Button className="w-full gap-2" onClick={handleSendSalary}>
                  <Send className="h-4 w-4" />
                  Send Salary Payout
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Salary Payout History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Employee</TableHead>
                        <TableHead className="font-semibold">Role</TableHead>
                        <TableHead className="font-semibold text-right">Amount</TableHead>
                        <TableHead className="font-semibold">Period</TableHead>
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salaryHistory.map((sal) => (
                        <TableRow key={sal.id}>
                          <TableCell className="font-medium">{sal.employee}</TableCell>
                          <TableCell className="text-muted-foreground">{sal.role}</TableCell>
                          <TableCell className="text-right font-semibold">${sal.amount.toLocaleString()}</TableCell>
                          <TableCell className="text-muted-foreground">{sal.period}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(sal.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </TableCell>
                          <TableCell>
                            <span className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              sal.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                            )}>
                              {sal.status === 'paid' ? 'Paid' : 'Pending'}
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
        </TabsContent>

        {/* ── Ledger Tab ── */}
        <TabsContent value="ledger" className="space-y-6 mt-6">
          {(() => {
            // Group transactions by month
            const sorted = [...MOCK_TRANSACTIONS].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            const byMonth = new Map<string, typeof MOCK_TRANSACTIONS>()
            for (const tx of sorted) {
              const d = new Date(tx.date)
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              if (!byMonth.has(key)) byMonth.set(key, [])
              byMonth.get(key)!.push(tx)
            }

            return Array.from(byMonth.entries()).map(([monthKey, txs], idx) => {
              const monthDate = new Date(monthKey + '-01')
              const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              const monthTotal = txs.reduce((s, t) => s + t.amount, 0)
              const commTotal = txs.filter((t) => t.type === 'commission').reduce((s, t) => s + t.amount, 0)
              const memTotal = txs.filter((t) => t.type === 'membership').reduce((s, t) => s + t.amount, 0)
              const payTotal = txs.filter((t) => t.type === 'payout').reduce((s, t) => s + t.amount, 0)

              return (
                <motion.div key={monthKey} custom={idx} variants={fadeUp} initial="hidden" animate="visible">
                  <Card className="rounded-xl shadow-sm hover:shadow-md transition">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-primary" />
                          <span>{monthLabel}</span>
                          <span className="text-sm font-normal text-muted-foreground">({txs.length} transactions)</span>
                        </div>
                        <span className="text-lg font-bold">${monthTotal.toLocaleString()}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Month summary */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {commTotal > 0 && (
                          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Commissions</p>
                            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">${commTotal.toLocaleString()}</p>
                          </div>
                        )}
                        {memTotal > 0 && (
                          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Memberships</p>
                            <p className="text-sm font-bold text-blue-600 dark:text-blue-400">${memTotal.toLocaleString()}</p>
                          </div>
                        )}
                        {payTotal > 0 && (
                          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Payouts</p>
                            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">${payTotal.toLocaleString()}</p>
                          </div>
                        )}
                      </div>

                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="font-semibold">ID</TableHead>
                              <TableHead className="font-semibold">Type</TableHead>
                              <TableHead className="font-semibold">Company</TableHead>
                              <TableHead className="font-semibold">Detail</TableHead>
                              <TableHead className="font-semibold text-right">Amount</TableHead>
                              <TableHead className="font-semibold">Date</TableHead>
                              <TableHead className="font-semibold">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {txs.map((tx) => (
                              <TableRow key={tx.id}>
                                <TableCell className="font-mono text-xs font-semibold">{formatTransactionId(tx.id, tx.type)}</TableCell>
                                <TableCell>
                                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', TYPE_CONFIG[tx.type].className)}>
                                    {TYPE_CONFIG[tx.type].label}
                                  </span>
                                </TableCell>
                                <TableCell className="font-medium">{tx.company}</TableCell>
                                <TableCell className="text-muted-foreground max-w-[160px] truncate">{tx.detail}</TableCell>
                                <TableCell className="text-right font-semibold">${tx.amount.toLocaleString()}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </TableCell>
                                <TableCell>
                                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_CONFIG[tx.status].className)}>
                                    {STATUS_CONFIG[tx.status].label}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/30 border-t-2">
                              <TableCell colSpan={4} className="font-semibold text-right">Month Total</TableCell>
                              <TableCell className="text-right font-bold text-base">${monthTotal.toLocaleString()}</TableCell>
                              <TableCell colSpan={2} />
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })
          })()}
        </TabsContent>

        {/* ── Auto Pay Tab ── */}
        <TabsContent value="autopay" className="space-y-6 mt-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  Automatic Payments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Schedule recurring payments and toggle them on or off. Enabled payments will process automatically on their scheduled day.
                </p>
                <div className="space-y-3">
                  {autoPayments.map((ap) => (
                    <div
                      key={ap.id}
                      className={cn(
                        'rounded-xl border p-4 flex items-center gap-4 transition',
                        ap.enabled
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800/40'
                          : 'bg-muted/30 border-border'
                      )}
                    >
                      <div className={cn(
                        'rounded-full p-2',
                        ap.enabled ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-muted'
                      )}>
                        {ap.type === 'vendor' ? (
                          <ArrowUpFromLine className={cn('h-4 w-4', ap.enabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')} />
                        ) : ap.type === 'salary' ? (
                          <Users className={cn('h-4 w-4', ap.enabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')} />
                        ) : (
                          <DollarSign className={cn('h-4 w-4', ap.enabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{ap.name}</p>
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                            ap.enabled
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          )}>
                            {ap.enabled ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{ap.description}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {ap.frequency} · Day {ap.day}
                          </span>
                          {ap.amount && (
                            <span className="text-xs font-medium text-foreground">${ap.amount.toLocaleString()}</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            Total Paid: ${ap.totalPaid.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <Switch
                          aria-label={`Auto-pay enabled for ${ap.name ?? 'vendor'}`}
                          checked={ap.enabled}
                          onCheckedChange={() => toggleAutoPay(ap.id)}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditAP(ap)}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Add New Auto Payment */}
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition max-w-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" />
                  Add Automatic Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Payment Name</Label>
                  <Input
                    placeholder="e.g. Monthly Vendor Payout"
                    value={newAP.name}
                    onChange={(e) => setNewAP((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="Short description"
                    value={newAP.description}
                    onChange={(e) => setNewAP((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select value={newAP.frequency} onValueChange={(v) => setNewAP((p) => ({ ...p, frequency: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Weekly">Weekly</SelectItem>
                        <SelectItem value="Bi-Weekly">Bi-Weekly</SelectItem>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Day of Month</Label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      placeholder="1-28"
                      value={newAP.day}
                      onChange={(e) => setNewAP((p) => ({ ...p, day: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Amount (optional — leave blank for variable)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={newAP.amount}
                    onChange={(e) => setNewAP((p) => ({ ...p, amount: e.target.value }))}
                  />
                </div>
                <Button className="w-full gap-2" onClick={handleAddAutoPayment}>
                  <Plus className="h-4 w-4" />
                  Add Auto Payment
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Edit Auto Payment Dialog */}
      <Dialog open={!!editingAP} onOpenChange={(open) => !open && setEditingAP(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Edit Auto Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Payment Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={editForm.frequency} onValueChange={(val) => setEditForm((p) => ({ ...p, frequency: val }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                    <SelectItem value="Bi-Weekly">Bi-Weekly</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Day</Label>
                <Input type="number" min={1} max={28} value={editForm.day} onChange={(e) => setEditForm((p) => ({ ...p, day: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Amount (leave blank for variable)</Label>
              <Input type="number" placeholder="0.00" value={editForm.amount} onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingAP(null)}>Cancel</Button>
            <Button onClick={saveEditAP}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
