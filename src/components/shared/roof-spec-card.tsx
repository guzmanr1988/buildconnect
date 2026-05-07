import { sqftToSquares } from '@/lib/option-metadata'
import {
  ROOF_WASTE_FACTOR,
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
  includeFlat?: boolean
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
  const hasSplit = rm && (rm.pitchedAreaSqft ?? 0) > 0 && (rm.flatAreaSqft ?? 0) > 0 && rm.includeFlat !== false
  const metalColorLabel = mrs?.color
    ? mrs.color.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : undefined
  const metalSquares = mrs?.roofSize
    ? Number(mrs.roofSize) > 200
      ? sqftToSquares(Math.round(Number(mrs.roofSize) * ROOF_WASTE_FACTOR))
      : Number(mrs.roofSize)
    : undefined

  return (
    <div className={cn('rounded-xl border p-4 space-y-2', className)}>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Roof Spec</h4>
      <div className="space-y-1.5 text-sm">
        {rm && (
          <>
            {rm.address && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground min-w-[72px]">Address</span>
                <span className="font-medium text-xs leading-snug">{rm.address}</span>
              </div>
            )}
            {!isAddonsOnly && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground min-w-[72px]">Area</span>
                <span className="font-medium">
                  {rm.areaSqft.toLocaleString()} sqft · {(() => {
                    const { pitchedAreaSqft, flatAreaSqft, includeFlat } = rm
                    if (pitchedAreaSqft !== undefined && flatAreaSqft !== undefined) {
                      return computeRoofTotal({ pitchedAreaSqft, flatAreaSqft, includeFlat: includeFlat ?? (flatAreaSqft > 0) }).totalSquares
                    }
                    return sqftToSquares(Math.round(rm.areaSqft * ROOF_WASTE_FACTOR))
                  })()} squares w/waste
                </span>
              </div>
            )}
            {!isAddonsOnly && rm.pitch && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground min-w-[72px]">Pitch</span>
                <span className="font-medium">{rm.pitch}</span>
              </div>
            )}
            {rm.perimeterFt && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground min-w-[72px]">Perimeter</span>
                <span className="font-medium">~{rm.perimeterFt.toLocaleString()} lin ft</span>
              </div>
            )}
            {!isAddonsOnly && hasSplit && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground min-w-[72px]">Pitched</span>
                  <span className="font-medium">
                    {rm.pitchedAreaSqft!.toLocaleString()} sqft ({Math.ceil((rm.pitchedAreaSqft! * 1.02) / 100)} sq)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground min-w-[72px]">Flat</span>
                  <span className="font-medium">
                    {rm.flatAreaSqft!.toLocaleString()} sqft ({Math.ceil((rm.flatAreaSqft! * 1.01) / 100)} sq)
                  </span>
                </div>
              </>
            )}
          </>
        )}
        {metalColorLabel && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground min-w-[72px]">Color</span>
            <span className="font-medium">{metalColorLabel}</span>
          </div>
        )}
        {metalSquares !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground min-w-[72px]">Metal size</span>
            <span className="font-medium">{metalSquares} squares</span>
          </div>
        )}
        {addonEntries.map(([id, ft]) => {
          const isGutters = id === 'gutters'
          const totalFt = isGutters ? computeGutterTotalLinFt(ft, gutterDropsConfig) : ft
          const showBreakdown = isGutters && !!gutterDropsConfig
          const perFloor = showBreakdown ? GUTTER_DROP_FT_BY_FLOORS[gutterDropsConfig!.floors] : 0
          const drops = gutterDropsConfig?.drops ?? 0
          const floorsLabel = gutterDropsConfig?.floors === 1 ? '1-story' : '2-story'
          return (
            <div key={id} className="flex items-start gap-2">
              <span className="text-muted-foreground min-w-[72px]">{ADDON_LABELS[id] ?? id}</span>
              <div className="flex flex-col">
                <span className="font-medium">{totalFt.toLocaleString()} lin ft</span>
                {showBreakdown && (
                  <span className="text-[11px] text-muted-foreground">
                    {ft.toLocaleString()} perimeter + {drops} drop{drops === 1 ? '' : 's'} × {perFloor} ft for {floorsLabel}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
