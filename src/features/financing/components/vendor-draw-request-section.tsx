import { useEffect, useMemo, useState } from 'react'
import { Loader2, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useFeatureFlag } from '@/lib/financing/hooks/use-feature-flag'
import {
  getFinancingApplicationByProject,
  getFinancingApprovalByApplicationId,
  listDrawRequestsBySentProject,
  invokeDrawRequestCreate,
  type DrawRequestRow,
  type DrawRequestStatus,
  type FinancingApprovalRow,
} from '@/lib/api/financing'

const PLATFORM_COMMISSION_PCT = 10

type Props = {
  sentProjectId: string
  leadStatus: string
}

function statusLabel(s: DrawRequestStatus): string {
  switch (s) {
    case 'sms_pending':
      return 'Awaiting approval'
    case 'approved':
      return 'Approved'
    case 'disputed':
      return 'Disputed'
    case 'paid':
      return 'Paid'
    case 'cancelled':
      return 'Cancelled'
    case 'expired':
      return 'Expired'
  }
}

function statusTone(s: DrawRequestStatus): string {
  switch (s) {
    case 'approved':
    case 'paid':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    case 'sms_pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    case 'disputed':
    case 'cancelled':
    case 'expired':
      return 'bg-destructive/10 text-destructive'
  }
}

function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[,$\s]/g, '')
  if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Math.round(parseFloat(cleaned) * 100)
}

function formatCents(c: number): string {
  return `$${Math.round(c / 100).toLocaleString('en-US')}`
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function disputeWindowRemaining(iso: string | null): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Window closed'
  if (ms < 60 * 60 * 1000) return '<1h left'
  const h = Math.floor(ms / 1000 / 60 / 60)
  return `${h}h left`
}

export function VendorDrawRequestSection({ sentProjectId, leadStatus }: Props) {
  const enabled = useFeatureFlag('financing_enabled')
  const [approval, setApproval] = useState<FinancingApprovalRow | null>(null)
  const [draws, setDraws] = useState<DrawRequestRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [amountInput, setAmountInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setLoaded(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const app = await getFinancingApplicationByProject(sentProjectId)
        if (cancelled) return
        if (!app) {
          setLoaded(true)
          return
        }
        const [appRow, drawRows] = await Promise.all([
          getFinancingApprovalByApplicationId(app.id),
          listDrawRequestsBySentProject(sentProjectId),
        ])
        if (cancelled) return
        setApproval(appRow)
        setDraws(drawRows)
      } catch {
        // tolerate missing draw_requests table during scaffold phase
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sentProjectId, enabled])

  const envelopeCents = approval?.envelope_amount_cents ?? 0
  const drawnCents = useMemo(
    () =>
      draws
        .filter((d) => d.status === 'approved' || d.status === 'paid')
        .reduce((sum, d) => sum + d.amount_cents, 0),
    [draws],
  )
  const remainingCents = Math.max(0, envelopeCents - drawnCents)
  const hasActivePending = draws.some((d) => d.status === 'sms_pending')
  const isSoldActive = leadStatus === 'sold-active' || leadStatus === 'active'
  const isApproved = approval !== null && envelopeCents > 0
  const canRequest = enabled === true && isSoldActive && isApproved && !hasActivePending && remainingCents > 0

  async function handleSubmit() {
    const amountCents = dollarsToCents(amountInput)
    if (amountCents === null || amountCents <= 0) {
      toast.error('Enter a valid request amount.')
      return
    }
    if (amountCents > remainingCents) {
      toast.error(`Request exceeds remaining envelope (${formatCents(remainingCents)}).`)
      return
    }
    setSubmitting(true)
    try {
      const res = await invokeDrawRequestCreate({
        sent_project_id: sentProjectId,
        amount_cents: amountCents,
        idempotency_key: crypto.randomUUID(),
      })
      toast.success('SMS sent to homeowner — approval pending')
      setDialogOpen(false)
      setAmountInput('')
      const refreshed = await listDrawRequestsBySentProject(sentProjectId)
      setDraws(refreshed)
      void res
    } catch (err) {
      const code = err instanceof Error ? err.message : 'draw_request_failed'
      if (code === 'amount_exceeds_remaining') {
        toast.error('Amount exceeds the remaining envelope.')
      } else if (code === 'sent_project_not_sold') {
        toast.error('Draws are only available on sold-active leads.')
      } else if (code === 'active_draw_pending') {
        toast.error('Another draw is already pending homeowner approval.')
        const refreshed = await listDrawRequestsBySentProject(sentProjectId)
        setDraws(refreshed)
      } else if (code === 'financing_disabled') {
        toast.error('Financing is currently disabled.')
      } else if (code === 'no_approved_financing_application_for_project') {
        toast.error('This project does not have an approved financing envelope.')
      } else if (code === 'vendor_not_owner_of_sent_project' || code === 'sent_project_not_found') {
        toast.error('You do not have access to this project.')
      } else if (code === 'idempotency_key_amount_mismatch') {
        toast.error('Submission state mismatch — please refresh and try again.')
      } else if (code === 'invalid_amount_cents') {
        toast.error('Enter a valid request amount.')
      } else {
        toast.error('Could not submit draw request.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!enabled || !loaded) return null
  if (!isApproved) return null

  const requestedCents = dollarsToCents(amountInput) ?? 0
  const previewCommissionCents = Math.floor((requestedCents * PLATFORM_COMMISSION_PCT) / 100)
  const previewPayoutCents = Math.max(0, requestedCents - previewCommissionCents)

  return (
    <div
      className="rounded-lg border border-border/60 bg-card p-3 space-y-3"
      data-testid="vendor-draw-section"
      data-financing-draw-section
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Milestone draws
        </p>
        {canRequest ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setDialogOpen(true)}
            data-testid="vendor-draw-request-button"
            data-financing-request-funds
          >
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            Request funds
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs" data-testid="vendor-draw-balance">
        <div>
          <p className="text-muted-foreground">Envelope</p>
          <p className="font-semibold text-foreground">{formatCents(envelopeCents)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Drawn</p>
          <p className="font-semibold text-foreground">{formatCents(drawnCents)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Remaining</p>
          <p className="font-semibold text-emerald-700 dark:text-emerald-400" data-testid="vendor-draw-remaining">
            {formatCents(remainingCents)}
          </p>
        </div>
      </div>

      {draws.length > 0 ? (
        <ul className="space-y-1.5" data-testid="vendor-draw-list">
          {draws.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between text-xs rounded border border-border/40 bg-muted/20 px-2 py-1.5"
              data-testid={`vendor-draw-row-${d.id}`}
              data-financing-draw-status={d.status}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-semibold text-foreground">{formatCents(d.amount_cents)}</span>
                <span className="text-[10px] text-muted-foreground">
                  {timeAgo(d.created_at)}
                  {d.status === 'approved' && d.dispute_window_ends_at
                    ? ` · ${disputeWindowRemaining(d.dispute_window_ends_at)}`
                    : ''}
                </span>
              </div>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0',
                  statusTone(d.status),
                )}
              >
                {statusLabel(d.status)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={(o) => !submitting && setDialogOpen(o)}>
        <DialogContent data-testid="vendor-draw-request-dialog">
          <DialogHeader>
            <DialogTitle>Request funds</DialogTitle>
            <DialogDescription>
              Homeowner gets an SMS to approve or dispute. Funds release 48h after approval.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmit()
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="draw-amount">Amount</Label>
              <Input
                id="draw-amount"
                inputMode="decimal"
                placeholder={`Max ${formatCents(remainingCents)}`}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                data-testid="vendor-draw-amount-input"
              />
              <Button
                type="button"
                variant="link"
                size="sm"
                className="self-start h-auto p-0 text-xs"
                onClick={() => setAmountInput(((remainingCents / 100).toFixed(2)).replace(/\.00$/, ''))}
                data-testid="vendor-draw-request-full"
              >
                Request full remaining ({formatCents(remainingCents)})
              </Button>
            </div>

            {requestedCents > 0 ? (
              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1" data-testid="vendor-draw-preview">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Request</span>
                  <span className="font-semibold">{formatCents(requestedCents)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>You receive (90%)</span>
                  <span className="font-semibold" data-testid="vendor-draw-preview-payout">
                    {formatCents(previewPayoutCents)}
                  </span>
                </div>
                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                  <span>Platform fee (10%)</span>
                  <span className="font-semibold" data-testid="vendor-draw-preview-commission">
                    {formatCents(previewCommissionCents)}
                  </span>
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} data-testid="vendor-draw-submit">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  'Submit request'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default VendorDrawRequestSection
