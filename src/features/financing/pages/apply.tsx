import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { ChevronLeft, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { isFinancingEnabled } from '@/lib/financing/feature-flag'
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

  if (!isFinancingEnabled()) {
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
          Browse our financing partners by category. Tap a partner to apply on their site or expand
          for application instructions.
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
        sections.map(({ category, rows }) => (
          <section
            key={category}
            className="flex flex-col gap-3"
            data-testid={`financing-category-section-${category}`}
            data-financing-category={category}
          >
            <h2 className="text-lg font-semibold text-foreground">{CATEGORY_LABELS[category]}</h2>
            <div className="flex flex-col gap-3">
              {rows.map((l) => {
                const state = lenderState(l)
                const slug = lenderSlug(l.name)
                const hasAdapter = adapterKeys.has(slug)
                const isExpanded = expandedId === l.id
                return (
                  <Card
                    key={l.id}
                    data-testid={`financing-lender-card-${l.id}`}
                    data-financing-lender-state={state}
                  >
                    <CardHeader>
                      <CardTitle className="text-base">{l.name}</CardTitle>
                      {l.notes && <CardDescription className="text-xs">{l.notes}</CardDescription>}
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {state === 'coming-soon' && (
                        <span
                          className="inline-flex items-center self-start rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                          data-testid={`financing-lender-coming-soon-${l.id}`}
                        >
                          Coming soon
                        </span>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {(state === 'url-instr' || state === 'url-only') && l.apply_url && (
                          <Button
                            type="button"
                            onClick={() => window.open(l.apply_url!, '_blank', 'noopener,noreferrer')}
                            data-testid={`financing-lender-apply-cta-${l.id}`}
                          >
                            Apply at {l.name}
                            <ExternalLink className="h-4 w-4 ml-1.5" />
                          </Button>
                        )}

                        {(state === 'url-instr' || state === 'instr-only') && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setExpandedId(isExpanded ? null : l.id)}
                            data-testid={`financing-lender-instructions-toggle-${l.id}`}
                            aria-expanded={isExpanded}
                          >
                            How to apply
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 ml-1.5" />
                            ) : (
                              <ChevronDown className="h-4 w-4 ml-1.5" />
                            )}
                          </Button>
                        )}

                        {hasAdapter && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setDialogLenderKey(slug)}
                            data-testid={`financing-lender-form-cta-${l.id}`}
                          >
                            Apply with our pre-fill form
                          </Button>
                        )}
                      </div>

                      {isExpanded && l.apply_instructions && (
                        <div
                          className="rounded-md border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground"
                          data-testid={`financing-lender-instructions-${l.id}`}
                        >
                          {l.apply_instructions}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        ))}

      <p className="text-xs text-muted-foreground">
        Submitting to a partner shares your project information for review. BuildConnect does not
        perform a credit check; each lender determines what credit-check method applies.
      </p>

      {dialogLenderKey && (
        <FinancingAdapterDialog
          open={dialogLenderKey !== null}
          onOpenChange={(open) => !open && setDialogLenderKey(null)}
          lenderKey={dialogLenderKey}
        />
      )}
    </div>
  )
}

export default FinancingApplyPage
