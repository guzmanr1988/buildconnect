import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Landmark,
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  Link2,
  Plus,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  MOCK_VENDORS,
  MOCK_TRANSACTIONS,
  MOCK_CLOSED_SALES,
  MOCK_BANK_ACCOUNTS,
} from '@/lib/mock-data'
import type { TransactionType, TransactionStatus } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

const totalRevenue = MOCK_CLOSED_SALES.reduce((s, c) => s + c.commission, 0)
const pendingPayouts = MOCK_TRANSACTIONS
  .filter((t) => t.type === 'payout' && t.status === 'pending')
  .reduce((s, t) => s + t.amount, 0)
const totalDisbursed = MOCK_TRANSACTIONS
  .filter((t) => t.type === 'payout' && t.status === 'paid')
  .reduce((s, t) => s + t.amount, 0)

const revenueChartData = [
  { month: 'Jan', revenue: 4200 },
  { month: 'Feb', revenue: 6800 },
  { month: 'Mar', revenue: 9100 },
  { month: 'Apr', revenue: totalRevenue },
]

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

export default function BankingPage() {
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

  return (
    <div className="space-y-8">
      <PageHeader title="Banking & Payouts" description="Manage platform finances, deposits, and vendor payouts" />

      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <Landmark className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="link-bank" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Link Bank
          </TabsTrigger>
          <TabsTrigger value="deposits" className="gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Deposits
          </TabsTrigger>
          <TabsTrigger value="disbursements" className="gap-1.5">
            <ArrowUpFromLine className="h-3.5 w-3.5" />
            Disbursements
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Ledger
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard
                title="Total Revenue"
                value={`$${totalRevenue.toLocaleString()}`}
                change="+18% this month"
                trend="up"
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  Revenue Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueChartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        className="fill-muted-foreground"
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                        contentStyle={{
                          borderRadius: '0.75rem',
                          border: '1px solid hsl(var(--border))',
                          backgroundColor: 'hsl(var(--popover))',
                          color: 'hsl(var(--popover-foreground))',
                        }}
                      />
                      <Bar dataKey="revenue" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bank</TableHead>
                        <TableHead>Account Holder</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Last 4</TableHead>
                        <TableHead>Linked</TableHead>
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
                <Button className="w-full gap-2">
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
                <Button className="w-full gap-2">
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Note</TableHead>
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
                <Button className="w-full gap-2">
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
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
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Ledger Tab ── */}
        <TabsContent value="ledger" className="mt-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Full Transaction Ledger
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Detail</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...MOCK_TRANSACTIONS]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{tx.id}</TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                TYPE_CONFIG[tx.type].className
                              )}
                            >
                              {TYPE_CONFIG[tx.type].label}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">{tx.company}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[160px] truncate">
                            {tx.detail}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{tx.customer || '--'}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ${tx.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(tx.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </TableCell>
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
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
