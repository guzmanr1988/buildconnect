import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const METAL_ROOF_COLORS = [
  // Whites/Grays
  { id: 'snow_white', label: 'Snow White', color: '#F5F5F5', group: 'Whites & Grays' },
  { id: 'bone_white', label: 'Bone White', color: '#E8E0D4', group: 'Whites & Grays' },
  { id: 'slate_gray', label: 'Slate Gray', color: '#708090', group: 'Whites & Grays' },
  { id: 'charcoal_gray', label: 'Charcoal Gray', color: '#4A4A4A', group: 'Whites & Grays' },
  { id: 'ash_gray', label: 'Ash Gray', color: '#B2BEB5', group: 'Whites & Grays' },
  { id: 'burnished_slate', label: 'Burnished Slate', color: '#5A5B5E', group: 'Whites & Grays' },
  { id: 'matte_black', label: 'Matte Black', color: '#1C1C1C', group: 'Whites & Grays' },

  // Browns/Tans
  { id: 'desert_sand', label: 'Desert Sand', color: '#D2B48C', group: 'Browns & Tans' },
  { id: 'terra_cotta', label: 'Terra Cotta', color: '#C0623A', group: 'Browns & Tans' },
  { id: 'saddle_tan', label: 'Saddle Tan', color: '#8B6914', group: 'Browns & Tans' },
  { id: 'cocoa_brown', label: 'Cocoa Brown', color: '#5C3317', group: 'Browns & Tans' },
  { id: 'dark_bronze', label: 'Dark Bronze', color: '#483C32', group: 'Browns & Tans' },
  { id: 'mansard_brown', label: 'Mansard Brown', color: '#6B3A2A', group: 'Browns & Tans' },
  { id: 'rustic_red', label: 'Rustic Red', color: '#8B3A3A', group: 'Browns & Tans' },

  // Reds
  { id: 'patriot_red', label: 'Patriot Red', color: '#B22234', group: 'Reds' },
  { id: 'colonial_red', label: 'Colonial Red', color: '#9B1B30', group: 'Reds' },
  { id: 'crimson_red', label: 'Crimson Red', color: '#DC143C', group: 'Reds' },
  { id: 'cardinal_red', label: 'Cardinal Red', color: '#C41E3A', group: 'Reds' },
  { id: 'burgundy', label: 'Burgundy', color: '#722F37', group: 'Reds' },

  // Greens
  { id: 'patina_green', label: 'Patina Green', color: '#6B8E6B', group: 'Greens' },
  { id: 'forest_green', label: 'Forest Green', color: '#228B22', group: 'Greens' },
  { id: 'hunter_green', label: 'Hunter Green', color: '#355E3B', group: 'Greens' },
  { id: 'evergreen', label: 'Evergreen', color: '#2D5A27', group: 'Greens' },
  { id: 'hartford_green', label: 'Hartford Green', color: '#4A6741', group: 'Greens' },
  { id: 'ivy_green', label: 'Ivy Green', color: '#3B5323', group: 'Greens' },
  { id: 'teal', label: 'Teal', color: '#008080', group: 'Greens' },

  // Blues
  { id: 'military_blue', label: 'Military Blue', color: '#3B5998', group: 'Blues' },
  { id: 'ocean_blue', label: 'Ocean Blue', color: '#4682B4', group: 'Blues' },
  { id: 'regal_blue', label: 'Regal Blue', color: '#003366', group: 'Blues' },
  { id: 'hawaiian_blue', label: 'Hawaiian Blue', color: '#008ECC', group: 'Blues' },
  { id: 'slate_blue', label: 'Slate Blue', color: '#6A5ACD', group: 'Blues' },
  { id: 'pacific_blue', label: 'Pacific Blue', color: '#1CA9C9', group: 'Blues' },
  { id: 'gallery_blue', label: 'Gallery Blue', color: '#5B8FAF', group: 'Blues' },

  // Metallics
  { id: 'galvalume', label: 'Galvalume', color: '#C0C0C0', group: 'Metallics' },
  { id: 'silver', label: 'Silver', color: '#A8A8A8', group: 'Metallics' },
  { id: 'copper_penny', label: 'Copper Penny', color: '#AD6F4B', group: 'Metallics' },
  { id: 'aged_copper', label: 'Aged Copper', color: '#6D8B74', group: 'Metallics' },
  { id: 'champagne', label: 'Champagne', color: '#D4AF37', group: 'Metallics' },
  { id: 'weathered_zinc', label: 'Weathered Zinc', color: '#8A8D8F', group: 'Metallics' },
]

const COLOR_GROUPS = [...new Set(METAL_ROOF_COLORS.map((c) => c.group))]

export interface MetalRoofSelection {
  color: string
  roofSize: string
}

interface MetalRoofConfiguratorProps {
  selection: MetalRoofSelection
  onChange: (selection: MetalRoofSelection) => void
  onSave?: () => void
}

export function MetalRoofConfigurator({ selection, onChange, onSave }: MetalRoofConfiguratorProps) {
  const isComplete = selection.color && selection.roofSize.trim().length > 0
  const selectedColor = METAL_ROOF_COLORS.find((c) => c.id === selection.color)

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 rounded-xl border bg-background p-4 overflow-hidden"
    >
      <h4 className="text-sm font-semibold text-foreground mb-4">Standing Seam Metal Options</h4>

      <div className="flex flex-col gap-5">
        {/* Colors by group */}
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-3 block">Color</span>
          <div className="flex flex-col gap-4">
            {COLOR_GROUPS.map((group) => {
              const colors = METAL_ROOF_COLORS.filter((c) => c.group === group)
              return (
                <div key={group}>
                  <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                    {group}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        title={c.label}
                        onClick={() => onChange({ ...selection, color: c.id })}
                        className={cn(
                          'flex flex-col items-center gap-1 transition-all duration-150',
                        )}
                      >
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full border-2 shadow-sm transition-all duration-150',
                            selection.color === c.id
                              ? 'border-primary ring-2 ring-primary/30 scale-110'
                              : 'border-gray-300 hover:border-primary/40 hover:scale-105'
                          )}
                          style={{ backgroundColor: c.color }}
                        />
                        <span className={cn(
                          'text-[9px] leading-tight text-center max-w-[48px]',
                          selection.color === c.id ? 'text-primary font-semibold' : 'text-muted-foreground'
                        )}>
                          {c.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Roof size input */}
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Roof Size (Sq Ft)</span>
          <Input
            type="number"
            min="0"
            placeholder="Enter square footage"
            value={selection.roofSize}
            onChange={(e) => onChange({ ...selection, roofSize: e.target.value })}
            className="h-10"
          />
        </div>
      </div>

      {/* Summary + Save */}
      {(selection.color || selection.roofSize) && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedColor && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                <span
                  className="w-3 h-3 rounded-full border border-primary/30"
                  style={{ backgroundColor: selectedColor.color }}
                />
                {selectedColor.label}
              </span>
            )}
            {selection.roofSize && (
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                {Number(selection.roofSize).toLocaleString()} Sq Ft
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
