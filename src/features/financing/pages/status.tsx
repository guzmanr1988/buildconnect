import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useFeatureFlagOnce } from '@/lib/financing/hooks/use-feature-flag'
import { adapterDisplayName, statusLabel, statusTone } from '@/lib/financing/display'
import type { FinancingApplicationStatus } from '@/lib/financing/adapters/_contract'

type ApplicationRow = {
  id: string
  status: FinancingApplicationStatus
  adapter: string
  applied_at: string
}

type FinancingProfileRow = {
  has_financing: boolean
  last_known_status: string | null
  last_known_amount_cents: number | null
  approval_partner: string | null
  approval_expires_at: string | null
}

const STAGES: { id: FinancingApplicationStatus; label: string }[] = [
  { id: 'applied', label: 'Submitted' },
  { id: 'pending', label: 'Under review' },
  { id: 'approved', label: 'Approved' },
  { id: 'terms_accepted', label: 'Terms accepted' },
]

const TONE_CLASS: Record<ReturnType<typeof statusTone>, string> = {
  neutral: 'bg-muted text-muted-foreground',
  progress: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  destructive: 'bg-destructive/10 text-destructive',
}

function formatCents(cents: number | null): string {
  if (cents == null) return '—'
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function reachedStage(current: FinancingApplicationStatus, stageIdx: number): boolean {
  const order: Record<FinancingApplicationStatus, number> = {
    pending: 1,
    applied: 0,
    approved: 2,
    terms_accepted: 3,
    denied: -1,
    expired: -1,
    cancelled: -1,
  }
  const currentIdx = order[current]
  return currentIdx >= stageIdx
}

export function FinancingStatusPage() {
  const { applicationId } = useParams<{ applicationId: string }>()
  const profile = useAuthStore((s) => s.profile)
  const navigate = useNavigate()
  const financingEnabled = useFeatureFlagOnce('financing_enabled')
  const [application, setApplication] = useState<ApplicationRow | null>(null)
  const [financingProfile, setFinancingProfile] = useState<FinancingProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (financingEnabled !== true || !profile?.id || !applicationId) return
    let cancelled = false
    void Promise.all([
      supabase
        .from('financing_applications')
        .select('id,status,adapter,applied_at')
        .eq('id', applicationId)
        .maybeSingle(),
      supabase
        .from('customer_financing_profile')
        .select('has_financing,last_known_status,last_known_amount_cents,approval_partner,approval_expires_at')
        .eq('customer_id', profile.id)
        .maybeSingle(),
    ]).then(([appRes, profRes]) => {
      if (cancelled) return
      if (appRes.error || !appRes.data) {
        setNotFound(true)
      } else {
        setApplication(appRes.data as ApplicationRow)
      }
      if (!profRes.error && profRes.data) {
        setFinancingProfile(profRes.data as FinancingProfileRow)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [applicationId, profile?.id, financingEnabled])

  if (financingEnabled === undefined) return null
  if (financingEnabled === false) return <Navigate to="/home" replace />
  if (!profile) return <Navigate to="/login" replace />

  const tone = application ? statusTone(application.status) : 'neutral'
  const showApprovalDetails =
    application &&
    (application.status === 'approved' || application.status === 'terms_accepted') &&
    financingProfile

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/home')}
          className="-ml-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Home
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Application status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your financing application here. We will email you whenever the status changes.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : notFound || !application ? (
        <div className="rounded-2xl border bg-card p-6 text-center" data-testid="financing-status-not-found">
          <p className="text-sm font-medium text-foreground">Application not found</p>
          <p className="text-xs text-muted-foreground mt-1">
            This application may have been removed, or you may not have access to view it.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/home/financing/apply')}
            className="mt-4"
          >
            Start a new application
          </Button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4"
          data-testid="financing-status-detail"
          data-financing-status={application.status}
        >
          <div className="rounded-2xl border bg-card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Current status
              </p>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold',
                  TONE_CLASS[tone]
                )}
              >
                {statusLabel(application.status)}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Lender</dt>
                <dd className="text-foreground font-medium mt-0.5">{financingProfile?.approval_partner ?? adapterDisplayName(application.adapter)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Submitted</dt>
                <dd className="text-foreground font-medium mt-0.5">{formatDate(application.applied_at)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Reference</dt>
                <dd className="text-foreground font-mono text-xs mt-0.5 break-all">{application.id}</dd>
              </div>
            </dl>
          </div>

          {application.status !== 'denied' && application.status !== 'expired' && application.status !== 'cancelled' ? (
            <div className="rounded-2xl border bg-card p-5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                Progress
              </p>
              <ol className="flex flex-col gap-3">
                {STAGES.map((stage, idx) => {
                  const reached = reachedStage(application.status, idx)
                  const isCurrent = stage.id === application.status
                  return (
                    <li key={stage.id} className="flex items-center gap-3">
                      <div
                        className={cn(
                          'h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold',
                          reached
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {idx + 1}
                      </div>
                      <p
                        className={cn(
                          'text-sm',
                          isCurrent ? 'font-semibold text-foreground' : reached ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {stage.label}
                      </p>
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : null}

          {showApprovalDetails ? (
            <div className="rounded-2xl border bg-emerald-50/50 dark:bg-emerald-500/5 p-5">
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-widest mb-3">
                Approval terms
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Approved amount</dt>
                  <dd className="text-foreground font-semibold mt-0.5">
                    {formatCents(financingProfile?.last_known_amount_cents ?? null)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Partner</dt>
                  <dd className="text-foreground font-medium mt-0.5">
                    {financingProfile?.approval_partner ?? adapterDisplayName(application.adapter)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Offer valid through</dt>
                  <dd className="text-foreground font-medium mt-0.5">
                    {formatDate(financingProfile?.approval_expires_at ?? null)}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground mt-4">
                Full envelope, APR, and term details will arrive in your approval email and on the
                offer letter from your lender.
              </p>
            </div>
          ) : null}

          {application.status === 'denied' ? (
            <div className="rounded-2xl border bg-card p-5">
              <p className="text-sm text-foreground">
                Your application was not approved by this lender. A denial from one lender does not
                change what is possible for your project — you can apply to another partner.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/home/financing/apply')}
                className="mt-3"
              >
                Try another lender
              </Button>
            </div>
          ) : null}
        </motion.div>
      )}
    </div>
  )
}

export default FinancingStatusPage
