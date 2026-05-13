import { Layers, Ruler, Pencil, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { computeRoofTotal } from '@/lib/roof-area-math'

type FlowPath = 'full_replacement' | 'addons_only' | null

type EditingControls = {
  active: boolean
  rawValue: string
  onChange: (value: string) => void
  onStart: () => void
  onDone: () => void
}

export type RoofMeasurementBreakdownCardProps = {
  pitchedAreaSqft: number
  flatAreaSqft: number
  pitch: string
  perimeterFt: number
  includeMaterialOrder: boolean
  includePerimeter: boolean
  includeFlatArea?: boolean
  pitchedOmittedTriggered?: boolean
  flowPath?: FlowPath
  source: 'wizard-step2' | 'wizard-step3' | 'service-detail'
  onToggleMaterialOrder?: (on: boolean) => void
  onTogglePerimeter?: (on: boolean) => void
  onToggleFlatArea?: (on: boolean) => void
  editing?: { pitched: EditingControls; flat: EditingControls }
}

// Two independent area gates: Main Roof toggle (includeMaterialOrder) gates
// pitched material in the order; Flat Area toggle (includeFlatArea) gates
// flat membrane independently. Chip-tap drives material selection (vendor
// SKU mapping), not whether the area belongs in the order. Each toggle gates
// its own area class — flipping Main Roof OFF does not also exclude flat.
export function RoofMeasurementBreakdownCard({
  pitchedAreaSqft,
  flatAreaSqft,
  pitch,
  perimeterFt,
  includeMaterialOrder,
  includePerimeter,
  includeFlatArea = true,
  pitchedOmittedTriggered = false,
  flowPath = null,
  source,
  onToggleMaterialOrder,
  onTogglePerimeter,
  onToggleFlatArea,
  editing,
}: RoofMeasurementBreakdownCardProps) {
  const isAddonsOnly = flowPath === 'addons_only'
  const hasFlatArea = flatAreaSqft > 0
  const showAreaBreakdown = !isAddonsOnly && (pitchedAreaSqft > 0 || hasFlatArea)

  return (
    <div
      className="rounded-xl border bg-muted/30 p-4 space-y-3"
      data-roof-breakdown-card="true"
      data-roof-breakdown-source={source}
    >
      {!isAddonsOnly && (
        <div className={cn(!includeMaterialOrder && 'opacity-60')}>
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Main Roof
              </span>
            </div>
            {onToggleMaterialOrder && (
              <>
                <Label htmlFor="include-material-order-toggle" className="sr-only">Include material order</Label>
                <Switch
                  id="include-material-order-toggle"
                  data-toggle="material-order"
                  checked={includeMaterialOrder}
                  onCheckedChange={onToggleMaterialOrder}
                />
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              {includeMaterialOrder ? (() => {
                const { pitchedWaste, pitchedSquares } = computeRoofTotal({
                  pitchedAreaSqft: Math.round(pitchedAreaSqft),
                  flatAreaSqft: Math.round(flatAreaSqft),
                  includeMaterialOrder: true,
                  includeFlatArea,
                })
                if (pitchedWaste === 0) {
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      Roof measurement pending — re-measure or adjust to start an order.
                    </p>
                  )
                }
                return (
                  <p className="text-base font-semibold text-foreground" data-row="material-order-pitched">
                    Pitched: {Math.round(pitchedAreaSqft).toLocaleString()}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      sqft ({pitchedSquares} sq w/2% waste)
                    </span>
                  </p>
                )
              })() : (
                <>
                  <p className="text-xl font-bold text-foreground">Excluded</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Flip the toggle to include shingles or membrane in the order.
                  </p>
                </>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Ruler className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Roof Pitch
                </span>
              </div>
              <p className="text-xl font-bold text-foreground">{pitch}</p>
            </div>
          </div>
        </div>
      )}

      <div className={cn(isAddonsOnly ? '' : 'border-t pt-3', !includePerimeter && 'opacity-60')}>
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5">
            <Ruler className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Roof Perimeter
            </span>
          </div>
          {onTogglePerimeter && (
            <>
              <Label htmlFor="include-perimeter-toggle" className="sr-only">Include perimeter add-ons</Label>
              <Switch
                id="include-perimeter-toggle"
                data-toggle="roof-perimeter"
                checked={includePerimeter}
                onCheckedChange={onTogglePerimeter}
              />
            </>
          )}
        </div>
        {includePerimeter ? (
          <>
            <p className="text-xl font-bold text-foreground">
              ~{perimeterFt.toLocaleString()}{' '}
              <span className="text-sm font-normal text-muted-foreground">lin ft</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Used for gutter, fascia, and soffit estimates
            </p>
          </>
        ) : (
          <>
            <p className="text-xl font-bold text-foreground">Excluded</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Flip the toggle to include gutters, fascia, or soffit in the order.
            </p>
          </>
        )}
      </div>

      {showAreaBreakdown && (
        <div className="border-t pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Area Breakdown
            </span>
          </div>

          {hasFlatArea && (
          <div
            data-flat-state={includeFlatArea ? 'included' : 'excluded'}
            className={cn('relative', !includeFlatArea && 'opacity-60')}
          >
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Flat Area</span>
              {onToggleFlatArea && (
                <>
                  <Label htmlFor="include-flat-area-toggle" className="sr-only">Include flat area</Label>
                  <Switch
                    id="include-flat-area-toggle"
                    data-toggle="flat-area"
                    checked={includeFlatArea}
                    onCheckedChange={onToggleFlatArea}
                  />
                </>
              )}
            </div>
            {includeFlatArea ? (
              <>
                {editing?.flat.active ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <Input
                      type="number"
                      min="0"
                      value={editing.flat.rawValue}
                      onChange={(e) => editing.flat.onChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') editing.flat.onDone()
                      }}
                      onBlur={() => editing.flat.onDone()}
                      autoFocus
                      className="h-9 text-base w-28"
                      placeholder="raw sqft"
                    />
                    <span className="text-xs text-muted-foreground">sqft (raw)</span>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editing.flat.onDone()}
                      className="text-primary hover:text-primary/80 transition-colors"
                      aria-label="Save flat sqft"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      <span data-row="flat">{Math.round(flatAreaSqft).toLocaleString()}</span>{' '}
                      <span className="text-xs font-normal text-muted-foreground">sqft</span>
                    </p>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => editing.flat.onStart()}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Edit flat sqft"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground mt-0.5">
                  <span data-row="flat">{Math.round(flatAreaSqft).toLocaleString()}</span> sqft — Excluded
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Flip the toggle to include flat-roof membrane in the order.
                </p>
              </>
            )}
          </div>
          )}

          <div
            data-row="pitched"
            {...(pitchedOmittedTriggered ? { 'data-pitched-not-included': 'true' } : {})}
            className={cn(
              pitchedOmittedTriggered ? 'rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-2' : '',
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-xs text-muted-foreground">Pitched</p>
              {pitchedOmittedTriggered && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                  Not included
                </span>
              )}
            </div>
            {editing?.pitched.active ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  value={editing.pitched.rawValue}
                  onChange={(e) => editing.pitched.onChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') editing.pitched.onDone()
                  }}
                  onBlur={() => editing.pitched.onDone()}
                  autoFocus
                  className="h-9 text-base w-28"
                  placeholder="raw sqft"
                />
                <span className="text-xs text-muted-foreground">sqft (raw)</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editing.pitched.onDone()}
                  className="text-primary hover:text-primary/80 transition-colors"
                  aria-label="Save pitched sqft"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className={cn(
                  'text-sm font-semibold',
                  pitchedOmittedTriggered ? 'text-red-900 dark:text-red-200' : 'text-foreground',
                )}>
                  {pitchedAreaSqft.toLocaleString()} sqft
                </p>
                {editing && (
                  <button
                    type="button"
                    onClick={() => editing.pitched.onStart()}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Edit pitched sqft"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            {pitchedOmittedTriggered && (
              <p className="text-[11px] text-red-800 dark:text-red-300 mt-1">
                This is the main roof. Tap a pitched material on the page to include it.
              </p>
            )}
          </div>

          {editing && (
            <p className="text-[11px] text-muted-foreground">
              Tap the pencil to enter your real measurement when the satellite is off.
            </p>
          )}
        </div>
      )}

      {!isAddonsOnly && (() => {
        const { pitchedWaste, flatWaste, pitchedSquares, flatSquares } = computeRoofTotal({
          pitchedAreaSqft: Math.round(pitchedAreaSqft),
          flatAreaSqft: Math.round(flatAreaSqft),
          includeMaterialOrder,
          includeFlatArea,
        })
        const showPitched = pitchedWaste > 0
        const showFlat = flatWaste > 0
        if (!showPitched && !showFlat) return null
        return (
          <div className="border-t pt-3" data-row-total="material-order">
            <div className="flex items-stretch gap-3">
              {showPitched && (
                <div className="flex-1" data-total="main-roof">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Main Roof Total
                  </span>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    ~{pitchedWaste.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-muted-foreground">sqft ({pitchedSquares} sq)</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Pitched + 2% waste</p>
                </div>
              )}
              {showPitched && showFlat && (
                <div className="w-px self-stretch bg-border" aria-hidden="true" />
              )}
              {showFlat && (
                <div className="flex-1" data-total="flat-roof">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Flat Total
                  </span>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    ~{flatWaste.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-muted-foreground">sqft ({flatSquares} sq)</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Flat + 1% waste</p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Used for pricing</p>
          </div>
        )
      })()}
    </div>
  )
}
