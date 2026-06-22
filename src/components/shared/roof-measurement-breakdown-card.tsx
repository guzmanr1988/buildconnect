import { Layers, Ruler } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { computeRoofTotal } from '@/lib/roof-area-math'

type FlowPath = 'full_replacement' | 'addons_only' | null

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
}

// Display layout: 2x2 grid at all viewports — vertical divider middle +
// horizontal divider between rows. Cells: TOP-LEFT Main Roof Total, TOP-RIGHT
// Roof Pitch, BOTTOM-LEFT Roof Perimeter, BOTTOM-RIGHT Flat Total. Toggles live inline in
// the header of each cell that has one. Manual override is reachable via the
// 'Adjust manually' link in the wizard Step-2 panel (the canonical override
// path); no inline pencils.
//
// Two independent area gates: Main Roof toggle (includeMaterialOrder) gates
// pitched material in the order; Flat Area toggle (includeFlatArea) gates
// flat membrane independently. Each toggle gates its own area class — flipping
// Main Roof OFF does not also exclude flat.
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
}: RoofMeasurementBreakdownCardProps) {
  const isAddonsOnly = flowPath === 'addons_only'
  const hasFlatArea = flatAreaSqft > 0

  const { pitchedWaste, flatWaste, pitchedSquares, flatSquares } = computeRoofTotal({
    pitchedAreaSqft: Math.round(pitchedAreaSqft),
    flatAreaSqft: Math.round(flatAreaSqft),
    includeMaterialOrder,
    includeFlatArea,
  })

  // Addons-only flow: no main-roof / pitch / flat — only show the perimeter row.
  if (isAddonsOnly) {
    return (
      <div
        className="rounded-xl border bg-muted/30 p-4"
        data-roof-breakdown-card="true"
        data-roof-breakdown-source={source}
      >
        <PerimeterCell
          perimeterFt={perimeterFt}
          includePerimeter={includePerimeter}
          onTogglePerimeter={onTogglePerimeter}
        />
      </div>
    )
  }

  return (
    <div
      className="rounded-xl border bg-muted/30 overflow-hidden"
      data-roof-breakdown-card="true"
      data-roof-breakdown-source={source}
    >
      <div className="grid grid-cols-2" data-mobile-2x2="true">
        {/* TOP-LEFT: MAIN ROOF TOTAL (or pitchedOmitted red banner) */}
        <div
          data-grid-cell="main-roof-total"
          className={cn(
            'p-4 relative flex flex-col items-center justify-center text-center',
            pitchedOmittedTriggered
              ? 'border-2 border-red-500 bg-red-50 dark:bg-red-950/30'
              : !includeMaterialOrder && 'opacity-60',
          )}
          data-row="pitched"
          data-pitched-not-included={pitchedOmittedTriggered ? 'true' : undefined}
          data-total={pitchedOmittedTriggered ? undefined : 'main-roof'}
        >
          {!pitchedOmittedTriggered && onToggleMaterialOrder && (
            <div className="absolute top-3 right-3">
              <Label htmlFor="include-material-order-toggle" className="sr-only">Include material order</Label>
              <Switch
                id="include-material-order-toggle"
                data-toggle="material-order"
                checked={includeMaterialOrder}
                onCheckedChange={onToggleMaterialOrder}
              />
            </div>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <Layers
              className={cn(
                'h-3.5 w-3.5',
                pitchedOmittedTriggered ? 'text-red-700 dark:text-red-300' : 'text-primary',
              )}
            />
            <span
              className={cn(
                'text-[11px] font-semibold uppercase tracking-wide',
                pitchedOmittedTriggered
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-muted-foreground',
              )}
            >
              {pitchedOmittedTriggered ? 'Main Roof — Not Included' : 'Main Roof Total'}
            </span>
          </div>
          {pitchedOmittedTriggered ? (
            <>
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                {pitchedAreaSqft.toLocaleString()} sqft
              </p>
              <p className="text-[11px] text-red-800 dark:text-red-300 mt-1">
                This is the main roof. Tap a pitched material on the page to include it.
              </p>
            </>
          ) : !includeMaterialOrder ? (
            <>
              <p className="text-xl font-bold text-foreground">Excluded</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Flip the toggle to include shingles or membrane in the order.
              </p>
            </>
          ) : pitchedWaste === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Roof measurement pending — re-measure or adjust to start an order.
            </p>
          ) : (
            <>
              <p className="text-xl font-bold text-foreground">
                ~{pitchedWaste.toLocaleString()}
                <span data-mainroof-stacked="true" className="block text-sm font-normal text-muted-foreground">sqft ({pitchedSquares} sq)</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Pitched + 2% waste</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Used for pricing</p>
            </>
          )}
        </div>

        {/* TOP-RIGHT: ROOF PITCH */}
        <div
          data-grid-cell="roof-pitch"
          className="p-4 border-l flex flex-col items-center justify-center text-center"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Ruler className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Roof Pitch
            </span>
          </div>
          <p className="text-xl font-bold text-foreground">{pitch}</p>
        </div>

        {/* BOTTOM-LEFT: ROOF PERIMETER */}
        <div
          data-grid-cell="roof-perimeter"
          className={cn(
            'p-4 border-t relative flex flex-col items-center justify-center text-center',
            !includePerimeter && 'opacity-60',
          )}
        >
          <PerimeterCellInner
            perimeterFt={perimeterFt}
            includePerimeter={includePerimeter}
            onTogglePerimeter={onTogglePerimeter}
          />
        </div>

        {/* BOTTOM-RIGHT: FLAT TOTAL */}
        <div
          data-grid-cell="flat-total"
          data-total="flat-roof"
          data-flat-state={includeFlatArea ? 'included' : 'excluded'}
          className={cn(
            'p-4 border-t border-l relative flex flex-col items-center justify-center text-center',
            hasFlatArea && !includeFlatArea && 'opacity-60',
          )}
        >
          {hasFlatArea && onToggleFlatArea && (
            <div className="absolute top-3 right-3">
              <Label htmlFor="include-flat-area-toggle" className="sr-only">Include flat area</Label>
              <Switch
                id="include-flat-area-toggle"
                data-toggle="flat-area"
                checked={includeFlatArea}
                onCheckedChange={onToggleFlatArea}
              />
            </div>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Flat Total
            </span>
          </div>
          {!hasFlatArea ? (
            <p className="text-sm text-muted-foreground">No flat area detected</p>
          ) : !includeFlatArea ? (
            <>
              <p className="text-xl font-bold text-foreground">
                <span data-row="flat">{Math.round(flatAreaSqft).toLocaleString()}</span> sqft
                <span className="text-sm font-normal text-muted-foreground"> — Excluded</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Flip the toggle to include flat-roof membrane in the order.
              </p>
            </>
          ) : flatWaste === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Flat measurement pending.
            </p>
          ) : (
            <>
              <p className="text-xl font-bold text-foreground">
                ~<span data-row="flat">{flatWaste.toLocaleString()}</span>{' '}
                <span className="text-sm font-normal text-muted-foreground">sqft ({flatSquares} sq)</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Flat + 1% waste</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PerimeterCellInner({
  perimeterFt,
  includePerimeter,
  onTogglePerimeter,
}: {
  perimeterFt: number
  includePerimeter: boolean
  onTogglePerimeter?: (on: boolean) => void
}) {
  return (
    <>
      {onTogglePerimeter && (
        <div className="absolute top-3 right-3">
          <Label htmlFor="include-perimeter-toggle" className="sr-only">Include perimeter add-ons</Label>
          <Switch
            id="include-perimeter-toggle"
            data-toggle="roof-perimeter"
            checked={includePerimeter}
            onCheckedChange={onTogglePerimeter}
          />
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-1">
        <Ruler className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Roof Perimeter
        </span>
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
    </>
  )
}

function PerimeterCell(props: {
  perimeterFt: number
  includePerimeter: boolean
  onTogglePerimeter?: (on: boolean) => void
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center text-center',
        !props.includePerimeter && 'opacity-60',
      )}
    >
      <PerimeterCellInner {...props} />
    </div>
  )
}
