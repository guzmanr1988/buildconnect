import { useEffect, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import { CheckCircle2, XCircle, CreditCard, Landmark, Calendar, AlertTriangle, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth-store'
import {
  useVendorMembershipStore,
  MEMBERSHIP_MONTHLY_CENTS,
  ordinal,
  type MembershipStatus,
} from '@/stores/vendor-membership-store'
import {
  useVendorBillingStore,
  PAYMENT_METHOD_LABELS,
  type VendorPaymentMethodKind,
} from '@/stores/vendor-billing-store'
import { useNavigate } from 'react-router-dom'
import { VendorPaymentDialog } from '@/features/auth/components/vendor-payment-dialog'
import { cn } from '@/lib/utils'

/*
 * Ship #180 (Rodolfo-direct pivot #4 + the planned #180 portal-side
 * payment display/edit, bundled): /vendor/membership. Shows membership
 * status + $25/mo amount + day-of-month billing circle + stored payment
 * method + Cancel Membership button with confirmation + disclaimer. The
 * "Update payment method" affordance re-opens the VendorPaymentDialog
 * in non-blocking mode so the user can swap cards from the portal.
 *
 * Finance-app aesthetic per Rodolfos "look very professional" x2:
 * clean typography, generous whitespace, subdued palette, emerald
 * status-green for Active, zinc for Cancelled, large day-circle anchor.
 */

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function methodIconFor(kind: VendorPaymentMethodKind) {
  // Ship #185 — unified 'card' kind (plus legacy credit_card/debit_card
  // aliases for pre-#185 persisted entries) all use the card icon.
  if (kind === 'checking') return Landmark
  return CreditCard
}

export default function VendorMembershipPage() {
  const profile = useAuthStore((s) => s.profile)
  const vendorId = profile?.id ?? 'vendor-fallback'

  const activateMembership = useVendorMembershipStore((s) => s.activateMembership)
  const cancelMembership = useVendorMembershipStore((s) => s.cancelMembership)
  const membership = useVendorMembershipStore((s) => s.membershipByVendor[vendorId])

  // Ship #189 — membership displays the first method tagged 'membership'
  // or 'both'. Update button edits that method in place. Full multi-
  // method management lives on /vendor/banking; link below the Update
  // button for users with >1 method on file.
  const paymentMethod = useVendorBillingStore((s) =>
    s.paymentMethodsByVendor[vendorId]?.find(
      (m) => m.purpose === 'membership' || m.purpose === 'both',
    ),
  )
  const totalMethodsOnFile = useVendorBillingStore(
    (s) => s.paymentMethodsByVendor[vendorId]?.length ?? 0,
  )
  const addPaymentMethod = useVendorBillingStore((s) => s.addPaymentMethod)
  const updatePaymentMethod = useVendorBillingStore((s) => s.updatePaymentMethod)
  const navigate = useNavigate()

  // Seed an Active membership if none exists — real-world path is that
  // signup → #179 payment dialog commits both the payment method AND
  // flips the membership to active. For users who landed here from a
  // pre-#180 session without that activation, seed gently so the page
  // doesn't render empty. Billing day seeded from today.
  useEffect(() => {
    if (!membership) {
      activateMembership(vendorId)
    }
  }, [membership, vendorId, activateMembership])

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [editPaymentOpen, setEditPaymentOpen] = useState(false)

  const status: MembershipStatus = membership?.status ?? 'active'
  const billingDay = membership?.billingDay ?? new Date().getDate()
  const active = status === 'active'

  function handleCancelConfirm() {
    cancelMembership(vendorId)
    setCancelDialogOpen(false)
    toast.success('Membership cancelled')
  }

  function handleReactivate() {
    activateMembership(vendorId)
    toast.success('Membership reactivated')
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
            Membership
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your BuildConnect subscription — keeps your portal active and your
            commissions flowing.
          </p>
        </div>
      </motion.div>

      {/* Status + amount + billing day hero card */}
      <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {/* Top row: status badge + amount */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 pb-5 border-b">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Status
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
                      active
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
                    )}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        active ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500',
                      )}
                    />
                    {active ? 'Active' : 'Cancelled'}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Monthly
                </p>
                <p className="mt-1 text-3xl font-bold font-heading text-foreground tabular-nums">
                  {fmtMoney(MEMBERSHIP_MONTHLY_CENTS)}
                </p>
              </div>
            </div>

            {/* Middle row: day-of-month circle + billing info */}
            <div className="flex items-center gap-6 p-6 bg-muted/30">
              <div
                className={cn(
                  'relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2',
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900',
                )}
              >
                <div className="text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-70">
                    Every
                  </p>
                  <p className="font-heading text-3xl font-bold leading-none tabular-nums mt-0.5">
                    {billingDay}
                  </p>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-70 mt-0.5">
                    {ordinal(billingDay).replace(/^\d+/, '').toUpperCase() || 'TH'}
                  </p>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {active ? (
                    <>Billed monthly on the {ordinal(billingDay)}</>
                  ) : (
                    <>Was billed monthly on the {ordinal(billingDay)}</>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 shrink-0" />
                  {active
                    ? 'Automatic renewal — no action needed to stay active.'
                    : 'Billing paused — reactivate any time to restore portal access.'}
                </p>
              </div>
            </div>

            {/* Payment method row — Ship #180 C+D bundled here */}
            <div className="p-6 border-t">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Charged to
              </p>
              {paymentMethod ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const Icon = methodIconFor(paymentMethod.kind)
                      return (
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                      )
                    })()}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {/* Ship #185 — brand overrides the generic
                            "Card" label when detected at save time.
                            "Visa ****4242" is the target shape Rodolfo
                            called out. Checking or unknown-brand cards
                            fall through to the PAYMENT_METHOD_LABELS
                            entry ("Card" / "Checking Account"). */}
                        {paymentMethod.kind === 'checking'
                          ? PAYMENT_METHOD_LABELS[paymentMethod.kind]
                          : paymentMethod.brand ?? PAYMENT_METHOD_LABELS[paymentMethod.kind]}
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                          •••• {paymentMethod.last4}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {paymentMethod.kind === 'checking'
                          ? `${paymentMethod.bankName} · ${paymentMethod.holder}`
                          : `${paymentMethod.holder}${paymentMethod.expiry ? ` · Exp ${paymentMethod.expiry}` : ''}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditPaymentOpen(true)}
                    className="gap-1.5"
                  >
                    Update
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed p-4">
                  <p className="text-sm text-muted-foreground">
                    No payment method on file yet.
                  </p>
                  <Button size="sm" onClick={() => setEditPaymentOpen(true)}>
                    Add method
                  </Button>
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                {totalMethodsOnFile > 1 ? (
                  <>
                    You have {totalMethodsOnFile} payment methods on file.{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/vendor/banking')}
                      className="font-medium text-primary hover:underline"
                    >
                      Manage all methods in Banking
                    </button>
                    .
                  </>
                ) : (
                  <>Used for your monthly membership. Commissions can route to a separate method — add one in Banking.</>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Cancel / reactivate + disclaimer */}
      <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-2xl border-destructive/20 bg-destructive/5 dark:bg-destructive/10">
          <CardContent className="p-6 flex flex-col gap-4">
            {active ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      Cancel membership
                    </h3>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                      If you cancel, your portal will be disabled. You'll still
                      be able to log in, but you won't have access to any
                      portal features — leads, calendar, banking, products,
                      messages — until you reactivate your membership.
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setCancelDialogOpen(true)}
                  className="w-full sm:w-auto sm:self-end"
                >
                  Cancel Membership
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      Reactivate membership
                    </h3>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                      Your portal is disabled while your membership is
                      cancelled. Reactivate to restore access to leads,
                      calendar, banking, products, and messages.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleReactivate}
                  className="w-full sm:w-auto sm:self-end"
                >
                  Reactivate Membership
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Cancel confirmation */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive">
              Cancel your membership?
            </DialogTitle>
            <DialogDescription>
              This will disable your vendor portal immediately.
            </DialogDescription>
            <div className="space-y-2 text-sm text-muted-foreground mt-2">
              <p>
                You'll still be able to log in, but the portal sections —
                leads, calendar, banking, products, messages — will be
                locked until you reactivate.
              </p>
              <p>You can reactivate any time from this page.</p>
            </div>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} className="w-full sm:w-auto">
              Keep membership
            </Button>
            <Button variant="destructive" onClick={handleCancelConfirm} className="w-full sm:w-auto gap-2">
              <XCircle className="h-4 w-4" />
              Cancel membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update / Add payment method dialog. Ship #189 — when a method
          already serves membership, onSuccess updates it in place via
          its id. When none exists yet, onSuccess adds a new method
          defaulting to 'both' purpose so it covers commissions too
          (users can refine on /vendor/banking). */}
      <VendorPaymentDialog
        open={editPaymentOpen}
        onOpenChange={setEditPaymentOpen}
        blocking={false}
        initialKind={paymentMethod?.kind}
        initialHolder={paymentMethod?.holder}
        initialPurpose={paymentMethod?.purpose ?? 'both'}
        onSuccess={(method) => {
          if (paymentMethod) {
            updatePaymentMethod(vendorId, paymentMethod.id, method)
            toast.success('Payment method updated')
          } else {
            addPaymentMethod(vendorId, method)
            toast.success('Payment method added')
          }
        }}
      />
    </div>
  )
}
