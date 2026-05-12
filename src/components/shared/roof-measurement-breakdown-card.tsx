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
  material: string | null
  includeFlat: boolean
  includePitched: boolean
  hasFlatSection: boolean
  pitchedOmittedTriggered?: boolean
  flowPath?: FlowPath
  source: 'wizard-step2' | 'wizard-step3' | 'service-detail'
  onToggleFlat?: (on: boolean) => void
  onTogglePitched?: (on: boolean) => void
  editing?: { pitched: EditingControls; flat: EditingControls }
}

export function RoofMeasurementBreakdownCard({
  pitchedAreaSqft,
  flatAreaSqft,
  pitch,
  perimeterFt,
  material,
  includeFlat,
  includePitched,
  hasFlatSection,
  pitchedOmittedTriggered = false,
  flowPath = null,
  source,
  onToggleFlat,
  onTogglePitched,
  editing,
}: RoofMeasurementBreakdownCardProps) {
  const isAddonsOnly = flowPath === 'addons_only'
  const showAreaBreakdown = !isAddonsOnly && (pitchedAreaSqft > 0 || flatAreaSqft > 0)
  const isPitchedSelected = material !== null
  const nothingSelected = !includePitched && !includeFlat

  return (
    <div
      className="rounded-xl border bg-muted/30 p-4 space-y-3"
      data-roof-breakdown-card="true"
      data-roof-breakdown-source={source}
    >
      {!isAddonsOnly && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Material Order{' '}
                <span className="text-muted-foreground/70 normal-case font-medium">
                  ({(() => {
                    const parts: string[] = []
                    if (isPitchedSelected && includePitched) parts.push('pitched')
                    if (includeFlat) parts.push('flat')
                    if (parts.length === 0) return 'nothing selected'
                    return parts.join(' + ')
                  })()})
                </span>
              </span>
            </div>
            {(() => {
              const { pitchedWaste, flatWaste, totalSqft } = computeRoofTotal({
                pitchedAreaSqft: Math.round(pitchedAreaSqft),
                flatAreaSqft: Math.round(flatAreaSqft),
                includeFlat,
                includePitched: isPitchedSelected && includePitched,
              })
              const orderSqft = totalSqft
              const orderSquares = Math.ceil(orderSqft / 100)
              const sublabelParts: string[] = []
              if (isPitchedSelected && includePitched && pitchedWaste > 0) sublabelParts.push(`Pitched ${Math.round(pitchedAreaSqft).toLocaleString()}`)
              if (includeFlat && flatWaste > 0) sublabelParts.push(`Flat ${Math.round(flatAreaSqft).toLocaleString()}`)
              const sublabel = sublabelParts.length === 0
                ? 'Toggle a section on below to start an order.'
                : `${sublabelParts.join(' + ')} sqft + 2% waste`
              return (
                <>
                  <p className="text-xl font-bold text-foreground">
                    {orderSqft.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-muted-foreground">sqft ({orderSquares} squares)</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{sublabel}</p>
                </>
              )
            })()}
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
      )}

      <div className={isAddonsOnly ? '' : 'border-t pt-3'}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <Ruler className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Roof Perimeter
          </span>
        </div>
        <p className="text-xl font-bold text-foreground">
          ~{perimeterFt.toLocaleString()}{' '}
          <span className="text-sm font-normal text-muted-foreground">lin ft</span>
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Used for gutter, fascia, and soffit estimates
        </p>
      </div>

      {showAreaBreakdown && (
        <div className="border-t pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Area Breakdown
            </span>
          </div>

          {nothingSelected && (
            <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-3 text-center">
              <p className="text-sm font-semibold text-foreground">Nothing selected</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Turn on a section below to include it in your order.
              </p>
            </div>
          )}

          <div className={cn('relative', !includeFlat && flatAreaSqft > 0 && 'opacity-60')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Flat Area</span>
              <div className="flex items-center gap-2">
                {flatAreaSqft > 0 && !includeFlat && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5 font-semibold">
                    Not included
                  </span>
                )}
                {onToggleFlat && flatAreaSqft > 0 && (
                  <>
                    <Label htmlFor="include-flat-toggle" className="sr-only">Include flat area</Label>
                    <Switch id="include-flat-toggle" checked={includeFlat} onCheckedChange={onToggleFlat} />
                  </>
                )}
              </div>
            </div>
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
              Flat: {Math.round(flatAreaSqft).toLocaleString()} sqft + 2% waste
            </p>
          </div>

          <div
            {...(pitchedOmittedTriggered ? { 'data-pitched-not-included': 'true' } : {})}
            className={cn(
              pitchedOmittedTriggered ? 'rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-2' : '',
              !pitchedOmittedTriggered && !includePitched && pitchedAreaSqft > 0 && 'opacity-60',
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-xs text-muted-foreground">Pitched</p>
              <div className="flex items-center gap-2">
                {pitchedOmittedTriggered && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                    Not included
                  </span>
                )}
                {!pitchedOmittedTriggered && !includePitched && pitchedAreaSqft > 0 && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5 font-semibold">
                    Not included
                  </span>
                )}
                {onTogglePitched && !pitchedOmittedTriggered && pitchedAreaSqft > 0 && (
                  <>
                    <Label htmlFor="include-pitched-toggle" className="sr-only">Include pitched area</Label>
                    <Switch id="include-pitched-toggle" checked={includePitched} onCheckedChange={onTogglePitched} />
                  </>
                )}
              </div>
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

          {flatAreaSqft > 0 && !hasFlatSection && !includeFlat && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-1.5">
              + Add flat section to order — tap the Flat Roof chip on the page, or flip the toggle above.
            </p>
          )}
        </div>
      )}

      {!isAddonsOnly && (() => {
        const { totalSqft, totalSquares } = computeRoofTotal({
          pitchedAreaSqft: Math.round(pitchedAreaSqft),
          flatAreaSqft: Math.round(flatAreaSqft),
          includeFlat,
          includePitched: isPitchedSelected && includePitched,
        })
        return (
          <div className="border-t pt-3">
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
