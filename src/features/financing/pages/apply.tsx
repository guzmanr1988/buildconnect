import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronDown, ChevronUp, ExternalLink, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { useFeatureFlagOnce } from '@/lib/financing/hooks/use-feature-flag'
import { listRegisteredAdapters } from '@/lib/financing/adapters'
import { FinancingAdapterDialog } from '@/features/financing/components/financing-adapter-dialog'

type LenderCategory = 'contractor_pos' | 'personal_loans' | 'solar_hi_specialty' | 'pace'

type Lender = {
  id: string
  name: string
  category: LenderCategory
  contact_email: string | null
  notes: string | null
  apply_url: string | null
  apply_instructions: string | null
  sort_order: number
  active: boolean
  deleted_at: string | null
}

const CATEGORY_LABELS: Record<LenderCategory, string> = {
  contractor_pos: 'Contractor POS',
  personal_loans: 'Personal Loans',
  solar_hi_specialty: 'Solar & HI Specialty',
  pace: 'PACE Financing',
}

const CATEGORY_FLAGS: Record<LenderCategory, string> = {
  contractor_pos: 'financing_category_contractor_pos',
  personal_loans: 'financing_category_personal_loans',
  solar_hi_specialty: 'financing_category_solar_hi_specialty',
  pace: 'financing_category_pace',
}

const CATEGORY_ORDER: LenderCategory[] = [
  'contractor_pos',
  'personal_loans',
  'solar_hi_specialty',
  'pace',
]

function lenderSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

type LenderState = 'url-instr' | 'url-only' | 'instr-only' | 'coming-soon'

function lenderState(l: Lender): LenderState {
  const hasUrl = !!(l.apply_url && l.apply_url.trim())
  const hasInstr = !!(l.apply_instructions && l.apply_instructions.trim())
  if (hasUrl && hasInstr) return 'url-instr'
  if (hasUrl) return 'url-only'
  if (hasInstr) return 'instr-only'
  return 'coming-soon'
}

export function FinancingApplyPage() {
  const profile = useAuthStore((s) => s.profile)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project_id') || undefined
  const financingEnabled = useFeatureFlagOnce('financing_enabled')

  const [lenders, setLenders] = useState<Lender[]>([])
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dialogLenderKey, setDialogLenderKey] = useState<string | null>(null)

  const adapterKeys = useMemo(
    () => new Set(listRegisteredAdapters().filter((k) => k !== 'manual_referral')),
    [],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: lenderRows, error: lenderErr }, { data: flagRows, error: flagErr }] = await Promise.all([
        supabase
          .from('lenders')
          .select('*')
          .is('deleted_at', null)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase.from('feature_flags').select('key, enabled'),
      ])
      if (cancelled) return
      if (lenderErr) {
        setLenders([])
      } else {
        setLenders(((lenderRows ?? []) as Lender[]).filter((l) => l.active))
      }
      if (flagErr) {
        setFlags({})
      } else {
        const map: Record<string, boolean> = {}
        for (const r of (flagRows ?? []) as Array<{ key: string; enabled: boolean }>) {
          map[r.key] = r.enabled
        }
        setFlags(map)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (financingEnabled === undefined) {
    return null
  }
  if (financingEnabled === false) {
    return <Navigate to="/home" replace />
  }
  if (!profile) {
    return <Navigate to="/login" replace />
  }

  const sections = CATEGORY_ORDER.map((category) => {
    const flagOn = flags[CATEGORY_FLAGS[category]] === true
    const rows = lenders.filter((l) => l.category === category)
    return { category, flagOn, rows }
  }).filter((s) => s.flagOn && s.rows.length > 0)

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto" data-testid="financing-lender-catalog">
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
        <h1 className="text-2xl font-bold font-heading text-foreground">Apply for financing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse our financing partners by category. Tap a tile to apply.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground" data-testid="financing-catalog-loading">
          Loading partners…
        </p>
      )}

      {!loading && sections.length === 0 && (
        <div className="flex flex-col gap-3" data-testid="financing-catalog-empty">
          <p className="text-sm text-muted-foreground">Financing partners coming soon. Check back shortly.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/home')} className="self-start">
            Back to home
          </Button>
        </div>
      )}

      {!loading &&
        sections.map(({ category, rows }) => {
          const expandedInSection = rows.find(
            (l) =>
              l.id === expandedId &&
              !!(l.apply_instructions && l.apply_instructions.trim()),
          )
          return (
            <section
              key={category}
              className="flex flex-col gap-3"
              data-testid={`financing-category-section-${category}`}
              data-financing-category={category}
            >
              <h2 className="text-lg font-semibold text-foreground">{CATEGORY_LABELS[category]}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {rows.map((l) => {
                  const state = lenderState(l)
                  const slug = lenderSlug(l.name)
                  const hasAdapter = adapterKeys.has(slug)
                  const isComingSoon = state === 'coming-soon'
                  const isExpanded = expandedId === l.id
                  const hasInstructions = !!(l.apply_instructions && l.apply_instructions.trim())
                  const showInfoIcon = hasInstructions && state !== 'instr-only'

                  const handleTap = () => {
                    if (isComingSoon) return
                    if (hasAdapter) {
                      setDialogLenderKey(slug)
                      return
                    }
                    if (l.apply_url) {
                      window.open(l.apply_url, '_blank', 'noopener,noreferrer')
                      return
                    }
                    setExpandedId(isExpanded ? null : l.id)
                  }

                  return (
                    <div key={l.id} className="relative">
                      <button
                        type="button"
                        onClick={handleTap}
                        disabled={isComingSoon}
                        data-testid={`financing-lender-card-${l.id}`}
                        data-lender={l.name}
                        data-financing-lender-state={state}
                        data-financing-lender-id={l.id}
                        aria-expanded={state === 'instr-only' ? isExpanded : undefined}
                        className={`group aspect-square w-full rounded-lg border border-border bg-card p-3 flex flex-col text-left transition-colors ${
                          isComingSoon
                            ? 'opacity-60 cursor-not-allowed'
                            : 'hover:border-primary hover:bg-accent/30 active:bg-accent/50'
                        }`}
                      >
                        <div className="flex-1 flex flex-col gap-1 min-h-0">
                          <p className="text-sm font-semibold text-foreground line-clamp-2 pr-6">
                            {l.name}
                          </p>
                          {l.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-3">{l.notes}</p>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {isComingSoon ? (
                            <span
                              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                              data-testid={`financing-lender-coming-soon-${l.id}`}
                            >
                              Coming soon
                            </span>
                          ) : hasAdapter ? (
                            <span className="text-[11px] font-semibold text-primary">Apply</span>
                          ) : l.apply_url ? (
                            <span className="inline-flex items-center text-[11px] font-semibold text-primary">
                              Apply
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-semibold text-primary">
                              How to apply
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3 ml-1" />
                              ) : (
                                <ChevronDown className="h-3 w-3 ml-1" />
                              )}
                            </span>
                          )}
                        </div>
                      </button>
                      {showInfoIcon && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : l.id)}
                          aria-label={`How to apply at ${l.name}`}
                          aria-expanded={isExpanded}
                          data-testid={`financing-lender-info-${l.id}`}
                          className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {expandedInSection && expandedInSection.apply_instructions && (
                <div
                  className="rounded-md border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground"
                  data-testid={`financing-lender-instructions-${expandedInSection.id}`}
                >
                  <p className="text-xs font-semibold mb-1 text-foreground">
                    {expandedInSection.name} — how to apply
                  </p>
                  {expandedInSection.apply_instructions}
                </div>
              )}
            </section>
          )
        })}

      <p className="text-xs text-muted-foreground">
        Submitting to a partner shares your project information for review. BuildConnect does not
        perform a credit check; each lender determines what credit-check method applies.
      </p>

      {dialogLenderKey && (
        <FinancingAdapterDialog
          open={dialogLenderKey !== null}
          onOpenChange={(open) => !open && setDialogLenderKey(null)}
          lenderKey={dialogLenderKey}
          projectId={projectId}
        />
      )}
    </div>
  )
}

export default FinancingApplyPage
