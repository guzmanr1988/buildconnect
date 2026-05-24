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
            className={cn(
              'rounded-lg border bg-background p-3 space-y-2 transition',
              optEnabled ? 'border-primary/30 bg-primary/5' : 'border-border'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(serviceId, groupId, option.id)
                  }}
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
                <span
                  className={cn(
                    'text-sm md:text-base truncate',
                    optEnabled ? 'font-medium text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {option.label}
                </span>
              </div>
              {optEnabled && (
                <div
                  className="flex items-center gap-1 shrink-0"
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
                </div>
              )}
            </div>
            {optEnabled && (unitSuffix || meta.supportsPercentMarkup) && (
              <div
                className="flex items-center justify-end gap-2 text-xs text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {unitSuffix && (
                  <div className="flex flex-col items-end leading-tight">
                    <span className="whitespace-nowrap">{unitSuffix}</span>
                    {meta.priceUnit === 'square' && (
                      <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                        1 sq = 100 sqft
                      </span>
                    )}
                  </div>
                )}
                {meta.supportsPercentMarkup && (
                  <div className="flex items-center gap-1">
                    <span>%</span>
                    <Input
                      aria-label={`Percent markup for ${option.label}`}
                      type="number"
                      value={getPricePercent(serviceId, option.id) || ''}
                      onChange={(e) =>
                        onPricePercentChange(serviceId, option.id, Number(e.target.value))
                      }
                      placeholder="0"
                      className="h-8 w-16 text-xs text-right"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
