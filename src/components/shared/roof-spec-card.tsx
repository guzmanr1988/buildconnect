import { Badge } from '@/components/ui/badge'
import { sqftToSquares } from '@/lib/option-metadata'
import { ROOF_WASTE_FACTOR } from '@/lib/roof-pricing'
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
  roofPermit?: 'yes' | 'no'
  flowPath?: 'full_replacement' | 'addons_only' | null
  className?: string
}

const ADDON_LABELS: Record<string, string> = {
  gutters: 'Gutters',
  soffit_wood: 'Soffit',
  fascia_wood: 'Fascia',
}

export function RoofSpecCard({
  roofMeasurement: rm,
  metalRoofSelection: mrs,
  roofAddonLinearFt: linFt,
  roofPermit: permit,
  flowPath,
  className,
}: RoofSpecCardProps) {
  const addonEntries = linFt ? Object.entries(linFt).filter(([, v]) => v > 0) : []
  if (!rm && !mrs && !permit && addonEntries.length === 0) return null

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
        {addonEntries.map(([id, ft]) => (
          <div key={id} className="flex items-center gap-2">
            <span className="text-muted-foreground min-w-[72px]">{ADDON_LABELS[id] ?? id}</span>
            <span className="font-medium">{ft.toLocaleString()} lin ft</span>
          </div>
        ))}
        {permit && (
          <div className="flex items-start gap-2 pt-0.5">
            <span className="text-muted-foreground min-w-[72px]">Permit</span>
            <div className="flex flex-col gap-1">
              <Badge
                variant="secondary"
                className={`text-[10px] w-fit ${
                  permit === 'yes'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                }`}
              >
                {permit === 'yes' ? 'Yes — permit will be pulled' : 'No permit'}
              </Badge>
              {permit === 'no' && (
                <span className="text-[10px] text-muted-foreground italic">Cash only — financing not available</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
