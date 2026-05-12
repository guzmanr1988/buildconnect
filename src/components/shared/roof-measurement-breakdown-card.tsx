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

// Material Order toggle is the single area gate. Chip-tap drives material
// selection (vendor SKU mapping), not whether the area belongs in the
// order — both pitched and flat are part of the Material Order bundle
// whenever the satellite measured them.
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
  const flatInOrder = includeMaterialOrder && includeFlatArea && hasFlatArea
  const showAreaBreakdown = !isAddonsOnly && includeMaterialOrder && (pitchedAreaSqft > 0 || hasFlatArea)

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
                Material Order{includeMaterialOrder && (() => {
                  const parts: string[] = []
                  if (pitchedAreaSqft > 0) parts.push('pitched')
                  if (flatInOrder) parts.push('flat')
                  if (parts.length === 0) return null
                  return (
                    <>
                      {' '}
                      <span className="text-muted-foreground/70 normal-case font-medium">
                        ({parts.join(' + ')})
                      </span>
                    </>
                  )
                })()}
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
                const { pitchedWaste, flatWaste, totalSqft } = computeRoofTotal({
                  pitchedAreaSqft: Math.round(pitchedAreaSqft),
                  flatAreaSqft: Math.round(flatAreaSqft),
                  includeMaterialOrder: true,
                  includeFlatArea,
                })
                const orderSqft = totalSqft
                const orderSquares = Math.ceil(orderSqft / 100)
                const sublabelParts: string[] = []
                if (pitchedWaste > 0) sublabelParts.push(`Pitched ${Math.round(pitchedAreaSqft).toLocaleString()}`)
                if (flatWaste > 0) sublabelParts.push(`Flat ${Math.round(flatAreaSqft).toLocaleString()}`)
                const sublabel = sublabelParts.length === 0
                  ? 'Roof measurement pending — re-measure or adjust to start an order.'
                  : `${sublabelParts.join(' + ')} sqft + 2% waste`
                return (
                  <>
                    <p className="text-xl font-bold text-foreground" data-row="material-order-headline">
                      {orderSqft.toLocaleString()}{' '}
                      <span className="text-sm font-normal text-muted-foreground">sqft ({orderSquares} squares)</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{sublabel}</p>
                  </>
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
                    disabled={!includeMaterialOrder}
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
                    <p className="text-xl font-bold text-foreground">
                      {Math.round(flatAreaSqft * 1.02).toLocaleString()}{' '}
                      <span className="text-sm font-normal text-muted-foreground">
                        sqft ({Math.ceil((flatAreaSqft * 1.02) / 100)} squares)
                      </span>
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
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Flat: <span data-row="flat">{Math.round(flatAreaSqft).toLocaleString()}</span> sqft + 2% waste
                </p>
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
        const { totalSqft, totalSquares } = computeRoofTotal({
          pitchedAreaSqft: Math.round(pitchedAreaSqft),
          flatAreaSqft: Math.round(flatAreaSqft),
          includeMaterialOrder,
          includeFlatArea,
        })
        return (
          <div className="border-t pt-3" data-row-total="material-order">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
            <p className="text-xl font-bold text-foreground mt-0.5">
              {totalSqft.toLocaleString()}{' '}
              <span className="text-sm font-normal text-muted-foreground">sqft ({totalSquares} squares)</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Used for pricing</p>
          </div>
        )
      })()}
    </div>
  )
}
