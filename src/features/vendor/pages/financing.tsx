// Vendor Financing tab — task_1781498659178_629.
//
// Surfaces the admin-maintained lenders (mig 048 + 049 + 050 + 056 + 057) to
// the vendor so they can pick which lenders THEY apply through. Per-vendor
// state lives in vendor_lenders (mig 071): one row per (vendor_id, lender_id)
// with active + applied_at.
//
// Five-axis gating (composes existing admin + vendor master):
//   1. feature_flags.financing_enabled = true        (admin global)
//   2. feature_flags.financing_category_<cat> != false (admin per-category)
//   3. lenders.active = true AND deleted_at IS NULL  (admin per-lender)
//   4. useVendorSettingsStore.financingEnabled        (vendor master — gates
//      this tab's nav visibility in vendor-layout.tsx; defensive banner here
//      too since direct URL nav can bypass the sidebar gate)
//   5. vendor_lenders(vendor_id, lender_id).active   (vendor per-lender)
//
// Apply action (v1 per kratos msg 1781498832301-kratos-yz3eu):
//   - lender.apply_url set → window.open(apply_url, '_blank', 'noopener') +
//     upsert vendor_lenders.applied_at = now() to record the intent
//   - lender.apply_url null → upsert applied_at = now() + toast "Recorded.
//     Admin will follow up." No custom in-app form.
//   - lender.apply_instructions rendered as the card subtitle either way.
//
// Card shell reuses the canonical financing-card pattern (rounded-2xl border
// bg-card p-4 + h-11 w-11 rounded-xl bg-primary/10 icon + text-[15px]
// font-semibold font-heading title + 12px muted subtitle). Per-card Switch
// replaces the ChevronRight from the homeowner shell.

import { useEffect, useMemo, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  CreditCard,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { useAuthStore } from '@/stores/auth-store'
import { useVendorSettingsStore } from '@/stores/vendor-settings-store'
import { Link } from 'react-router-dom'

type LenderCategory =
  | 'contractor_pos'
  | 'personal_loans'
  | 'solar_hi_specialty'
  | 'pace'

type Lender = {
  id: string
  name: string
  category: LenderCategory
  notes: string | null
  apply_url: string | null
  apply_instructions: string | null
  sort_order: number
}

type VendorLender = {
  vendor_id: string
  lender_id: string
  active: boolean
  applied_at: string | null
}

type FeatureFlag = { key: string; enabled: boolean }

const MASTER_KEY = 'financing_enabled'
const CATEGORY_KEYS: Record<LenderCategory, string> = {
  contractor_pos: 'financing_category_contractor_pos',
  personal_loans: 'financing_category_personal_loans',
  solar_hi_specialty: 'financing_category_solar_hi_specialty',
  pace: 'financing_category_pace',
}

const CATEGORY_LABELS: Record<LenderCategory, string> = {
  contractor_pos: 'Contractor POS',
  personal_loans: 'Personal Loans',
  solar_hi_specialty: 'Solar & HI Specialty',
  pace: 'PACE Financing',
}

const CATEGORY_TONE: Record<LenderCategory, string> = {
  contractor_pos: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  personal_loans: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  solar_hi_specialty: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  pace: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i, 8) * 0.04, duration: 0.35, ease: 'easeOut' },
  }),
} satisfies Variants

function formatApplied(applied_at: string | null): string | null {
  if (!applied_at) return null
  const then = new Date(applied_at).getTime()
  const now = Date.now()
  const diffMs = Math.max(0, now - then)
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'Applied just now'
  if (diffMin < 60) return `Applied ${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `Applied ${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `Applied ${diffDay}d ago`
  return `Applied on ${new Date(applied_at).toLocaleDateString()}`
}

export default function VendorFinancingPage() {
  const profile = useAuthStore((s) => s.profile)
  const financingEnabled = useVendorSettingsStore((s) => s.financingEnabled)
  const [lenders, setLenders] = useState<Lender[]>([])
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [vendorMap, setVendorMap] = useState<Map<string, VendorLender>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      const [lendersRes, flagsRes, vlRes] = await Promise.all([
        supabase
          .from('lenders')
          .select('id, name, category, notes, apply_url, apply_instructions, sort_order')
          .eq('active', true)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase.from('feature_flags').select('key, enabled'),
        supabase
          .from('vendor_lenders')
          .select('vendor_id, lender_id, active, applied_at')
          .eq('vendor_id', profile!.id),
      ])
      if (cancelled) return
      if (lendersRes.error) toast.error(`Load lenders failed: ${lendersRes.error.message}`)
      if (flagsRes.error) toast.error(`Load flags failed: ${flagsRes.error.message}`)
      if (vlRes.error) toast.error(`Load your settings failed: ${vlRes.error.message}`)
      const flagMap: Record<string, boolean> = {}
      for (const f of (flagsRes.data ?? []) as FeatureFlag[]) flagMap[f.key] = f.enabled
      const vMap = new Map<string, VendorLender>()
      for (const row of (vlRes.data ?? []) as VendorLender[]) vMap.set(row.lender_id, row)
      setLenders((lendersRes.data ?? []) as Lender[])
      setFlags(flagMap)
      setVendorMap(vMap)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [profile?.id])

  const masterOn = flags[MASTER_KEY] === true

  // Filter out category-disabled lenders. A category is disabled when its flag
  // key exists AND enabled=false. Unset key = treated as enabled (default).
  const visibleLenders = useMemo(() => {
    return lenders.filter((l) => {
      const catKey = CATEGORY_KEYS[l.category]
      return flags[catKey] !== false
    })
  }, [lenders, flags])

  async function upsertVendorLender(
    lenderId: string,
    patch: Partial<Pick<VendorLender, 'active' | 'applied_at'>>,
  ): Promise<VendorLender | null> {
    if (!profile?.id) return null
    const existing = vendorMap.get(lenderId)
    const row: VendorLender = {
      vendor_id: profile.id,
      lender_id: lenderId,
      active: patch.active ?? existing?.active ?? true,
      applied_at: patch.applied_at ?? existing?.applied_at ?? null,
    }
    const { data, error } = await supabase
      .from('vendor_lenders')
      .upsert(row, { onConflict: 'vendor_id,lender_id' })
      .select('vendor_id, lender_id, active, applied_at')
      .single()
    if (error || !data) {
      toast.error(`Update failed: ${error?.message ?? 'unknown_error'}`)
      return null
    }
    const updated = data as VendorLender
    setVendorMap((prev) => {
      const next = new Map(prev)
      next.set(lenderId, updated)
      return next
    })
    return updated
  }

  async function handleToggle(lenderId: string, next: boolean) {
    setBusyId(lenderId)
    const ok = await upsertVendorLender(lenderId, { active: next })
    setBusyId(null)
    if (ok) toast.success(next ? 'Partner activated' : 'Partner deactivated')
  }

  async function handleApply(lender: Lender) {
    setBusyId(lender.id)
    const ok = await upsertVendorLender(lender.id, {
      active: true,
      applied_at: new Date().toISOString(),
    })
    setBusyId(null)
    if (!ok) return
    if (lender.apply_url) {
      window.open(lender.apply_url, '_blank', 'noopener,noreferrer')
      toast.success(`Opening ${lender.name} — your application intent is recorded.`)
    } else {
      toast.success(`Recorded. Admin will follow up with ${lender.name} application details.`)
    }
  }

  // Defensive banner: vendor master is a per-device client toggle (vendor-
  // settings-store financingEnabled), and the sidebar nav already gates this
  // tab's visibility. But a deep-link / bookmark can still land here when the
  // master is OFF on this device — show a guiding banner instead of empty.
  const showMasterOffBanner = !financingEnabled

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financing"
        description="Pick which financing partners apply to your projects. Active partners are offered to your homeowners."
      />

      {showMasterOffBanner && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Financing is OFF in your settings
            </p>
            <p className="text-amber-800/90 dark:text-amber-300/80 mt-0.5">
              You can still pick partners here, but they will not be offered to homeowners
              until you turn Financing ON in{' '}
              <Link to="/vendor/settings" className="underline font-medium">
                Settings
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {!masterOn && !loading && (
        <div className="rounded-2xl border border-muted bg-muted/30 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Financing is paused platform-wide</p>
            <p className="text-muted-foreground mt-0.5">
              The admin has paused all financing. Your selections are saved and will
              activate automatically when financing is re-enabled.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visibleLenders.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No financing partners active"
          description="Your admin has not activated any financing partners yet. Check back soon."
        />
      ) : (
        <div
          className="space-y-3"
          data-testid="vendor-financing-list"
          data-vendor-financing-count={visibleLenders.length}
        >
          {visibleLenders.map((lender, i) => {
            const vl = vendorMap.get(lender.id)
            const active = vl?.active === true
            const appliedLabel = formatApplied(vl?.applied_at ?? null)
            const busy = busyId === lender.id
            return (
              <motion.div
                key={lender.id}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
              >
                <Card
                  className={cn(
                    'rounded-2xl border bg-card p-4 transition-shadow',
                    active && 'shadow-sm',
                  )}
                  data-testid="vendor-financing-lender-card"
                  data-target-lender-id={lender.id}
                  data-active={active ? 'true' : 'false'}
                >
                  <CardContent className="p-0 flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <CreditCard className="h-5 w-5" strokeWidth={1.8} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-semibold font-heading text-foreground leading-tight">
                          {lender.name}
                        </p>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                            CATEGORY_TONE[lender.category],
                          )}
                        >
                          {CATEGORY_LABELS[lender.category]}
                        </span>
                        {appliedLabel && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            {appliedLabel}
                          </span>
                        )}
                      </div>
                      {lender.apply_instructions ? (
                        <p className="text-[12px] text-muted-foreground mt-1 whitespace-pre-line">
                          {lender.apply_instructions}
                        </p>
                      ) : (
                        <p className="text-[12px] text-muted-foreground mt-1">
                          Apply directly with the lender to get set up for this partner.
                        </p>
                      )}
                    </div>

                    <div className="flex sm:flex-col items-end sm:items-end gap-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`vendor-lender-toggle-${lender.id}`}
                          className="text-xs text-muted-foreground cursor-pointer"
                        >
                          {active ? 'Active' : 'Inactive'}
                        </Label>
                        <Switch
                          id={`vendor-lender-toggle-${lender.id}`}
                          checked={active}
                          disabled={busy}
                          onCheckedChange={(v) => handleToggle(lender.id, v)}
                          data-testid="vendor-financing-lender-toggle"
                          data-target-lender-id={lender.id}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant={lender.apply_url ? 'default' : 'outline'}
                        disabled={busy}
                        onClick={() => handleApply(lender)}
                        data-testid="vendor-financing-apply"
                        data-target-lender-id={lender.id}
                        className="gap-1.5"
                      >
                        {lender.apply_url ? (
                          <>
                            Apply
                            <ExternalLink className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>Request to apply</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
