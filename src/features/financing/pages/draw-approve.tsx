import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, ShieldAlert, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useFeatureFlagOnce } from '@/lib/financing/hooks/use-feature-flag'
import {
  getDrawRequestById,
  invokeDrawRequestApprove,
  type DrawRequestRow,
} from '@/lib/api/financing'

function formatCents(c: number): string {
  return `$${Math.round(c / 100).toLocaleString('en-US')}`
}

export function FinancingDrawApprovePage() {
  const { drawId } = useParams<{ drawId: string }>()
  const [searchParams] = useSearchParams()
  const smsToken = searchParams.get('token') ?? ''
  const financingEnabled = useFeatureFlagOnce('financing_enabled')

  const [draw, setDraw] = useState<DrawRequestRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState<'approve' | 'dispute' | null>(null)
  const [result, setResult] = useState<{ status: 'approved' | 'disputed'; windowEnd: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!drawId) {
      setLoaded(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const row = await getDrawRequestById(drawId)
        if (!cancelled) setDraw(row)
      } catch {
        if (!cancelled) setError('Could not load draw request.')
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [drawId])

  if (financingEnabled === undefined) return null
  if (financingEnabled === false) return <Navigate to="/home" replace />

  async function handleDecision(decision: 'approve' | 'dispute') {
    if (!drawId || !smsToken) {
      toast.error('Missing approval token. Use the link from your SMS.')
      return
    }
    setSubmitting(decision)
    try {
      const res = await invokeDrawRequestApprove({
        draw_request_id: drawId,
        sms_token: smsToken,
        decision,
      })
      setResult({ status: res.status, windowEnd: res.dispute_window_ends_at })
      toast.success(decision === 'approve' ? 'Draw approved.' : 'Draw disputed.')
    } catch (err) {
      const code = err instanceof Error ? err.message : 'draw_request_approve_failed'
      if (code === 'invalid_or_expired_token' || code === 'missing_sms_token') {
        toast.error('Approval link expired or already used.')
      } else if (code === 'draw_not_in_sms_pending_state') {
        toast.error('This draw is no longer pending.')
      } else if (code === 'not_homeowner_of_draw') {
        toast.error('This approval link does not belong to your account.')
      } else if (code === 'invalid_decision') {
        toast.error('Choose Approve or Dispute.')
      } else if (code === 'financing_disabled') {
        toast.error('Financing is currently disabled.')
      } else {
        toast.error('Could not process your response.')
      }
    } finally {
      setSubmitting(null)
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !draw) {
    return (
      <div className="flex flex-col gap-6 max-w-xl mx-auto">
        <Button asChild variant="ghost" size="sm" className="self-start -ml-2">
          <Link to="/home">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Home
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Draw request not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {error ?? 'This draw request may have been removed or the link is invalid.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pending = draw.status === 'sms_pending'
  const finalStatus = result?.status ?? (draw.status === 'approved' || draw.status === 'disputed' ? draw.status : null)

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto" data-testid="homeowner-draw-approve-page">
      <Button asChild variant="ghost" size="sm" className="self-start -ml-2">
        <Link to="/home">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Home
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Approve milestone draw</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your contractor requested a milestone draw from your approved financing envelope.
        </p>
      </div>

      <Card data-testid="homeowner-draw-detail">
        <CardHeader>
          <CardTitle>Draw amount</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-3xl font-bold text-foreground" data-testid="homeowner-draw-amount">
            {formatCents(draw.amount_cents)}
          </p>
          <p className="text-xs text-muted-foreground">
            Approving releases funds to your contractor after a 48-hour review window. You can dispute the
            request if the milestone hasn&apos;t been completed.
          </p>
        </CardContent>
      </Card>

      {pending && !finalStatus && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="homeowner-draw-actions">
          <Button
            type="button"
            onClick={() => void handleDecision('approve')}
            disabled={submitting !== null}
            data-testid="homeowner-draw-approve"
            data-financing-draw-approve
          >
            {submitting === 'approve' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Approve draw
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDecision('dispute')}
            disabled={submitting !== null}
            data-testid="homeowner-draw-dispute"
            data-financing-draw-dispute
          >
            {submitting === 'dispute' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4 mr-2" />
            )}
            Dispute
          </Button>
        </div>
      )}

      {finalStatus === 'approved' && (
        <Card className="border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-700/40" data-testid="homeowner-draw-result-approved">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-foreground">Draw approved</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Funds release to your contractor 48 hours from approval. You can still dispute during the
                review window if something isn&apos;t right.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {finalStatus === 'disputed' && (
        <Card className="border-destructive/40 bg-destructive/5" data-testid="homeowner-draw-result-disputed">
          <CardContent className="p-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 mt-0.5 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-foreground">Draw disputed</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Funds are held. A BuildConnect support agent will reach out to help resolve the dispute.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!pending && !finalStatus && (
        <Card data-testid="homeowner-draw-already-decided">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              This draw is no longer pending. Current status: <span className="font-semibold">{draw.status}</span>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default FinancingDrawApprovePage
