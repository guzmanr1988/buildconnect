import { useState, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  DollarSign, Wallet, Building2, AlertTriangle, CreditCard,
  CheckCircle2, Clock, Landmark, Plus, ShieldCheck, CreditCard as CreditCardIcon,
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
import { MOCK_CLOSED_SALES, MOCK_BANK_ACCOUNTS, MOCK_VENDORS } from '@/lib/mock-data'
import type { ClosedSale, BankAccount } from '@/types'

const VENDOR_ID = 'v-1'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function VendorBanking() {
  const vendor = MOCK_VENDORS.find((v) => v.id === VENDOR_ID)!
  const commPct = vendor.commission_pct
  const vendorPct = 100 - commPct
  const sales = useMemo(() => MOCK_CLOSED_SALES.filter((s) => s.vendor_id === VENDOR_ID), [])
  const mockAccount = MOCK_BANK_ACCOUNTS.find((b) => b.vendor_id === VENDOR_ID)
  const [bankAccounts, setBankAccounts] = useState<(BankAccount & { purpose?: string })[]>(
    mockAccount ? [{ ...mockAccount, purpose: 'both' }] : []
  )

  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingSale, setPayingSale] = useState<ClosedSale | null>(null)
  const [payStep, setPayStep] = useState<1 | 2>(1)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [paidSales, setPaidSales] = useState<Set<string>>(new Set())

  // Cards
  const [cards, setCards] = useState<{ id: string; name: string; last4: string; type: 'debit' | 'credit'; expiry: string }[]>([])
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cardType, setCardType] = useState<'debit' | 'credit'>('debit')

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
  } satisfies Variants
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  } satisfies Variants

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Banking & Commissions" description="Track sales, commissions, and payouts" />

      {/* Summary KPI Row — 2x2 at every width per Rodolfo-direct 2026-04-21
          ship #176 ("make it 2x2 on the displayed numbers on top of unpaid
          commissions"). Was grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-4
          (a 1x4 row on desktop); now stays 2 cols everywhere so the 4
          tiles land in a clean 2x2 block. */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div variants={item}>
          <KpiCard title="Total Sales" value={fmt(totalSales)} icon={DollarSign} iconColor="bg-primary" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title={`Your Earnings (${vendorPct}%)`} value={fmt(totalEarnings)} icon={Wallet} iconColor="bg-emerald-500" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title={`Commission Due (${commPct}%)`} value={fmt(unpaidCommission)} icon={Building2} iconColor="bg-amber-500" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title="Paid to BuildConnect" value={fmt(paidCommission)} icon={CheckCircle2} iconColor="bg-slate-500" />
        </motion.div>
      </div>

      {/* Commission Warning Banner */}
      {hasUnpaid && (
        <motion.div variants={item}>
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0" />
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
                    <TableHead className="font-semibold text-right">Your {vendorPct}%</TableHead>
                    <TableHead className="font-semibold text-right">Platform {commPct}%</TableHead>
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
                        <TableCell className="text-right text-emerald-700 dark:text-emerald-400 font-medium">{fmt(sale.vendor_share)}</TableCell>
                        <TableCell className="text-right text-amber-700 dark:text-amber-400 font-medium">{fmt(sale.commission)}</TableCell>
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

      {/* Bank Accounts Section */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading">Bank Accounts</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)} className="text-xs gap-1">
                <Plus className="h-3 w-3" /> Add Account
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {bankAccounts.length === 0 ? (
              <div className="text-center py-6">
                <Landmark className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No bank accounts linked yet</p>
                <Button onClick={() => setLinkDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Link Account
                </Button>
              </div>
            ) : (
              bankAccounts.map((account, idx) => (
                <div key={account.id} className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
                  <div className="rounded-xl bg-primary/10 p-3 shrink-0">
                    <Landmark className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{account.bank_name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> Linked
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{account.account_holder}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {account.account_type === 'checking' ? 'Checking' : 'Savings'} ****{account.account_last4}
                    </p>
                    <div className="mt-2">
                      <Select
                        value={account.purpose || 'both'}
                        onValueChange={(v) => {
                          setBankAccounts((prev) => prev.map((a, i) => i === idx ? { ...a, purpose: v ?? undefined } : a))
                        }}
                      >
                        <SelectTrigger className="h-7 text-[11px] w-auto min-w-[160px]">
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="subscription" className="text-xs">Subscription Payments</SelectItem>
                          <SelectItem value="commission" className="text-xs">Commission Payments</SelectItem>
                          <SelectItem value="both" className="text-xs">All Payments</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive shrink-0"
                    onClick={() => setBankAccounts((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Debit/Credit Card Section */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading">Debit / Credit Cards</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setAddCardOpen(true)} className="text-xs gap-1">
                <Plus className="h-3 w-3" /> Add Card
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {cards.length === 0 ? (
              <div className="text-center py-6">
                <CreditCardIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No cards added yet</p>
                <Button variant="outline" onClick={() => setAddCardOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Card
                </Button>
              </div>
            ) : (
              cards.map((card) => (
                <div key={card.id} className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
                  <div className="rounded-xl bg-violet-500/10 p-3 shrink-0">
                    <CreditCardIcon className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{card.name}</p>
                      <Badge variant="secondary" className="text-[10px] capitalize">{card.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">**** **** **** {card.last4}</p>
                    <p className="text-xs text-muted-foreground">Exp: {card.expiry}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive shrink-0"
                    onClick={() => setCards((prev) => prev.filter((c) => c.id !== card.id))}
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-border/50">
              A processing fee of 3% per transaction will be applied to all payments made via debit or credit card. Bank account (ACH) transfers are fee-free.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Add Card Dialog */}
      <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Debit / Credit Card</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Cardholder Name</Label>
              <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Name on card" />
            </div>
            <div className="space-y-2">
              <Label>Card Number</Label>
              <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="1234 5678 9012 3456" maxLength={19} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Expiry</Label>
                <Input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="MM/YY" maxLength={5} />
              </div>
              <div className="space-y-2">
                <Label>CVV</Label>
                <Input value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} placeholder="123" maxLength={4} type="password" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={cardType} onValueChange={(v) => setCardType(v as 'debit' | 'credit')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A 3% processing fee applies to all card transactions.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCardOpen(false)}>Cancel</Button>
            <Button disabled={!cardName || !cardNumber || !cardExpiry || !cardCvv} onClick={() => {
              setCards((prev) => [...prev, {
                id: crypto.randomUUID(),
                name: cardName,
                last4: cardNumber.replace(/\s/g, '').slice(-4),
                type: cardType,
                expiry: cardExpiry,
              }])
              setCardName('')
              setCardNumber('')
              setCardExpiry('')
              setCardCvv('')
              setCardType('debit')
              setAddCardOpen(false)
            }}>
              <CreditCardIcon className="h-4 w-4 mr-1" /> Add Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      <span className="font-bold text-amber-700 dark:text-amber-400">{fmt(payingSale.commission)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="rounded-2xl bg-amber-100 dark:bg-amber-900/30 p-4 inline-block mb-3">
                    <CreditCard className="h-8 w-8 text-amber-700 dark:text-amber-400" />
                  </div>
                  <p className="text-lg font-bold font-heading">{fmt(payingSale.commission)}</p>
                  <p className="text-sm text-muted-foreground mt-1">will be sent to BuildConnect</p>
                  {bankAccounts.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      From {bankAccounts.find(a => a.purpose === 'commission' || a.purpose === 'both')?.bank_name || bankAccounts[0].bank_name} ****{bankAccounts.find(a => a.purpose === 'commission' || a.purpose === 'both')?.account_last4 || bankAccounts[0].account_last4}
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
            <Button disabled={!bankName || !accountHolder || !routingNum || !accountNum} onClick={() => {
              setBankAccounts((prev) => [...prev, {
                id: crypto.randomUUID(),
                vendor_id: VENDOR_ID,
                bank_name: bankName,
                account_holder: accountHolder,
                routing_last4: routingNum.slice(-4),
                account_last4: accountNum.slice(-4),
                account_type: accountType,
                linked_at: new Date().toISOString(),
                purpose: 'both',
              }])
              setBankName('')
              setAccountHolder('')
              setRoutingNum('')
              setAccountNum('')
              setAccountType('checking')
              setLinkDialogOpen(false)
            }}>
              <Landmark className="h-4 w-4 mr-1" /> Link Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
