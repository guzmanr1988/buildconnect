import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useFeatureFlag } from '@/lib/financing/hooks/use-feature-flag'
import { adapterDisplayName } from '@/lib/financing/display'

type CfpRow = {
  has_financing: boolean | null
  last_known_status: string | null
  last_known_amount_cents: number | null
  approval_partner: string | null
  approval_expires_at: string | null
}

type LatestApp = { id: string }

function formatCents(cents: number | null | undefined): string | null {
  if (cents == null) return null
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ApprovedAmountBanner() {
  const profile = useAuthStore((s) => s.profile)
  const enabled = useFeatureFlag('financing_enabled')
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const [cfp, setCfp] = useState<CfpRow | null>(null)
  const [app, setApp] = useState<LatestApp | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled || !profile?.id) {
      setLoaded(true)
      return
    }
    let cancelled = false
    void Promise.allSettled([
      supabase
        .from('customer_financing_profile')
        .select('has_financing,last_known_status,last_known_amount_cents,approval_partner,approval_expires_at')
        .eq('customer_id', profile.id)
        .maybeSingle(),
      supabase
        .from('financing_applications')
        .select('id')
        .eq('homeowner_id', profile.id)
        .in('status', ['approved', 'terms_accepted'])
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([cfpRes, appRes]) => {
      if (cancelled) return
      if (cfpRes.status === 'fulfilled' && !cfpRes.value.error && cfpRes.value.data) {
        setCfp(cfpRes.value.data as CfpRow)
      }
      if (appRes.status === 'fulfilled' && !appRes.value.error && appRes.value.data) {
        setApp(appRes.value.data as LatestApp)
      }
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [profile?.id, enabled])

  if (!enabled || !loaded || !cfp) return null
  if (cfp.has_financing !== true) return null
  if (cfp.last_known_status !== 'approved' && cfp.last_known_status !== 'terms_accepted') {
    return null
  }
  if (!cfp.last_known_amount_cents || cfp.last_known_amount_cents <= 0) return null
  if (cfp.approval_expires_at) {
    const exp = new Date(cfp.approval_expires_at).getTime()
    if (Number.isFinite(exp) && exp < Date.now()) return null
  }

  const envelopeCents = cfp.last_known_amount_cents
  const allocatedCents = app
    ? sentProjects.reduce((acc, sp) => {
        if (sp.applied_financing_application_id !== app.id) return acc
        return acc + (sp.applied_financing_amount_cents ?? 0)
      }, 0)
    : 0
  const remainingCents = Math.max(0, envelopeCents - allocatedCents)
  const remaining = formatCents(remainingCents)
  const envelope = formatCents(envelopeCents)
  if (!remaining || !envelope) return null
  const partner = cfp.approval_partner ? adapterDisplayName(cfp.approval_partner) : null
  const expiresText = cfp.approval_expires_at
    ? `Approved through ${formatDate(cfp.approval_expires_at)}`
    : null
  const hasAllocations = allocatedCents > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 }}
      data-testid="financing-available-banner"
      className="rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5 p-5 flex flex-col gap-2"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
        Financing available
      </p>
      <p className="text-xl sm:text-2xl font-bold font-heading text-foreground leading-tight">
        You have{' '}
        <span data-financing-banner-amount={remainingCents}>{remaining}</span>
        {partner ? <> available from {partner}</> : <> available</>}
      </p>
      {hasAllocations && (
        <p
          className="text-sm text-muted-foreground"
          data-financing-banner-envelope={envelopeCents}
        >
          {envelope} approved total
        </p>
      )}
      {expiresText && (
        <p className="text-sm text-muted-foreground">{expiresText}</p>
      )}
      {app && (
        <Link
          to={`/home/financing/status/${app.id}`}
          data-testid="financing-available-banner-cta"
          className="self-start inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200 transition-colors"
        >
          View application
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </motion.div>
  )
}
