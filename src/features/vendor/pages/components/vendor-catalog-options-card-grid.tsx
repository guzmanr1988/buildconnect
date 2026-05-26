import { Check, DollarSign } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { getOptionMetadata } from '@/lib/option-metadata'
import { cn } from '@/lib/utils'

// Arc-36 — interactive card-grid for vendor catalog options. Mirrors the
// outer-grid shape of ProjectItemsCardGrid (grid-cols-1 sm:2 md:3 +
// data-project-summary-grid) but cannot reuse that display-only component
// because each cell hosts a checkbox + price Input + stopPropagation
// cascades that the read-only renderer doesn't carry.
//
// stopPropagation cascades preserved verbatim from ship #65 — prevents
// checkbox/Input interactions inside an expanded service-card from
// bubbling up to the CardHeader collapse handler.
//
// PR-#407 — square card shape per Rod live-feedback (telegram screenshot
// 20260525_215857). "alike but not the same" — references admin/products
// PR-#400 cards-view family without copying 1:1. Layout: label TOP (font-
// medium, sm:text-base) + unit-suffix sub-line; checkbox + $price input
// + optional %markup as one row at the BOTTOM. min-h-[120px] keeps cells
// visually squarer than the prior thin rectangles. Stronger selected fill
// (bg-primary/10 + ring-2 ring-primary/40) + hover lift
// (hover:-translate-y-0.5 + hover:shadow-md) for affordance. All handlers
// + stopPropagation cascades + cents↔dollars encoding boundary preserved.

type CatalogOption = {
  id: string
  label: string
  priceUnit?: 'flat' | 'square' | 'sqft' | 'linear_ft'
}

export interface VendorCatalogOptionsCardGridProps {
  serviceId: string
  groupId: string
  options: CatalogOption[]
  isOptionEnabled: (serviceId: string, groupId: string, optionId: string) => boolean
  getPrice: (serviceId: string, optionId: string) => number
  getPricePercent: (serviceId: string, optionId: string) => number
  onToggle: (serviceId: string, groupId: string, optionId: string) => void
  onPriceChange: (serviceId: string, optionId: string, cents: number) => void
  onPricePercentChange: (serviceId: string, optionId: string, pct: number) => void
}

export function VendorCatalogOptionsCardGrid({
  serviceId,
  groupId,
  options,
  isOptionEnabled,
  getPrice,
  getPricePercent,
  onToggle,
  onPriceChange,
  onPricePercentChange,
}: VendorCatalogOptionsCardGridProps) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
      data-project-summary-grid
    >
      {options.map((option) => {
        const optEnabled = isOptionEnabled(serviceId, groupId, option.id)
        const price = getPrice(serviceId, option.id)
        const meta = getOptionMetadata(option.id, serviceId, option)
        const unitSuffix =
          meta.priceUnit === 'square'
            ? '/ square'
            : meta.priceUnit === 'sqft'
              ? '/ sqft'
              : meta.priceUnit === 'linear_ft'
                ? '/ lin ft'
                : null
        return (
          <div
            key={option.id}
            data-option-id={option.id}
            data-group-id={groupId}
            data-card-shape="square"
            data-card-state={optEnabled ? 'enabled' : 'disabled'}
            className={cn(
              'group relative flex min-h-[120px] flex-col justify-between rounded-xl border bg-background p-4',
              'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md',
              optEnabled
                ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                : 'border-border hover:border-primary/40'
            )}
          >
            <div className="flex flex-col gap-1">
              <span
                className={cn(
                  'text-sm sm:text-base font-medium leading-snug',
                  optEnabled ? 'text-foreground' : 'text-foreground/80'
                )}
              >
                {option.label}
              </span>
              {unitSuffix && (
                <span
                  className="text-[11px] text-muted-foreground leading-tight"
                  data-card-unit-suffix={meta.priceUnit ?? ''}
                >
                  {unitSuffix}
                  {meta.priceUnit === 'square' && (
                    <span className="ml-1 text-[10px] text-muted-foreground/70">
                      (1 sq = 100 sqft)
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label={`Toggle ${option.label}`}
                aria-pressed={optEnabled}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(serviceId, groupId, option.id)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition',
                  optEnabled
                    ? 'bg-primary border-primary text-white'
                    : 'border-muted-foreground/30 hover:border-primary/60'
                )}
              >
                {optEnabled && <Check className="h-3.5 w-3.5" />}
              </button>
              {optEnabled && (
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label={`Price for ${option.label}`}
                    type="text"
                    inputMode="numeric"
                    // Arc-32 PR-D — input is dollars-encoded, DB columns
                    // (vendor_option_prices.price_cents +
                    // vendor_sub_option_prices.price_cents) are cents-encoded.
                    // Convert at input boundary: ÷100 for display, ×100 on
                    // save. Routes through onPriceChange → setPrice for both
                    // VOP and VSOP (CatalogGroupRenderer recurses through
                    // sub-groups using the same component).
                    value={price > 0 ? Math.round(price / 100).toLocaleString('en-US') : ''}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^\d]/g, '')
                      const dollars = digits === '' ? 0 : Number(digits)
                      onPriceChange(serviceId, option.id, dollars * 100)
                    }}
                    placeholder="0"
                    className="h-9 w-24 text-sm text-right"
                  />
                  {meta.supportsPercentMarkup && (
                    <div className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <span>%</span>
                      <Input
                        aria-label={`Percent markup for ${option.label}`}
                        type="number"
                        value={getPricePercent(serviceId, option.id) || ''}
                        onChange={(e) =>
                          onPricePercentChange(serviceId, option.id, Number(e.target.value))
                        }
                        placeholder="0"
                        className="h-8 w-14 text-xs text-right"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
