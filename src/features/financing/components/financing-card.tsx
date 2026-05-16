import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { isFinancingEnabled } from '@/lib/financing/feature-flag'
import { statusLabel, statusTone } from '@/lib/financing/display'
import type { FinancingApplicationStatus } from '@/lib/financing/adapters/_contract'

type LatestApplication = {
  id: string
  status: FinancingApplicationStatus
  adapter: string
  applied_at: string
}

const TONE_CLASS: Record<ReturnType<typeof statusTone>, string> = {
  neutral: 'bg-muted text-muted-foreground',
  progress: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  destructive: 'bg-destructive/10 text-destructive',
}

export function FinancingCard() {
  const profile = useAuthStore((s) => s.profile)
  const navigate = useNavigate()
  const [latest, setLatest] = useState<LatestApplication | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!isFinancingEnabled()) return
    if (!profile?.id) {
      setLoaded(true)
      return
    }
    let cancelled = false
    void supabase
      .from('financing_applications')
      .select('id,status,adapter,applied_at')
      .eq('homeowner_id', profile.id)
      .order('applied_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        // PostgREST returns null + no error when no row matches; treat any
        // error (e.g. RLS misconfig, table missing pre-migration-apply) as
        // "no application" — surface CTA, not noise.
        if (!error && data) setLatest(data as LatestApplication)
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [profile?.id])

  if (!isFinancingEnabled()) return null
  if (!loaded) return null

  const hasApplication = latest !== null
  const tone = hasApplication ? statusTone(latest.status) : 'neutral'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      data-testid="financing-card"
    >
      <button
        type="button"
        onClick={() =>
          navigate(hasApplication ? `/home/financing/status/${latest.id}` : '/home/financing/apply')
        }
        className="w-full rounded-2xl border bg-card p-4 flex items-center gap-4 text-left transition-all hover:shadow-md hover:-translate-y-[1px]"
        data-financing-state={hasApplication ? 'has-application' : 'apply-cta'}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Financing
          </p>
          {hasApplication ? (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[15px] font-semibold font-heading text-foreground leading-tight truncate">
                Your application
              </p>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  TONE_CLASS[tone]
                )}
                data-financing-status={latest.status}
              >
                {statusLabel(latest.status)}
              </span>
            </div>
          ) : (
            <p className="text-[15px] font-semibold font-heading text-foreground leading-tight mt-0.5">
              Apply for financing
            </p>
          )}
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {hasApplication
              ? 'View status and next steps'
              : 'See if your project qualifies — no credit-impacting check'}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </motion.div>
  )
}
