import { sqftToSquares } from '@/lib/option-metadata'
import {
  PITCHED_WASTE_FACTOR,
  FLAT_WASTE_FACTOR,
  GUTTER_DROP_FT_BY_FLOORS,
  computeGutterTotalLinFt,
  type GutterDropsConfig,
} from '@/lib/roof-pricing'
import { computeRoofTotal } from '@/lib/roof-area-math'
import { cn } from '@/lib/utils'

interface RoofMeasurement {
  areaSqft: number
  pitch: string
  address: string
  perimeterFt?: number
  pitchedAreaSqft?: number
  flatAreaSqft?: number
  includeMaterialOrder?: boolean
  includePerimeter?: boolean
  includeFlatArea?: boolean
}

interface MetalRoofSelection {
  color: string
  roofSize: string
}

interface RoofSpecCardProps {
  roofMeasurement?: RoofMeasurement
  metalRoofSelection?: MetalRoofSelection
  roofAddonLinearFt?: Record<string, number>
  gutterDropsConfig?: GutterDropsConfig
  flowPath?: 'full_replacement' | 'addons_only' | null
  className?: string
}

const ADDON_LABELS: Record<string, string> = {
  gutters: 'Gutters',
  soffit_wood: 'Soffit Wood',
  fascia_wood: 'Fascia Wood',
  soffit_metal: 'Soffit Metal',
  fascia_metal: 'Fascia Metal',
}

export function RoofSpecCard({
  roofMeasurement: rm,
  metalRoofSelection: mrs,
  roofAddonLinearFt: linFt,
  gutterDropsConfig,
  flowPath,
  className,
}: RoofSpecCardProps) {
  const addonEntries = linFt ? Object.entries(linFt).filter(([, v]) => v > 0) : []
  if (!rm && !mrs && addonEntries.length === 0) return null

  const isAddonsOnly = flowPath === 'addons_only'
  const includeMaterialOrder = rm?.includeMaterialOrder ?? true
  const includePerimeter = rm?.includePerimeter ?? true
  const hasSplit = rm
    && (rm.pitchedAreaSqft ?? 0) > 0
    && (rm.flatAreaSqft ?? 0) > 0
    && includeMaterialOrder
  const metalColorLabel = mrs?.color
    ? mrs.color.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : undefined
  const metalSquares = mrs?.roofSize
    ? Number(mrs.roofSize) > 200
      ? sqftToSquares(Math.round(Number(mrs.roofSize) * PITCHED_WASTE_FACTOR))
      : Number(mrs.roofSize)
    : undefined

  // Arc-40: each spec rendered as a bordered card in a 2/3-col grid (mirrors
  // shared/project-items-card-grid windows/doors card layout). Section retains
  // muted background; each cell is its own card with label + value.
  const areaValue = rm && !isAddonsOnly && includeMaterialOrder
    ? (() => {
        const { pitchedAreaSqft, flatAreaSqft } = rm
        const squares = pitchedAreaSqft !== undefined && flatAreaSqft !== undefined
          ? computeRoofTotal({ pitchedAreaSqft, flatAreaSqft, includeMaterialOrder }).totalSquares
          : sqftToSquares(Math.round(rm.areaSqft * PITCHED_WASTE_FACTOR))
        return `${rm.areaSqft.toLocaleString()} sqft · ${squares} squares w/waste`
      })()
    : undefined

  return (
    <div className={cn('rounded-xl border bg-muted/30 p-4 space-y-3', className)}>
      <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Roof Spec</h4>
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"
        data-project-summary-grid
      >
        {rm?.address && (
          <SpecCard label="Address" value={rm.address} valueClass="text-xs leading-snug" />
        )}
        {areaValue && <SpecCard label="Area" value={areaValue} />}
        {rm && !isAddonsOnly && includeMaterialOrder && rm.pitch && (
          <SpecCard label="Pitch" value={rm.pitch} />
        )}
        {rm?.perimeterFt && includePerimeter && (
          <SpecCard label="Perimeter" value={`~${rm.perimeterFt.toLocaleString()} lin ft`} />
        )}
        {rm && !isAddonsOnly && hasSplit && (
          <>
            <SpecCard
              label="Pitched"
              value={`${rm.pitchedAreaSqft!.toLocaleString()} sqft (${Math.ceil((rm.pitchedAreaSqft! * PITCHED_WASTE_FACTOR) / 100)} sq)`}
            />
            <SpecCard
              label="Flat"
              value={`${rm.flatAreaSqft!.toLocaleString()} sqft (${Math.ceil((rm.flatAreaSqft! * FLAT_WASTE_FACTOR) / 100)} sq)`}
            />
          </>
        )}
        {metalColorLabel && <SpecCard label="Color" value={metalColorLabel} />}
        {metalSquares !== undefined && (
          <SpecCard label="Metal size" value={`${metalSquares} squares`} />
        )}
        {includePerimeter && addonEntries.map(([id, ft]) => {
          const isGutters = id === 'gutters'
          const totalFt = isGutters ? computeGutterTotalLinFt(ft, gutterDropsConfig) : ft
          const showBreakdown = isGutters && !!gutterDropsConfig
          const perFloor = showBreakdown ? GUTTER_DROP_FT_BY_FLOORS[gutterDropsConfig!.floors] : 0
          const drops = gutterDropsConfig?.drops ?? 0
          const floorsLabel = gutterDropsConfig?.floors === 1 ? '1-story' : '2-story'
          return (
            <SpecCard
              key={id}
              label={ADDON_LABELS[id] ?? id}
              value={`${totalFt.toLocaleString()} lin ft`}
              sub={showBreakdown
                ? `${ft.toLocaleString()} perimeter + ${drops} drop${drops === 1 ? '' : 's'} × ${perFloor} ft for ${floorsLabel}`
                : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}

function SpecCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="rounded-lg bg-background border p-3 space-y-1.5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold text-foreground', valueClass)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
