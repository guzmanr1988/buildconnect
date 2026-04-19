import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Package, Check, DollarSign, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { useCatalogStore } from '@/stores/catalog-store'
import { useVendorCatalogStore } from '@/stores/vendor-catalog-store'
import { cn } from '@/lib/utils'

export default function VendorCatalog() {
  const adminServices = useCatalogStore((s) => s.services)
  const {
    services: vendorServices,
    initFromAdmin,
    toggleService,
    toggleOption,
    setPrice,
    isServiceEnabled,
    isOptionEnabled,
    getPrice,
  } = useVendorCatalogStore()

  // Collapse state is per-service, session-scoped (no persist — if vendor
  // refreshes, everything starts expanded again, which matches the "just
  // activated" default). Tracking COLLAPSED (not expanded) so a newly
  // activated service naturally renders expanded without a state write.
  const [collapsedServices, setCollapsedServices] = useState<Set<string>>(new Set())
  // Track services that were just toggled on so we always render them
  // expanded on activation even if they had been collapsed previously.
  const prevEnabledRef = useRef<Set<string>>(new Set())
  const toggleCollapsed = (id: string) => {
    setCollapsedServices((prev) => {
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

  // When a service is newly activated, ensure it renders expanded even if it
  // had been collapsed during a prior active session.
  useEffect(() => {
    const currentlyEnabled = new Set(vendorServices.filter((s) => s.enabled).map((s) => s.id))
    const newlyEnabled = Array.from(currentlyEnabled).filter((id) => !prevEnabledRef.current.has(id))
    if (newlyEnabled.length > 0) {
      setCollapsedServices((prev) => {
        const next = new Set(prev)
        for (const id of newlyEnabled) next.delete(id)
        return next
      })
    }
    prevEnabledRef.current = currentlyEnabled
  }, [vendorServices])

  const enabledCount = vendorServices.filter((s) => s.enabled).length

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } },
  }
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.15, ease: 'easeOut' } },
  }

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

          const collapsed = enabled && collapsedServices.has(service.id)
          const expanded = enabled && !collapsed

          return (
            <motion.div key={service.id} variants={item}>
              <Card className={cn('rounded-xl shadow-sm transition', enabled && 'border-primary/30')}>
                {/* Service header — clickable to toggle collapse when service is enabled. */}
                <CardHeader
                  className={cn('pb-2', enabled && 'cursor-pointer select-none')}
                  onClick={() => { if (enabled) toggleCollapsed(service.id) }}
                  role={enabled ? 'button' : undefined}
                  tabIndex={enabled ? 0 : undefined}
                  aria-expanded={enabled ? expanded : undefined}
                  aria-controls={enabled ? `vendor-service-panel-${service.id}` : undefined}
                  onKeyDown={(e) => {
                    if (!enabled) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleCollapsed(service.id)
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
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
                    {/* Switch must not bubble its click up to the header's toggle-collapse handler. */}
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

                {/* Option groups — only rendered when service is enabled AND panel is expanded. */}
                {expanded && (
                  <CardContent id={`vendor-service-panel-${service.id}`} className="space-y-4 pt-0">
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
                                    onClick={() => toggleOption(service.id, group.id, option.id)}
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
                                    'text-sm truncate',
                                    optEnabled ? 'font-medium text-foreground' : 'text-muted-foreground'
                                  )}>
                                    {option.label}
                                  </span>
                                </div>
                                {optEnabled && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                                    <Input
                                      type="number"
                                      value={price || ''}
                                      onChange={(e) => setPrice(service.id, option.id, Number(e.target.value))}
                                      placeholder="0"
                                      className="h-7 w-20 text-xs text-right"
                                    />
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
                              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
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
                                        onClick={() => toggleOption(service.id, subGroup.id, subOpt.id)}
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
                                        'text-xs truncate',
                                        subEnabled ? 'font-medium' : 'text-muted-foreground'
                                      )}>
                                        {subOpt.label}
                                      </span>
                                    </div>
                                    {subEnabled && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-[10px] text-muted-foreground">$</span>
                                        <Input
                                          type="number"
                                          value={subPrice || ''}
                                          onChange={(e) => setPrice(service.id, subOpt.id, Number(e.target.value))}
                                          placeholder="0"
                                          className="h-6 w-16 text-[11px] text-right"
                                        />
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
                )}
              </Card>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
