import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type TileType = 'flat' | 'spanish' | 'mission'

export interface TileRoofSelection {
  tileType: TileType | ''
  tileColor: string
}

export const TILE_TYPES: Array<{ id: TileType; label: string; description: string }> = [
  { id: 'flat', label: 'Flat', description: 'Low-profile flat tile' },
  { id: 'spanish', label: 'Spanish', description: 'S-shape, classic curve' },
  { id: 'mission', label: 'Mission', description: 'Half-barrel, hand-laid look' },
]

export const TILE_ROOF_COLORS: Array<{ id: string; label: string; color: string }> = [
  { id: 'charcoal', label: 'Charcoal', color: '#3d4147' },
  { id: 'onyx', label: 'Onyx', color: '#1a1a1c' },
  { id: 'slate_grey', label: 'Slate Grey', color: '#7a7d80' },
  { id: 'sea_blue', label: 'Sea Blue', color: '#4a8a9c' },
  { id: 'aged_navy', label: 'Aged Navy', color: '#2f3b55' },
  { id: 'terracotta_red', label: 'Terracotta Red', color: '#b34a3d' },
  { id: 'coral', label: 'Coral', color: '#d68a78' },
  { id: 'spanish_blend', label: 'Spanish Blend', color: '#a05a3c' },
  { id: 'earth_blend', label: 'Earth Blend', color: '#8b7355' },
  { id: 'cream_blend', label: 'Cream Blend', color: '#d4b896' },
  { id: 'sand', label: 'Sand', color: '#c9a778' },
  { id: 'burnt_sienna', label: 'Burnt Sienna', color: '#9c4a2a' },
]

interface TileRoofConfiguratorProps {
  selection: TileRoofSelection
  onChange: (selection: TileRoofSelection) => void
}

export function TileRoofConfigurator({ selection, onChange }: TileRoofConfiguratorProps) {
  const selectedColor = TILE_ROOF_COLORS.find((c) => c.id === selection.tileColor)

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 rounded-xl border bg-background p-4 overflow-hidden"
      data-roofing-tile-configurator="true"
    >
      <h4 className="text-sm font-semibold text-foreground mb-4">Tile Roof Options</h4>

      <div className="flex flex-col gap-5">
        {/* Tile Type cards */}
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-3 block">Tile Type</span>
          <div className="grid grid-cols-3 gap-2">
            {TILE_TYPES.map((t) => {
              const isSelected = selection.tileType === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange({ ...selection, tileType: t.id })}
                  data-testid={`tile-type-card-${t.id}`}
                  data-roofing-tile-type-card={t.id}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-all duration-150',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted'
                  )}
                >
                  <p className={cn(
                    'text-sm font-semibold',
                    isSelected ? 'text-primary' : 'text-foreground'
                  )}>
                    {t.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                    {t.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tile Color palette */}
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-3 block">Color</span>
          <div className="flex flex-wrap gap-2">
            {TILE_ROOF_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                onClick={() => onChange({ ...selection, tileColor: c.id })}
                data-testid={`tile-color-circle-${c.id}`}
                data-roofing-tile-color-circle={c.id}
                className={cn(
                  'flex flex-col items-center gap-1 transition-all duration-150',
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full border-2 shadow-sm transition-all duration-150',
                    selection.tileColor === c.id
                      ? 'border-primary ring-2 ring-primary/30 scale-110'
                      : 'border-gray-300 hover:border-primary/40 hover:scale-105'
                  )}
                  style={{ backgroundColor: c.color }}
                />
                <span className={cn(
                  'text-[9px] leading-tight text-center max-w-[56px]',
                  selection.tileColor === c.id ? 'text-primary font-semibold' : 'text-muted-foreground'
                )}>
                  {c.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {(selection.tileType || selection.tileColor) && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex flex-wrap gap-1.5">
            {selection.tileType && (
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                {TILE_TYPES.find((t) => t.id === selection.tileType)?.label}
              </span>
            )}
            {selectedColor && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                <span
                  className="w-3 h-3 rounded-full border border-primary/30"
                  style={{ backgroundColor: selectedColor.color }}
                />
                {selectedColor.label}
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
