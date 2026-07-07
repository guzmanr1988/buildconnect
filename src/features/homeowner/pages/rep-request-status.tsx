import { useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Circle, MapPin, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useRepRequestDetail } from '@/hooks/use-rep-request-detail'
import { useRepRequestActions } from '@/hooks/use-rep-request-actions'
import {
  CUSTOMER_TRACKER_STATES,
  STATUS_LABELS,
  STATUS_SYSTEM_BADGE,
  type RepRequestStatus,
} from '@/features/admin/rep-requests/rep-request-contract'

// Concierge Rep Request — homeowner status page.
// Renders the public 5-step tracker, payment summary, and cancel
// dialog. Wires to helios's useRepRequestDetail hook in commit 4;
// scaffold uses a synthetic detail so the surface is reviewable
// alongside commit 3.

const STATUS_HINT: Record<RepRequestStatus, string> = {
  pending_payment: 'Processing payment…',
  new: 'A rep will contact you within 24 hours.',
  scheduled: 'Your visit is on the calendar.',
  visited: 'Your rep is building the project now.',
  project_ready: 'Your project is ready — review it and pick a contractor.',
  contractor_selected: 'A contractor has been selected. The rep work is complete.',
  cancelled: 'This request was cancelled. Refund processing per the terms below.',
  charge_failed: 'Payment failed. Reach out to support to recover the request.',
}

export function RepRequestStatusPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [cancelOpen, setCancelOpen] = useState(false)

  // Hook is wired; commit 2.5 fills in react-query + Realtime so this
  // surface starts rendering real data without component-side changes.
  // While the scaffold returns null detail/actions, fall back to a
  // synthetic row so the page stays reviewable end-to-end alongside
  // commit 3. canCancel comes from RepRequestActions (per-role
  // derivation) not the detail row itself.
  const { detail: liveDetail, actions, isLoading, refetch } = useRepRequestDetail(id)
  const { cancel, mutating } = useRepRequestActions(id)
  const detail = liveDetail
    ? {
        id: liveDetail.id,
        status: liveDetail.status,
        address: liveDetail.address,
        description: liveDetail.description ?? '',
        canCancel: actions?.canCancel ?? false,
        refundedAmountCents: liveDetail.refundedAmountCents,
      }
    : id
      ? {
          id,
          status: 'new' as RepRequestStatus,
          address: '123 Main St, Anytown FL',
          description: 'Kitchen renovation (your description)',
          canCancel: true,
          refundedAmountCents: null as number | null,
        }
      : null

  if (!id) return <Navigate to="/home" replace />
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Rep request not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/home')}>
          Back to home
        </Button>
      </div>
    )
  }

  const systemBadge = STATUS_SYSTEM_BADGE[detail.status]
  const isTerminal =
    detail.status === 'cancelled' ||
    detail.status === 'charge_failed' ||
    detail.status === 'contractor_selected'

  async function onConfirmCancel() {
    // Hook is wired through useRepRequestActions.cancel(); commit 5
    // swaps the no-op for the cancel-rep-request edge-fn POST that
    // fires Stripe Refund.create for the $200 refundable portion.
    // refetch() pulls the optimistic post-cancel row state.
    const r = await cancel()
    if (r.ok) {
      await refetch()
      setCancelOpen(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto px-4 py-8 sm:py-12"
      data-testid="rep-request-status"
      data-status={detail.status}
    >
      <Card className="rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <header>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Rep Request
              </p>
              <h1 className="mt-1 text-xl sm:text-2xl font-bold font-heading tracking-tight">
                {detail.description}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {detail.address}
              </p>
            </div>
            {systemBadge && (
              <span
                data-testid="rep-request-status-system-badge"
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide',
                  systemBadge.tone === 'danger'
                    ? 'bg-destructive/15 text-destructive border border-destructive/30'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {systemBadge.label}
              </span>
            )}
          </div>
        </header>

        <Tracker status={detail.status} />

        <p className="text-sm text-foreground" data-testid="rep-request-status-hint">
          <span className="font-semibold">{STATUS_LABELS[detail.status]}</span>
          {' — '}
          <span className="text-muted-foreground">{STATUS_HINT[detail.status]}</span>
        </p>

        <Card className="rounded-lg bg-muted/40 p-4 text-sm">
          <p className="font-semibold mb-2">Payment</p>
          <p className="text-muted-foreground">
            $250 paid · $200 refundable · $50 retained
            {detail.refundedAmountCents != null && (
              <span className="block mt-1 text-emerald-600">
                ${(detail.refundedAmountCents / 100).toFixed(2)} refunded — expect 5-7 business days.
              </span>
            )}
          </p>
        </Card>

        {!isTerminal && detail.canCancel && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setCancelOpen(true)}
              data-testid="rep-request-status-cancel-btn"
            >
              Cancel Request
            </Button>
          </div>
        )}
      </Card>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent data-testid="rep-request-status-cancel-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to cancel?</AlertDialogTitle>
            <AlertDialogDescription>
              You will receive a $200 refund to your original payment method
              within 5-7 business days. The $50 trip fee is non-refundable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Keep Request</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmCancel}
              disabled={mutating}
              data-testid="rep-request-status-cancel-confirm"
            >
              {mutating ? 'Cancelling…' : 'Cancel & Get $200 Back'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

function Tracker({ status }: { status: RepRequestStatus }) {
  // Tracker only renders the 5 customer-visible states. pending_payment,
  // cancelled, and charge_failed never reach the visible tracker path
  // (shouldRenderTracker is false on the post-submit redirect; the
  // system-state badge above handles surface for cancelled/charge_failed).
  // Layout: vertical stepper on mobile (< sm), horizontal on sm+. Mobile
  // uses per-segment connectors (absolute below each dot); desktop uses
  // the two-bar treatment (bg-muted rail + bg-primary progress fill).
  const idx = CUSTOMER_TRACKER_STATES.indexOf(status)
  const safeIdx = idx === -1 ? 0 : idx
  const pct = (safeIdx / Math.max(1, CUSTOMER_TRACKER_STATES.length - 1)) * 100
  return (
    <div
      className="relative flex flex-col space-y-9 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:px-2"
      data-testid="rep-request-status-tracker"
    >
      <div className="hidden sm:block absolute left-6 right-6 top-4 h-0.5 bg-muted -z-0" />
      <div
        className="hidden sm:block absolute left-6 top-4 h-0.5 bg-primary -z-0 transition-all"
        style={{ width: `calc((100% - 48px) * ${pct} / 100)` }}
      />
      {CUSTOMER_TRACKER_STATES.map((s, i) => {
        const reached = i <= safeIdx
        const isCurrent = i === safeIdx
        const isLast = i === CUSTOMER_TRACKER_STATES.length - 1
        const nextReached = i + 1 <= safeIdx
        return (
          <div
            key={s}
            className="relative z-10 flex flex-row items-center gap-3 sm:flex-col sm:items-center sm:gap-1.5"
            data-testid="rep-request-status-tracker-step"
            data-step={s}
            data-reached={reached ? 'true' : 'false'}
            data-current={isCurrent ? 'true' : 'false'}
          >
            <div className="relative flex flex-col items-center shrink-0">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center transition-colors',
                  reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  isCurrent && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background',
                )}
              >
                {reached ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'sm:hidden absolute top-full left-1/2 -translate-x-1/2 w-0.5 h-9 transition-colors',
                    nextReached ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                'text-sm font-medium sm:text-[10px] md:text-xs sm:text-center sm:max-w-[64px]',
                reached ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {STATUS_LABELS[s]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default RepRequestStatusPage
