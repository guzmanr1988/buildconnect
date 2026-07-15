import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useCatalogStore } from '@/stores/catalog-store'

// PR-#430 — bundled fallback. Same substrate-derive pattern as PR-#428
// door-configurator; fallback stays byte-identical to pre-rewire so the
// rendered list does NOT churn on cold open / RLS deny / unauth.
export const FALLBACK_ALUMINUM_ROOF_COLORS = [
  { id: 'charcoal_gray', label: 'Charcoal Gray', color: '#4A4A4A' },
  { id: 'bronze', label: 'Bronze', color: '#7B5E3A' },
  { id: 'white', label: 'White', color: '#F5F5F5' },
  { id: 'almond', label: 'Almond', color: '#E8DDC4' },
  { id: 'forest_green', label: 'Forest Green', color: '#228B22' },
  { id: 'burgundy', label: 'Burgundy', color: '#722F37' },
  { id: 'hartford_green', label: 'Hartford Green', color: '#4A6741' },
  { id: 'sandstone', label: 'Sandstone', color: '#C9B58F' },
]

export const ALUMINUM_COLOR_HEX: Record<string, string> = Object.fromEntries(
  FALLBACK_ALUMINUM_ROOF_COLORS.map((c) => [c.id, c.color])
)

export interface AluminumRoofSelection {
  color: string
  roofSize: string
}

interface AluminumRoofConfiguratorProps {
  selection: AluminumRoofSelection
  onChange: (selection: AluminumRoofSelection) => void
  onSave?: () => void
}

export function AluminumRoofConfigurator({ selection, onChange, onSave }: AluminumRoofConfiguratorProps) {
  const services = useCatalogStore((s) => s.services)

  const aluminumColors = useMemo(() => {
    const svc = services.find((s) => s.id === 'roofing')
    const material = svc?.optionGroups?.find((g) => g.id === 'material')
    const aluminum = material?.options?.find((o) => o.id === 'aluminum')
    const colorsSub = aluminum?.subGroups?.find((sg) => sg.id === 'aluminum_colors')?.options

    if (colorsSub && colorsSub.length > 0) {
      return colorsSub.map((o) => ({
        id: o.id,
        label: o.label,
        color: ALUMINUM_COLOR_HEX[o.id] ?? '#cccccc',
      }))
    }
    return FALLBACK_ALUMINUM_ROOF_COLORS
  }, [services])

  const selected = aluminumColors.find((c) => c.id === selection.color)
  const isComplete = !!selection.color && selection.roofSize.trim().length > 0

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 rounded-xl border bg-background p-4 overflow-hidden"
      data-roofing-aluminum-configurator="true"
    >
      <h4 className="text-sm font-semibold text-foreground mb-4">Aluminum Roof Options</h4>

      <div className="flex flex-col gap-5">
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-3 block">Color</span>
          <div className="flex flex-wrap gap-3">
            {aluminumColors.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                onClick={() => onChange({ ...selection, color: c.id })}
                data-chip-id={c.id}
                data-chip-group="aluminum_color"
                data-chip-state={selection.color === c.id ? 'active' : 'inactive'}
                className="flex flex-col items-center gap-1 transition-all duration-150"
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-full border-2 shadow-sm transition-all duration-150',
                    selection.color === c.id
                      ? 'border-primary ring-2 ring-primary/30 scale-110'
                      : 'border-gray-300 hover:border-primary/40 hover:scale-105',
                  )}
                  style={{ backgroundColor: c.color }}
                />
                <span
                  className={cn(
                    'text-[10px] leading-tight text-center max-w-[64px]',
                    selection.color === c.id ? 'text-primary font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {c.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-muted-foreground mb-0.5 block">Roof Size (Squares)</span>
          <span className="text-[10px] text-muted-foreground/70 mb-1.5 block">1 square = 100 sqft</span>
          <Input
            type="number"
            min="0"
            placeholder="e.g. 18"
            value={selection.roofSize}
            onChange={(e) => onChange({ ...selection, roofSize: e.target.value })}
            className="h-10"
          />
        </div>
      </div>

      {(selection.color || selection.roofSize) && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selected && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                <span
                  className="w-3 h-3 rounded-full border border-primary/30"
                  style={{ backgroundColor: selected.color }}
                />
                {selected.label}
              </span>
            )}
            {selection.roofSize && (
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                {Number(selection.roofSize).toLocaleString()} squares
              </span>
            )}
          </div>
          {isComplete && onSave && (
            <Button
              className="w-full h-10 rounded-xl text-sm font-semibold"
              onClick={onSave}
            >
              Save Selection
            </Button>
          )}
        </div>
      )}
    </motion.div>
  )
}
