import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useFeatureFlag } from '@/lib/financing/hooks/use-feature-flag'
import { statusLabel } from '@/lib/financing/display'
import type { FinancingApplicationStatus } from '@/lib/financing/adapters/_contract'

// TEMP admin manual-stepper for financing lifecycle demo. Rod-direct ask
// 2026-05-18: he needs to advance/rewind an application's status while
// walking the lifecycle demo on /financing/status. Real lender integration
// owns this transition path post-launch; this surface is the pre-launch
// hack for demos and is intentionally shaped to be easy to rip.
//
// State model — two tables, asymmetric WINS:
//   financing_applications.status   (enum: 7 values incl. terms_accepted)
//   customer_financing_profile.last_known_status  (enum: 5 values, no terms_accepted)
//
// resolveState in financing-card.tsx reads cfp WINS for approved/
// terms_accepted/denied/expired, then falls back to fa.status. So to
// flip the customer-side card to "Terms accepted" we write fa.status=
// 'terms_accepted' AND cfp.last_known_status=NULL — the null forces the
// cfp WINS branches to fall through (cfp?. optional chaining), letting
// fa.status='terms_accepted' resolve via the fallback branch. cfp envelope
// fields (amount/partner/expires) stay intact since we touch only
// last_known_status.
//
// RLS: cfp_update_admin policy (migration 058) grants admin-JWT direct
// UPDATE; fa_update_admin (047) already allowed fa.status writes.
//
// Realtime substrate for customer /financing/status is currently
// REFETCH-ONLY for these tables — supabase_realtime publication contains
// only feature_flags (PR #267). Customer tab requires refresh between
// admin stepper clicks. Banner copy reflects this constraint.

type ApplicationRow = {
  id: string
  homeowner_id: string
  status: FinancingApplicationStatus
  adapter: string
  applied_at: string
}

type CfpRow = {
  customer_id: string
  last_known_status: string | null
  last_known_amount_cents: number | null
  approval_partner: string | null
  approval_expires_at: string | null
}

type StageId = 'applied' | 'pending' | 'approved' | 'terms_accepted'

const STAGES: { id: StageId; label: string; faStatus: FinancingApplicationStatus; cfpStatus: string | null }[] = [
  { id: 'applied', label: 'Submitted', faStatus: 'applied', cfpStatus: 'applied' },
  { id: 'pending', label: 'Under review', faStatus: 'pending', cfpStatus: 'pending' },
  { id: 'approved', label: 'Approved', faStatus: 'approved', cfpStatus: 'approved' },
  { id: 'terms_accepted', label: 'Terms accepted', faStatus: 'terms_accepted', cfpStatus: null },
]

function formatCents(cents: number | null): string {
  if (cents == null) return '—'
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminFinancingApplicationDetail() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()
  const financingEnabled = useFeatureFlag('financing_enabled')

  const [app, setApp] = useState<ApplicationRow | null>(null)
  const [cfp, setCfp] = useState<CfpRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [firingStage, setFiringStage] = useState<StageId | null>(null)

  const refetch = useCallback(async () => {
    if (!appId) return
    const appRes = await supabase
      .from('financing_applications')
      .select('id,homeowner_id,status,adapter,applied_at')
      .eq('id', appId)
      .maybeSingle()
    if (appRes.error || !appRes.data) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const appRow = appRes.data as ApplicationRow
    setApp(appRow)
    const cfpRes = await supabase
      .from('customer_financing_profile')
      .select('customer_id,last_known_status,last_known_amount_cents,approval_partner,approval_expires_at')
      .eq('customer_id', appRow.homeowner_id)
      .maybeSingle()
    if (!cfpRes.error && cfpRes.data) {
      setCfp(cfpRes.data as CfpRow)
    } else {
      setCfp(null)
    }
    setLoading(false)
  }, [appId])

  useEffect(() => {
    if (financingEnabled !== true) return
    void refetch()
  }, [financingEnabled, refetch])

  const handleStageClick = async (stage: typeof STAGES[number]) => {
    if (!app) return
    setFiringStage(stage.id)
    const faUpdate = supabase
      .from('financing_applications')
      .update({ status: stage.faStatus })
      .eq('id', app.id)
    const cfpUpdate = supabase
      .from('customer_financing_profile')
      .update({ last_known_status: stage.cfpStatus })
      .eq('customer_id', app.homeowner_id)
    const [faRes, cfpRes] = await Promise.all([faUpdate, cfpUpdate])
    setFiringStage(null)
    if (faRes.error) {
      toast.error(`Application status write failed: ${faRes.error.message}`)
      return
    }
    if (cfpRes.error) {
      toast.error(`Profile status write failed: ${cfpRes.error.message}`)
      return
    }
    toast.success(`Stepped to "${stage.label}"`)
    await refetch()
  }

  if (financingEnabled === undefined) return null
  if (financingEnabled === false) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <p className="text-sm text-muted-foreground">Financing is currently disabled.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6 px-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/financing')}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Financing
        </Button>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40 p-4 flex items-start gap-3" data-testid="admin-financing-stepper-temp-banner">
        <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 dark:text-amber-200">
          <p className="font-semibold">Demo control (pre-launch)</p>
          <p className="mt-0.5 text-xs leading-relaxed">
            Manual lifecycle stepper for walking through financing states. Refresh the customer
            view (/financing/status) after each click to observe state changes. Real lender
            integration will own this transition path after launch.
          </p>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Application stepper</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Advance or rewind through the lifecycle stages: Submitted → Under review → Approved →
          Terms accepted.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : notFound || !app ? (
        <Card data-testid="admin-financing-stepper-not-found">
          <CardContent className="py-6 text-center">
            <p className="text-sm font-medium text-foreground">Application not found</p>
            <p className="text-xs text-muted-foreground mt-1">No row matches id {appId}.</p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4"
          data-testid="admin-financing-stepper-detail"
          data-financing-app-id={app.id}
        >
          <Card>
            <CardContent className="py-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Current state
                </p>
                <span
                  className="inline-flex items-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 px-2.5 py-0.5 text-[12px] font-semibold"
                  data-testid="admin-financing-stepper-current-status"
                  data-financing-status={app.status}
                >
                  {statusLabel(app.status)}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Application ID</dt>
                  <dd className="text-foreground font-mono text-xs mt-0.5 break-all">{app.id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Adapter</dt>
                  <dd className="text-foreground font-medium mt-0.5">{app.adapter}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Applied at</dt>
                  <dd className="text-foreground font-medium mt-0.5">{formatDate(app.applied_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Envelope</dt>
                  <dd className="text-foreground font-medium mt-0.5">
                    {formatCents(cfp?.last_known_amount_cents ?? null)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Profile last_known_status</dt>
                  <dd
                    className="text-foreground font-mono text-xs mt-0.5"
                    data-testid="admin-financing-stepper-cfp-status"
                    data-cfp-status={cfp?.last_known_status ?? 'null'}
                  >
                    {cfp?.last_known_status ?? <span className="text-muted-foreground italic">null</span>}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <div className="rounded-2xl border bg-card p-5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              Step to stage
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STAGES.map((stage) => {
                const isCurrent = app.status === stage.faStatus
                const isFiring = firingStage === stage.id
                return (
                  <Button
                    key={stage.id}
                    type="button"
                    variant={isCurrent ? 'default' : 'outline'}
                    onClick={() => handleStageClick(stage)}
                    disabled={firingStage !== null}
                    data-testid="admin-financing-stepper-button"
                    data-target-stage={stage.id}
                    data-is-current={isCurrent ? 'true' : 'false'}
                    className={cn('justify-start', isFiring && 'opacity-70')}
                  >
                    {isFiring ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {stage.label}
                  </Button>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
