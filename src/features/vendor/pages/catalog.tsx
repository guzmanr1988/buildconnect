import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Package, Check, DollarSign, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { useAuthStore } from '@/stores/auth-store'
import { useCatalogStore } from '@/stores/catalog-store'
import { useVendorCatalogStore } from '@/stores/vendor-catalog-store'
import { getOptionMetadata } from '@/lib/option-metadata'
import { cn } from '@/lib/utils'

export default function VendorCatalog() {
  const adminServices = useCatalogStore((s) => s.services)
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
        {adminServices.filter(s => !s.phase2).map((service) => {
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
                    {/* Switch must not bubble its click up to the inner title-row collapse handler. */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => toggleService(service.id)}
                        aria-label={`${enabled ? 'Deactivate' : 'Activate'} ${service.name}`}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{service.tagline}</p>
                  {enabled && optionCount > 0 && (
                    <p className="text-[10px] text-primary font-medium mt-1">{optionCount} items selected</p>
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
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <Input
                          aria-label={`Permit price for ${service.name}`}
                          type="number"
                          value={getServicePermit(service.id) || ''}
                          onChange={(e) => setServicePermit(service.id, Number(e.target.value))}
                          placeholder="0"
                          className="h-10 w-24 text-base text-right"
                        />
                      </div>
                    </div>

                    {service.optionGroups.map((group) => (
                      <div key={group.id} className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {group.label}
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {group.options.map((option) => {
                            const optEnabled = isOptionEnabled(service.id, group.id, option.id)
                            const price = getPrice(service.id, option.id)

                            return (
                              <div
                                key={option.id}
                                className={cn(
                                  'flex items-center justify-between gap-3 rounded-lg border p-2.5 transition',
                                  optEnabled ? 'border-primary/30 bg-primary/5' : 'border-border'
                                )}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); toggleOption(service.id, group.id, option.id) }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className={cn(
                                      'flex h-5 w-5 items-center justify-center rounded border shrink-0 transition',
                                      optEnabled
                                        ? 'bg-primary border-primary text-white'
                                        : 'border-muted-foreground/30'
                                    )}
                                  >
                                    {optEnabled && <Check className="h-3 w-3" />}
                                  </button>
                                  <span className={cn(
                                    'text-lg truncate',
                                    optEnabled ? 'font-medium text-foreground' : 'text-muted-foreground'
                                  )}>
                                    {option.label}
                                  </span>
                                </div>
                                {optEnabled && (
                                  <div
                                    className="flex flex-col items-end gap-1 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                                      <Input
                                        aria-label={`Price for ${option.label}`}
                                        type="number"
                                        value={price || ''}
                                        onChange={(e) => setPrice(service.id, option.id, Number(e.target.value))}
                                        placeholder="0"
                                        className="h-10 w-24 text-base text-right"
                                      />
                                      {getOptionMetadata(option.id, service.id).priceUnit === 'square' && (
                                        <div className="flex flex-col">
                                          <span className="text-xs text-muted-foreground whitespace-nowrap">/ square</span>
                                          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">1 sq = 100 sqft</span>
                                        </div>
                                      )}
                                      {getOptionMetadata(option.id, service.id).priceUnit === 'sqft' && (
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">/ sqft</span>
                                      )}
                                      {getOptionMetadata(option.id, service.id).priceUnit === 'linear_ft' && (
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">/ lin ft</span>
                                      )}
                                      {/* Top-level options can also opt into dual-pricing via
                                          OPTION_METADATA.supportsPercentMarkup. Currently only
                                          sub-options carry the flag (low_e + casement), but if a
                                          future top-level option is flagged, the UX is ready. */}
                                      {getOptionMetadata(option.id, service.id).supportsPercentMarkup && (
                                        <>
                                          <span className="text-sm text-muted-foreground ml-1">%</span>
                                          <Input
                                            aria-label={`Percent markup for ${option.label}`}
                                            type="number"
                                            value={getPricePercent(service.id, option.id) || ''}
                                            onChange={(e) => setPricePercent(service.id, option.id, Number(e.target.value))}
                                            placeholder="0"
                                            className="h-10 w-20 text-base text-right"
                                          />
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Sub-groups for options that have them */}
                        {group.options.filter(o => o.subGroups && o.subGroups.length > 0 && isOptionEnabled(service.id, group.id, o.id)).map((option) => (
                          option.subGroups?.map((subGroup) => (
                            <div key={subGroup.id} className="ml-4 mt-2 space-y-1.5">
                              <p className="text-[10px] md:text-sm font-semibold text-muted-foreground/70 uppercase tracking-wider">
                                {subGroup.label}
                              </p>
                              {subGroup.options.map((subOpt) => {
                                const subEnabled = isOptionEnabled(service.id, subGroup.id, subOpt.id)
                                const subPrice = getPrice(service.id, subOpt.id)

                                return (
                                  <div
                                    key={subOpt.id}
                                    className={cn(
                                      'flex items-center justify-between gap-3 rounded-lg border p-2 transition',
                                      subEnabled ? 'border-primary/20 bg-primary/5' : 'border-border/50'
                                    )}
                                  >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); toggleOption(service.id, subGroup.id, subOpt.id) }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className={cn(
                                          'flex h-4 w-4 items-center justify-center rounded border shrink-0 transition',
                                          subEnabled
                                            ? 'bg-primary border-primary text-white'
                                            : 'border-muted-foreground/30'
                                        )}
                                      >
                                        {subEnabled && <Check className="h-2.5 w-2.5" />}
                                      </button>
                                      <span className={cn(
                                        'text-base md:text-xl truncate',
                                        subEnabled ? 'font-medium' : 'text-muted-foreground'
                                      )}>
                                        {subOpt.label}
                                      </span>
                                    </div>
                                    {subEnabled && (
                                      <div
                                        className="flex flex-col items-end gap-1 shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-sm text-muted-foreground">$</span>
                                          <Input
                                            aria-label={`Price for ${subOpt.label}`}
                                            type="number"
                                            value={subPrice || ''}
                                            onChange={(e) => setPrice(service.id, subOpt.id, Number(e.target.value))}
                                            placeholder="0"
                                            className="h-9 w-20 text-sm text-right"
                                          />
                                          {/* Dual $ / % pricing on sub-options flagged
                                              supportsPercentMarkup in OPTION_METADATA.
                                              Currently low_e + casement; add more by flag-flip,
                                              not code branch. Rod directives kratos msgs
                                              1776659189645 + 1776659949844. */}
                                          {getOptionMetadata(subOpt.id, service.id).supportsPercentMarkup && (
                                            <>
                                              <span className="text-sm text-muted-foreground ml-1">%</span>
                                              <Input
                                                aria-label={`Percent markup for ${subOpt.label}`}
                                                type="number"
                                                value={getPricePercent(service.id, subOpt.id) || ''}
                                                onChange={(e) => setPricePercent(service.id, subOpt.id, Number(e.target.value))}
                                                placeholder="0"
                                                className="h-9 w-16 text-sm text-right"
                                              />
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ))
                        ))}
                      </div>
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
