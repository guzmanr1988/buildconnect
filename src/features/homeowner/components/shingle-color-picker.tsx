import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useCatalogStore } from '@/stores/catalog-store'

// PR-#429 — bundled fallback. Same substrate-derive pattern as PR-#428
// door-configurator; fallback stays byte-identical to pre-rewire so the
// rendered list does NOT churn on cold open / RLS deny / unauth.
const FALLBACK_TIMBERLINE_HDZ_COLORS = [
  { id: 'barkwood', label: 'Barkwood', color: '#4A3024' },
  { id: 'birchwood', label: 'Birchwood', color: '#B8A082' },
  { id: 'charcoal', label: 'Charcoal', color: '#3A3A3C' },
  { id: 'hickory', label: 'Hickory', color: '#6B4A2E' },
  { id: 'hunter_green', label: 'Hunter Green', color: '#2F4F2F' },
  { id: 'mission_brown', label: 'Mission Brown', color: '#4E342E' },
  { id: 'pewter_gray', label: 'Pewter Gray', color: '#8A8B85' },
  { id: 'shakewood', label: 'Shakewood', color: '#8B6F4E' },
  { id: 'slate', label: 'Slate', color: '#4A5560' },
  { id: 'weathered_wood', label: 'Weathered Wood', color: '#7A6F5F' },
]

// Substrate carries only id+label; the visual color hex stays in code
// (substrate has no field for it). Lookup by id; unknown ids fall back
// to neutral.
const SHINGLE_COLOR_HEX: Record<string, string> = Object.fromEntries(
  FALLBACK_TIMBERLINE_HDZ_COLORS.map((c) => [c.id, c.color])
)

interface ShingleColorPickerProps {
  selectedColor: string
  onChange: (color: string) => void
}

export function ShingleColorPicker({ selectedColor, onChange }: ShingleColorPickerProps) {
  const services = useCatalogStore((s) => s.services)

  const shingleColors = useMemo(() => {
    const svc = services.find((s) => s.id === 'roofing')
    const material = svc?.optionGroups?.find((g) => g.id === 'material')
    const shingle = material?.options?.find((o) => o.id === 'shingle')
    const colorsSub = shingle?.subGroups?.find((sg) => sg.id === 'shingle_colors')?.options

    if (colorsSub && colorsSub.length > 0) {
      return colorsSub.map((o) => ({
        id: o.id,
        label: o.label,
        color: SHINGLE_COLOR_HEX[o.id] ?? '#cccccc',
      }))
    }
    return FALLBACK_TIMBERLINE_HDZ_COLORS
  }, [services])

  const selected = shingleColors.find((c) => c.id === selectedColor)

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 rounded-xl border bg-background p-4 overflow-hidden"
    >
      <h4 className="text-sm font-semibold text-foreground mb-1">Architectural Shingle Color</h4>
      <p className="text-[11px] text-muted-foreground mb-4">GAF Timberline HDZ palette</p>

      <div className="flex flex-wrap gap-3">
        {shingleColors.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.label}
            onClick={() => onChange(c.id)}
            data-chip-id={c.id}
            data-chip-group="shingle_color"
            data-chip-state={selectedColor === c.id ? 'active' : 'inactive'}
            className="flex flex-col items-center gap-1 transition-all duration-150"
          >
            <div
              className={cn(
                'w-10 h-10 rounded-full border-2 shadow-sm transition-all duration-150',
                selectedColor === c.id
                  ? 'border-primary ring-2 ring-primary/30 scale-110'
                  : 'border-gray-300 hover:border-primary/40 hover:scale-105',
              )}
              style={{ backgroundColor: c.color }}
            />
            <span
              className={cn(
                'text-[10px] leading-tight text-center max-w-[64px]',
                selectedColor === c.id ? 'text-primary font-semibold' : 'text-muted-foreground',
              )}
            >
              {c.label}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-4 pt-4 border-t">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
            <span
              className="w-3 h-3 rounded-full border border-primary/30"
              style={{ backgroundColor: selected.color }}
            />
            {selected.label}
          </span>
        </div>
      )}
    </motion.div>
  )
}
