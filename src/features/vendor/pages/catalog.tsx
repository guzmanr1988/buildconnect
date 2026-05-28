import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Package, DollarSign, ChevronDown, Save, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { useAuthStore } from '@/stores/auth-store'
import { useCatalogStore } from '@/stores/catalog-store'
import { useVendorCatalogStore } from '@/stores/vendor-catalog-store'
import { useCatalogRealtime } from '@/lib/hooks/use-catalog-realtime'
import { cn } from '@/lib/utils'
import type { OptionGroup } from '@/types'
import { VendorCatalogOptionsCardGrid } from './components/vendor-catalog-options-card-grid'

// Per-service bulk-select primitive. Flattens nested optionGroups → options
// → subGroups recursively into a flat (groupId, optionId) list, so the
// header-toolbar "Select all" / "Deselect all" button can iterate once and
// flip every option at every depth. Sub-options are toggled regardless of
// parent enabled-state — vendor pre-arms the full tree, parent-collapse
// rendering still gates visibility.
//
// PR-#438 — must mirror CatalogGroupRenderer L533 ancestor-path scoping
// (PR-#410 primitive). The renderer composes nested subGroup ids as
// `${parentOption.id}__${subGroup.id}` so sibling subgroups w/ identical
// bare ids don't collide in vendor-catalog-store enabledOptions[groupId].
// Bare-id collectAllOptions silently no-ops Select All on any service that
// has sub_groups (windows/doors/garage/storm_front etc) because writes land
// at enabledOptions[bare] while renderer reads enabledOptions[scoped].
// Roofing-PASS / windows_doors-FAIL fingerprint = top-level-only vs nested.
function collectAllOptions(
  groups: OptionGroup[]
): Array<{ groupId: string; optionId: string }> {
  const out: Array<{ groupId: string; optionId: string }> = []
  for (const g of groups) {
    for (const o of g.options) {
      out.push({ groupId: g.id, optionId: o.id })
      if (o.subGroups && o.subGroups.length > 0) {
        for (const sg of o.subGroups) {
          out.push(...collectAllOptions([{ ...sg, id: `${o.id}__${sg.id}` }]))
        }
      }
    }
  }
  return out
}

export default function VendorCatalog() {
  const adminServices = useCatalogStore((s) => s.services)
  const refetchAdminCatalog = useCatalogStore((s) => s.hydrateFromServer)
  useCatalogRealtime(refetchAdminCatalog)
  const {
    services: vendorServices,
    initFromAdmin,
    toggleService,
    toggleOption,
    setPrice,
    setPricePercent,
    setServicePermit,
    isServiceEnabled,
    isOptionEnabled,
    getPrice,
    getPricePercent,
    getServicePermit,
  } = useVendorCatalogStore()

  // Expand state is per-service, session-scoped (no persist — if vendor
  // refreshes, everything starts collapsed again). Tracking EXPANDED (flipped
  // from the prior COLLAPSED semantic per Rod directive: active tiles stay
  // collapsed unless the user explicitly taps to open). A service must be
  // BOTH enabled AND in the expanded set to render its panel.
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set())
  const toggleExpanded = (id: string) => {
    setExpandedServices((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Arc-37 per-service Save: store auto-saves on each input (setPrice +
  // setServicePermit fire-and-forget upsert), so the Save button's job is
  // (a) give Rod an explicit commit-acknowledged signal, and (b) re-flush
  // the same upserts as a safety re-snapshot. dirtyServices tracks any
  // mutation since the last Save click for this service so the button
  // gates correctly when there's nothing pending.
  const [dirtyServices, setDirtyServices] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const markDirty = (svcId: string) => {
    setDirtyServices((prev) => {
      if (prev.has(svcId)) return prev
      const next = new Set(prev)
      next.add(svcId)
      return next
    })
  }
  const wrappedToggleOption = (svcId: string, groupId: string, optId: string) => {
    toggleOption(svcId, groupId, optId)
    markDirty(svcId)
  }
  const wrappedSetPrice = (svcId: string, optId: string, price: number) => {
    setPrice(svcId, optId, price)
    markDirty(svcId)
  }
  const wrappedSetPricePercent = (svcId: string, optId: string, pct: number) => {
    setPricePercent(svcId, optId, pct)
    markDirty(svcId)
  }
  const wrappedSetServicePermit = (svcId: string, cents: number) => {
    setServicePermit(svcId, cents)
    markDirty(svcId)
  }
  async function handleSaveService(serviceId: string) {
    setSavingId(serviceId)
    const svc = useVendorCatalogStore.getState().services.find((s) => s.serviceId === serviceId)
    if (svc) {
      for (const [optId, price] of Object.entries(svc.pricing)) {
        if (typeof price === 'number' && price > 0) {
          setPrice(serviceId, optId, price)
        }
      }
      // Rod-rule: 0 is canonical opt-out for service permits ("permit is
      // default in every service unless vendor puts it at 0"), so the Save
      // button must re-affirm the value regardless of magnitude. The old
      // `> 0` guard silently skipped opt-out re-saves.
      if (typeof svc.permitCents === 'number') {
        setServicePermit(serviceId, svc.permitCents)
      }
    }
    await new Promise((r) => setTimeout(r, 350))
    setSavingId(null)
    setDirtyServices((prev) => {
      if (!prev.has(serviceId)) return prev
      const next = new Set(prev)
      next.delete(serviceId)
      return next
    })
    setSavedId(serviceId)
    setTimeout(() => {
      setSavedId((prev) => (prev === serviceId ? null : prev))
    }, 1800)
  }

  // Sync with admin catalog on mount
  useEffect(() => {
    if (adminServices.length > 0) {
      initFromAdmin(adminServices)
    }
  }, [adminServices.length])

  // Bug 1 defensive: ensure vendor catalog store is hydrated from Supabase
  // before the user can interact. AuthBootstrap fires hydrateFromSupabase
  // on SIGNED_IN, but a fresh page-load directly to /vendor/catalog can
  // race the user's first toggleService/setPrice ahead of AuthBootstrap's
  // listener firing (which only re-runs on auth state changes, not on
  // every mount). Idempotent — _migrationDone gate inside ensures the
  // localStorage migration only runs once.
  const profileId = useAuthStore((s) => s.profile?.id)
  const profileRole = useAuthStore((s) => s.profile?.role)
  useEffect(() => {
    if (profileRole === 'vendor' && profileId) {
      useVendorCatalogStore.getState().hydrateFromSupabase(profileId)
    }
  }, [profileId, profileRole])

  // When a service is deactivated, remove it from the expanded set so
  // re-activating later starts cleanly collapsed (per Rod directive: active
  // tiles default collapsed, expansion is explicit-tap-driven only).
  //
  // BUG FIX (Rod P0 2026-04-20 via kratos msg 1776658491957): previous
  // implementation read `s.id` but VendorServiceConfig has `s.serviceId` —
  // currentlyEnabled was always Set([undefined]), so the loop deleted every
  // entry from expandedServices on every vendorServices mutation. Every
  // checkbox click fired this effect → cleared expandedServices → card
  // collapsed. THIS was the actual click-collapses-card bug, not event
  // propagation (ships #65/#66/#67 stopPropagation were treating a red
  // herring). Field name corrected + also switched to enabled-transition
  // tracking via ref so the effect only fires when a service actually flips
  // from enabled=true to enabled=false (not on unrelated mutations like
  // enabledOptions or pricing).
  const prevEnabledRef = useRef<Record<string, boolean>>({})
  useEffect(() => {
    const deactivated: string[] = []
    for (const s of vendorServices) {
      const wasEnabled = prevEnabledRef.current[s.serviceId] ?? false
      if (wasEnabled && !s.enabled) {
        deactivated.push(s.serviceId)
      }
      prevEnabledRef.current[s.serviceId] = s.enabled
    }
    if (deactivated.length > 0) {
      setExpandedServices((prev) => {
        const next = new Set(prev)
        for (const id of deactivated) next.delete(id)
        return next
      })
    }
  }, [vendorServices])

  const enabledCount = vendorServices.filter((s) => s.enabled).length

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } },
  } satisfies Variants
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.15, ease: 'easeOut' } },
  } satisfies Variants

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 overflow-x-hidden">
      <PageHeader title="Products & Pricing" description="Select the services you offer and set your pricing">
        <Badge variant="outline" className="text-xs gap-1">
          <Package className="h-3 w-3" />
          {enabledCount} services active
        </Badge>
      </PageHeader>

      <div className="flex flex-col gap-4">
        {adminServices.map((service) => {
          const enabled = isServiceEnabled(service.id)
          const optionCount = service.optionGroups.reduce((sum, g) => {
            return sum + g.options.filter(o => isOptionEnabled(service.id, g.id, o.id)).length
          }, 0)

          // Default state when enabled = collapsed. Only expanded if user
          // has explicitly tapped the header (tracked in expandedServices).
          const expanded = enabled && expandedServices.has(service.id)
          const collapsed = enabled && !expanded

          return (
            <motion.div key={service.id} variants={item}>
              <Card className={cn('rounded-xl shadow-sm transition', enabled && 'border-primary/30')}>
                {/* Service header — only the top TITLE ROW is clickable for collapse.
                    Tagline + optionCount + Switch stay non-collapsing to prevent any
                    accidental collapse from clicks outside the explicit header-bar area.
                    Rod P0: ship #65 CardContent stopPropagation was a no-op (CardHeader
                    is sibling not ancestor of CardContent); real issue was CardHeader's
                    broad clickable area capturing clicks users intended for the header
                    body (tagline / counter). Scoping collapse trigger strictly to the
                    chevron+title row per kratos msg 1776658178638. */}
                <CardHeader className="pb-2">
                  <div
                    className={cn(
                      'flex items-center justify-between',
                      enabled && 'cursor-pointer select-none'
                    )}
                    onClick={() => { if (enabled) toggleExpanded(service.id) }}
                    role={enabled ? 'button' : undefined}
                    tabIndex={enabled ? 0 : undefined}
                    aria-expanded={enabled ? expanded : undefined}
                    aria-controls={enabled ? `vendor-service-panel-${service.id}` : undefined}
                    onKeyDown={(e) => {
                      if (!enabled) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleExpanded(service.id)
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {enabled && (
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
                            collapsed && '-rotate-90'
                          )}
                          aria-hidden="true"
                        />
                      )}
                      <CardTitle className="text-base font-heading">{service.name}</CardTitle>
                      {enabled && (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                          Active
                        </Badge>
                      )}
                    </div>
                    {/* Save button + Switch — both halt propagation so header-row
                        clicks don't trigger the collapse handler. Save sits LEFT
                        of the toggle per Rod directive (Arc-37 photo file_355). */}
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {enabled && (() => {
                        const isSaving = savingId === service.id
                        const isSaved = savedId === service.id
                        const isDirty = dirtyServices.has(service.id)
                        const disabled = isSaving || (!isDirty && !isSaved)
                        return (
                          <Button
                            type="button"
                            size="sm"
                            variant={isSaved ? 'default' : 'outline'}
                            disabled={disabled}
                            onClick={() => handleSaveService(service.id)}
                            aria-label={`Save ${service.name} changes`}
                            className={cn(
                              'h-8 gap-1.5 text-xs',
                              isSaved && 'bg-emerald-600 hover:bg-emerald-600 text-white'
                            )}
                          >
                            {isSaving ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Saving
                              </>
                            ) : isSaved ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Saved
                              </>
                            ) : (
                              <>
                                <Save className="h-3.5 w-3.5" />
                                Save
                              </>
                            )}
                          </Button>
                        )
                      })()}
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => toggleService(service.id)}
                        aria-label={`${enabled ? 'Deactivate' : 'Activate'} ${service.name}`}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{service.tagline}</p>
                  {enabled && (
                    <div className="flex items-center justify-between mt-1 gap-2">
                      {optionCount > 0 ? (
                        <p className="text-[10px] text-primary font-medium">{optionCount} items selected</p>
                      ) : (
                        <span />
                      )}
                      {(() => {
                        const allOpts = collectAllOptions(service.optionGroups)
                        if (allOpts.length === 0) return null
                        const allSelected = allOpts.every(({ groupId, optionId }) =>
                          isOptionEnabled(service.id, groupId, optionId)
                        )
                        return (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              for (const { groupId, optionId } of allOpts) {
                                const isOn = isOptionEnabled(service.id, groupId, optionId)
                                if (allSelected ? isOn : !isOn) {
                                  wrappedToggleOption(service.id, groupId, optionId)
                                }
                              }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-label={`${allSelected ? 'Deselect all' : 'Select all'} options for ${service.name}`}
                            className="h-7 px-2 text-[10px]"
                          >
                            {allSelected ? 'Deselect all' : 'Select all'}
                          </Button>
                        )
                      })()}
                    </div>
                  )}
                </CardHeader>

                {/* Option groups — only rendered when service is enabled AND panel is expanded.
                    stopPropagation on CardContent onClick: defensive guard against any body
                    click bubbling up to CardHeader's toggleExpanded collapse handler. Rod P0:
                    clicking checkbox/Input inside expanded card was firing accordion collapse,
                    preventing any option or price edits.

                    AnimatePresence wrap for smooth expand/collapse animation (ship #99 per
                    kratos msg 1776698050290 — extending #98 pattern to every accordion). */}
                <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key="catalog-service-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                  <CardContent
                    id={`vendor-service-panel-${service.id}`}
                    className="space-y-4 pt-0"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {/* Service-level permit price — ONE flat fee per service per
                        vendor (not per option). Snapshotted onto the homeowner
                        breakdown's Permit Price line at sendProject. PR #118
                        fix-forward on PR #117's per-option permit shape. */}
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/40 bg-amber-50/40 dark:bg-amber-900/10 p-2.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">Permit Price</span>
                        <span className="text-xs text-muted-foreground">flat fee for this service</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                        <Input
                          aria-label={`Permit price for ${service.name}`}
                          type="text"
                          inputMode="numeric"
                          // Arc-32 PR-D — input is dollars-encoded, DB column
                          // permit_price_cents is cents-encoded. Convert at
                          // the input boundary: divide by 100 for display,
                          // multiply by 100 on save. Mirrors membership.tsx
                          // /100 display pattern.
                          value={(() => {
                            const cents = getServicePermit(service.id)
                            if (cents <= 0) return ''
                            return Math.round(cents / 100).toLocaleString('en-US')
                          })()}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^\d]/g, '')
                            const dollars = digits === '' ? 0 : Number(digits)
                            wrappedSetServicePermit(service.id, dollars * 100)
                          }}
                          placeholder="0"
                          className="h-10 w-24 text-base text-right md:h-12 md:w-32 md:text-lg md:px-4"
                        />
                      </div>
                    </div>

                    {service.optionGroups.map((group) => (
                      <CatalogGroupRenderer
                        key={group.id}
                        serviceId={service.id}
                        optionGroup={group}
                        depth={0}
                        isOptionEnabled={isOptionEnabled}
                        getPrice={getPrice}
                        getPricePercent={getPricePercent}
                        onToggle={wrappedToggleOption}
                        onPriceChange={wrappedSetPrice}
                        onPricePercentChange={wrappedSetPricePercent}
                      />
                    ))}
                  </CardContent>
                  </motion.div>
                )}
                </AnimatePresence>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

// Recursive sub-group renderer. Arc-38 fix: prior render only descended one
// sub-group level, so Cabinet (Material > Plywood/MDF > prices) silently
// dropped at depth=3+. This descends arbitrary nesting; depth controls
// indent + label size so deeper sections read as nested visually.
type CatalogGroupRendererProps = {
  serviceId: string
  optionGroup: OptionGroup
  depth: number
  isOptionEnabled: (serviceId: string, groupId: string, optionId: string) => boolean
  getPrice: (serviceId: string, optionId: string) => number
  getPricePercent: (serviceId: string, optionId: string) => number
  onToggle: (serviceId: string, groupId: string, optionId: string) => void
  onPriceChange: (serviceId: string, optionId: string, cents: number) => void
  onPricePercentChange: (serviceId: string, optionId: string, pct: number) => void
}

function CatalogGroupRenderer({
  serviceId,
  optionGroup,
  depth,
  isOptionEnabled,
  getPrice,
  getPricePercent,
  onToggle,
  onPriceChange,
  onPricePercentChange,
}: CatalogGroupRendererProps) {
  const indentClass = depth === 0 ? '' : depth === 1 ? 'ml-4' : depth === 2 ? 'ml-8' : 'ml-12'
  const spacingClass = depth === 0 ? 'space-y-2' : 'mt-2 space-y-1.5'
  // PR-#440 — outer box for each leaf-bearing section (any group whose
  // immediate options include at least one leaf chip). Pure-container groups
  // (Products in windows/doors — children are all sub_group-bearing Window
  // and Door options) skip the box so the actual leaf-bearing nested sections
  // (Window Sizes / Window Types / Frame Colors / Glass Colors / Glass Types /
  // Door Sizes) get individual boxes without a heavy outer wrapper.
  // PR-#439 shipped depth=0-only — apollo MIXED: Roofing/Pool PASS (top-level
  // already leaf-bearing) / Windows+Doors FAIL (Products top-level wrapped
  // every nested section in one box). Leaf-bearing detection generalises
  // cleanly without depth-coupling.
  // Thin-row chip layout inside VendorCatalogOptionsCardGrid unchanged —
  // banked Rod density primitive (PR-#412 thin-row, PR-#411 revert PR-#407).
  const hasLeafOptions = optionGroup.options.some(
    (o) => !(o.subGroups && o.subGroups.length > 0)
  )
  const containerClass = hasLeafOptions
    ? 'rounded-lg border border-border bg-muted/20 p-3'
    : ''
  const labelClass =
    depth === 0
      ? 'text-xs font-semibold text-muted-foreground uppercase tracking-wider'
      : depth === 1
        ? 'text-[10px] md:text-sm font-semibold text-muted-foreground/70 uppercase tracking-wider'
        : 'text-[10px] md:text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider'

  // PR-#409 — hide parent option cards that have subGroups; the subGroup
  // section header + child variant cards carry the parent context. Rod
  // live-feedback on PR-#407 squares: Soffit + Fascia parent rows render
  // as $0 dead-weight cards because pricing lives in WOOD / FACIA
  // subGroups below. Cleanest fix (no catalog-store rewire): parent w/
  // subGroups is treated as always-enabled at the recursion gate below,
  // and its card is filtered out of this level's grid. Children's own
  // enabled-state still gates child card visibility individually.
  const visibleOptions = optionGroup.options.filter(
    (o) => !(o.subGroups && o.subGroups.length > 0)
  )

  return (
    <div className={cn(indentClass, spacingClass, containerClass)}>
      <p className={labelClass}>{optionGroup.label}</p>
      <VendorCatalogOptionsCardGrid
        serviceId={serviceId}
        groupId={optionGroup.id}
        options={visibleOptions}
        isOptionEnabled={isOptionEnabled}
        getPrice={getPrice}
        getPricePercent={getPricePercent}
        onToggle={onToggle}
        onPriceChange={onPriceChange}
        onPricePercentChange={onPricePercentChange}
      />
      {optionGroup.options
        .filter((o) => o.subGroups && o.subGroups.length > 0)
        .map((option) =>
          option.subGroups?.map((subGroup) => {
            // PR-#410 — FE-defensive compound groupId for ancestor-path
            // uniqueness. Substrate may carry collision-prone literal
            // sub_option_ids across sibling subgroups (Soffit's Wood
            // subgroup AND Facia's Wood subgroup both naming their leaf
            // 'metal'). Bare subGroup.id as groupId would collide in
            // vendor-catalog-store enabledOptions[groupId] → toggling
            // Soffit-Metal also lights Facia-Metal. Compose the parent
            // option.id into a scoped groupId so every subgroup carries a
            // unique namespace inherited from its ancestor chain (recursive
            // adds compose further: `${ancestor.id}__${parent.id}__leaf`).
            // Belt-and-suspenders complement to PR-#411 hermes substrate
            // rename — survives even if a future substrate add reintroduces
            // a bare sibling-id collision. Store contract unchanged.
            const scopedId = `${option.id}__${subGroup.id}`
            return (
              <CatalogGroupRenderer
                key={scopedId}
                serviceId={serviceId}
                optionGroup={{ ...subGroup, id: scopedId }}
                depth={depth + 1}
                isOptionEnabled={isOptionEnabled}
                getPrice={getPrice}
                getPricePercent={getPricePercent}
                onToggle={onToggle}
                onPriceChange={onPriceChange}
                onPricePercentChange={onPricePercentChange}
              />
            )
          })
        )}
    </div>
  )
}
