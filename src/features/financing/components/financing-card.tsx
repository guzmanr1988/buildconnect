import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useFeatureFlag } from '@/lib/financing/hooks/use-feature-flag'
import { adapterDisplayName } from '@/lib/financing/display'
import type { FinancingApplicationStatus } from '@/lib/financing/adapters/_contract'

type LatestApplication = {
  id: string
  status: FinancingApplicationStatus
  adapter: string
  applied_at: string
}

type FinancingProfile = {
  has_financing: boolean
  last_known_status: FinancingApplicationStatus | null
  last_known_amount_cents: number | null
  approval_partner: string | null
  approval_expires_at: string | null
}

type CardState =
  | 'never-applied'
  | 'applied'
  | 'pending'
  | 'approved'
  | 'terms_accepted'
  | 'denied'
  | 'expired'

type Tone = 'neutral' | 'progress' | 'success' | 'warning' | 'destructive'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  progress: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  destructive: 'bg-destructive/10 text-destructive',
}

function formatCents(cents: number | null | undefined): string | null {
  if (cents == null) return null
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

// Effective state combines cfp + latest application. cfp wins for envelope
// states (approved/terms_accepted/denied/expired) because cfp carries the
// envelope amount + partner that the card needs to render the offer copy.
// Falls back to financing_applications.status for in-flight states.
function resolveState(
  cfp: FinancingProfile | null,
  app: LatestApplication | null
): CardState {
  if (cfp?.last_known_status === 'terms_accepted') return 'terms_accepted'
  if (cfp?.last_known_status === 'approved') return 'approved'
  if (cfp?.last_known_status === 'denied') return 'denied'
  if (cfp?.last_known_status === 'expired') return 'expired'
  if (app?.status === 'pending') return 'pending'
  if (app?.status === 'applied') return 'applied'
  if (app?.status === 'approved') return 'approved'
  if (app?.status === 'terms_accepted') return 'terms_accepted'
  if (app?.status === 'denied') return 'denied'
  if (app?.status === 'expired') return 'expired'
  return 'never-applied'
}

type RenderSpec = {
  title: string
  badge: string | null
  tone: Tone
  subtitle: string
  destination: string
}

function specForState(
  state: CardState,
  app: LatestApplication | null,
  cfp: FinancingProfile | null
): RenderSpec {
  const amount = formatCents(cfp?.last_known_amount_cents)
  const partner = cfp?.approval_partner
    ? adapterDisplayName(cfp.approval_partner)
    : app
      ? adapterDisplayName(app.adapter)
      : null
  const statusUrl = app ? `/home/financing/status/${app.id}` : '/home/financing/apply'

  switch (state) {
    case 'never-applied':
      return {
        title: 'Apply for financing',
        badge: null,
        tone: 'neutral',
        subtitle: 'See if your project qualifies — no credit-impacting check',
        destination: '/home/financing/apply',
      }
    case 'applied':
      return {
        title: 'Your application',
        badge: 'Submitted',
        tone: 'progress',
        subtitle: 'We received your application — view next steps',
        destination: statusUrl,
      }
    case 'pending':
      return {
        title: 'Your application',
        badge: 'Under review',
        tone: 'progress',
        subtitle: 'Your lender is reviewing — view status',
        destination: statusUrl,
      }
    case 'approved':
      return {
        title:
          amount && partner
            ? `Your offer — ${amount} from ${partner}`
            : amount
              ? `Your offer — ${amount}`
              : 'Your offer is ready',
        badge: 'Approved',
        tone: 'success',
        subtitle: 'View offer details and accept terms',
        destination: statusUrl,
      }
    case 'terms_accepted':
      return {
        title:
          amount && partner
            ? `Your offer accepted — ${amount} from ${partner}`
            : amount
              ? `Your offer accepted — ${amount}`
              : 'Your offer is accepted',
        badge: 'Terms accepted',
        tone: 'success',
        subtitle: 'View offer details and project status',
        destination: statusUrl,
      }
    case 'denied':
      return {
        title: 'Application denied',
        badge: null,
        tone: 'neutral',
        subtitle: 'A denial from one lender does not change what is possible',
        destination: statusUrl,
      }
    case 'expired':
      return {
        title: 'Offer expired — reapply?',
        badge: null,
        tone: 'warning',
        subtitle: 'Start a fresh application to refresh your offer',
        destination: '/home/financing/apply',
      }
  }
}

export function FinancingCard() {
  const profile = useAuthStore((s) => s.profile)
  const navigate = useNavigate()
  const enabled = useFeatureFlag('financing_enabled')
  const [app, setApp] = useState<LatestApplication | null>(null)
  const [cfp, setCfp] = useState<FinancingProfile | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setLoaded(true)
      return
    }
    if (!profile?.id) {
      setLoaded(true)
      return
    }
    let cancelled = false
    void Promise.allSettled([
      supabase
        .from('financing_applications')
        .select('id,status,adapter,applied_at')
        .eq('homeowner_id', profile.id)
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('customer_financing_profile')
        .select('has_financing,last_known_status,last_known_amount_cents,approval_partner,approval_expires_at')
        .eq('customer_id', profile.id)
        .maybeSingle(),
    ]).then(([appRes, cfpRes]) => {
      if (cancelled) return
      if (appRes.status === 'fulfilled' && !appRes.value.error && appRes.value.data) {
        setApp(appRes.value.data as LatestApplication)
      }
      if (cfpRes.status === 'fulfilled' && !cfpRes.value.error && cfpRes.value.data) {
        setCfp(cfpRes.value.data as FinancingProfile)
      }
      // Always flip loaded — even if both fetches fail the card must render
      // (apply-CTA fallback). Rod-direct bug 2026-05-17: card was disappearing
      // post-approval; always-render is now the invariant.
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [profile?.id, enabled])

  if (!enabled) return null
  if (!loaded) return null

  const state = resolveState(cfp, app)
  const spec = specForState(state, app, cfp)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      data-testid="financing-card"
      data-financing-card-state={state}
    >
      <button
        type="button"
        onClick={() => navigate(spec.destination)}
        className="w-full rounded-2xl border bg-card p-4 flex items-center gap-4 text-left transition-all hover:shadow-md hover:-translate-y-[1px]"
        data-financing-state={state}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Financing
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-[15px] font-semibold font-heading text-foreground leading-tight truncate">
              {spec.title}
            </p>
            {spec.badge ? (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0',
                  TONE_CLASS[spec.tone]
                )}
                data-financing-status={state}
              >
                {spec.badge}
              </span>
            ) : null}
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">{spec.subtitle}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </motion.div>
  )
}
