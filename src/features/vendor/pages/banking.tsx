import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  DollarSign, Wallet, Building2, AlertTriangle, CreditCard,
  CheckCircle2, Clock, Landmark, Plus, ShieldCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
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
import { StatusBadge } from '@/components/shared/status-badge'
import { MOCK_CLOSED_SALES, MOCK_BANK_ACCOUNTS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import type { ClosedSale, BankAccount } from '@/types'

const VENDOR_ID = 'v-1'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function VendorBanking() {
  const sales = useMemo(() => MOCK_CLOSED_SALES.filter((s) => s.vendor_id === VENDOR_ID), [])
  const bankAccount = MOCK_BANK_ACCOUNTS.find((b) => b.vendor_id === VENDOR_ID)

  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingSale, setPayingSale] = useState<ClosedSale | null>(null)
  const [payStep, setPayStep] = useState<1 | 2>(1)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [paidSales, setPaidSales] = useState<Set<string>>(new Set())

  // Bank linking form
  const [bankName, setBankName] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [routingNum, setRoutingNum] = useState('')
  const [accountNum, setAccountNum] = useState('')
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking')

  const totalSales = sales.reduce((s, x) => s + x.sale_amount, 0)
  const totalEarnings = sales.reduce((s, x) => s + x.vendor_share, 0)
  const totalCommission = sales.reduce((s, x) => s + x.commission, 0)
  const paidCommission = sales.filter((s) => s.commission_paid || paidSales.has(s.id)).reduce((s, x) => s + x.commission, 0)
  const unpaidCommission = totalCommission - paidCommission
  const hasUnpaid = unpaidCommission > 0

  const openPayDialog = (sale: ClosedSale) => {
    setPayingSale(sale)
    setPayStep(1)
    setPayDialogOpen(true)
  }

  const confirmPay = () => {
    if (payStep === 1) {
      setPayStep(2)
      return
    }
    if (payingSale) {
      setPaidSales((prev) => new Set([...prev, payingSale.id]))
    }
    setPayDialogOpen(false)
  }

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  }
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Banking & Commissions" description="Track sales, commissions, and payouts" />

      {/* Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={item}>
          <KpiCard title="Total Sales" value={fmt(totalSales)} icon={DollarSign} iconColor="bg-primary" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title="Your Earnings (85%)" value={fmt(totalEarnings)} icon={Wallet} iconColor="bg-emerald-500" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title="Commission Due (15%)" value={fmt(unpaidCommission)} icon={Building2} iconColor="bg-amber-500" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title="Paid to BuildConnect" value={fmt(paidCommission)} icon={CheckCircle2} iconColor="bg-slate-500" />
        </motion.div>
      </div>

      {/* Commission Warning Banner */}
      {hasUnpaid && (
        <motion.div variants={item}>
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Unpaid commission: {fmt(unpaidCommission)}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Please settle outstanding commissions to maintain your account in good standing.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Closed Sales Ledger */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="font-heading">Closed Sales Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Lead ID</TableHead>
                    <TableHead className="font-semibold">Homeowner</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">Project</TableHead>
                    <TableHead className="font-semibold text-right">Sale Total</TableHead>
                    <TableHead className="font-semibold text-right">Your 85%</TableHead>
                    <TableHead className="font-semibold text-right">BC 15%</TableHead>
                    <TableHead className="font-semibold hidden sm:table-cell">Close Date</TableHead>
                    <TableHead className="font-semibold text-center">Status</TableHead>
                    <TableHead className="font-semibold text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => {
                    const isPaid = sale.commission_paid || paidSales.has(sale.id)
                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="font-mono text-xs">{sale.lead_id}</TableCell>
                        <TableCell className="font-medium">{sale.homeowner_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm hidden md:table-cell">{sale.project}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(sale.sale_amount)}</TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">{fmt(sale.vendor_share)}</TableCell>
                        <TableCell className="text-right text-amber-600 dark:text-amber-400 font-medium">{fmt(sale.commission)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{fmtDate(sale.closed_at)}</TableCell>
                        <TableCell className="text-center">
                          {isPaid ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                              <Clock className="h-3 w-3 mr-1" /> Unpaid
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {!isPaid && (
                            <Button size="sm" variant="outline" onClick={() => openPayDialog(sale)} className="text-xs">
                              <CreditCard className="h-3 w-3 mr-1" /> Pay
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Bank Account Section */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading">Bank Account</CardTitle>
              {bankAccount && (
                <Badge variant="outline" className="text-xs">
                  <ShieldCheck className="h-3 w-3 mr-1" /> Linked
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {bankAccount ? (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
                <div className="rounded-xl bg-primary/10 p-3">
                  <Landmark className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{bankAccount.bank_name}</p>
                  <p className="text-sm text-muted-foreground">{bankAccount.account_holder}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {bankAccount.account_type === 'checking' ? 'Checking' : 'Savings'} ****{bankAccount.account_last4}
                  </p>
                </div>
                <Button variant="outline" size="sm">Edit</Button>
              </div>
            ) : (
              <div className="text-center py-6">
                <Landmark className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No bank account linked yet</p>
                <Button onClick={() => setLinkDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Link Account
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Pay Commission Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {payStep === 1 ? 'Pay Commission' : 'Confirm Payment'}
            </DialogTitle>
            <DialogDescription>
              {payStep === 1
                ? 'Review the commission details before proceeding.'
                : 'This action cannot be undone. Confirm to process payment.'}
            </DialogDescription>
          </DialogHeader>
          {payingSale && (
            <div className="space-y-4 py-2">
              {payStep === 1 ? (
                <>
                  <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lead</span>
                      <span className="font-medium">{payingSale.lead_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Homeowner</span>
                      <span className="font-medium">{payingSale.homeowner_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sale Total</span>
                      <span className="font-medium">{fmt(payingSale.sale_amount)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Commission (15%)</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{fmt(payingSale.commission)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="rounded-2xl bg-amber-100 dark:bg-amber-900/30 p-4 inline-block mb-3">
                    <CreditCard className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-lg font-bold font-heading">{fmt(payingSale.commission)}</p>
                  <p className="text-sm text-muted-foreground mt-1">will be sent to BuildConnect</p>
                  {bankAccount && (
                    <p className="text-xs text-muted-foreground mt-2">
                      From {bankAccount.bank_name} ****{bankAccount.account_last4}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmPay}>
              {payStep === 1 ? 'Continue' : 'Confirm & Pay'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Bank Account Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Link Bank Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Chase, Bank of America" />
            </div>
            <div className="space-y-2">
              <Label>Account Holder Name</Label>
              <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Legal name on account" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Routing Number</Label>
                <Input value={routingNum} onChange={(e) => setRoutingNum(e.target.value)} placeholder="9 digits" maxLength={9} />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input value={accountNum} onChange={(e) => setAccountNum(e.target.value)} placeholder="Account number" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={accountType} onValueChange={(v) => setAccountType(v as 'checking' | 'savings')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
            <Button disabled={!bankName || !accountHolder || !routingNum || !accountNum} onClick={() => setLinkDialogOpen(false)}>
              <Landmark className="h-4 w-4 mr-1" /> Link Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
