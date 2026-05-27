import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCatalogStore } from '@/stores/catalog-store'

// PR-#429 — bundled fallbacks. Same substrate-derive pattern as PR-#428
// door-configurator; fallbacks stay byte-identical to pre-rewire so the
// rendered list does NOT churn on cold open / RLS deny / unauth.
const FALLBACK_GARAGE_DOOR_TYPES = [
  { id: 'single_garage', label: 'Single Garage Door' },
  { id: 'double_garage', label: 'Double Garage Door' },
]

const FALLBACK_GARAGE_DOOR_SIZES = [
  { id: 'gd_4_panels', label: '4 Panels' },
  { id: 'gd_5_panels', label: '5 Panels' },
]

const FALLBACK_GARAGE_DOOR_COLORS = [
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'bronze', label: 'Bronze', color: '#5B3A29' },
  { id: 'black', label: 'Black', color: '#1a1a1a' },
]

const FALLBACK_GARAGE_DOOR_GLASS = [
  { id: 'grey-white', label: 'Grey-White', color: '#6b7280' },
  { id: 'clear-white', label: 'Clear-White', color: '#d1d5db' },
  { id: 'grey', label: 'Grey', color: '#9ca3af' },
  { id: 'clear', label: 'Clear', color: '#e0f2fe' },
]

// Substrate carries id+label; visual hex stays in code because the
// substrate doesn't carry that field.
const GARAGE_DOOR_COLOR_HEX: Record<string, string> = {
  white: '#ffffff',
  bronze: '#5B3A29',
  black: '#1a1a1a',
}
const GARAGE_DOOR_GLASS_HEX: Record<string, string> = {
  'grey-white': '#6b7280',
  'clear-white': '#d1d5db',
  grey: '#9ca3af',
  clear: '#e0f2fe',
}

export interface GarageDoorSelection {
  type: string
  size: string
  color: string
  glass: string
}

interface GarageDoorConfiguratorProps {
  selection: GarageDoorSelection
  onChange: (selection: GarageDoorSelection) => void
  onSave?: () => void
}

export function GarageDoorConfigurator({ selection, onChange, onSave }: GarageDoorConfiguratorProps) {
  const services = useCatalogStore((s) => s.services)
  // PR-#433 — Rod-surfaced: Save Selection must require explicit Color +
  // Glass Color picks. Other fields (type/size) are implicit (Save only
  // shows inside type-guarded summary) so we tighten to the two Rod called
  // out; this also drops the single_garage size-reset trap that prevented
  // single_garage from ever reaching Save.
  const isComplete = !!(selection.color && selection.glass)

  const { garageDoorTypes, garageDoorSizes, garageDoorColors, garageDoorGlass } = useMemo(() => {
    const svc = services.find((s) => s.id === 'garage')
    const products = svc?.optionGroups?.find((g) => g.id === 'products')
    const garageDoors = products?.options?.find((o) => o.id === 'garage_doors')
    const findSub = (id: string) => garageDoors?.subGroups?.find((sg) => sg.id === id)

    const typesSub = findSub('garage_door_types')?.options
    const sizesSub = findSub('garage_door_sizes')?.options
    const colorsSub = findSub('garage_door_colors')?.options
    const glassSub = findSub('garage_door_glass')?.options

    return {
      garageDoorTypes:
        typesSub && typesSub.length > 0
          ? typesSub.map((o) => ({ id: o.id, label: o.label }))
          : FALLBACK_GARAGE_DOOR_TYPES,
      garageDoorSizes:
        sizesSub && sizesSub.length > 0
          ? sizesSub.map((o) => ({ id: o.id, label: o.label }))
          : FALLBACK_GARAGE_DOOR_SIZES,
      garageDoorColors:
        colorsSub && colorsSub.length > 0
          ? colorsSub.map((o) => ({ id: o.id, label: o.label, color: GARAGE_DOOR_COLOR_HEX[o.id] ?? '#cccccc' }))
          : FALLBACK_GARAGE_DOOR_COLORS,
      garageDoorGlass:
        glassSub && glassSub.length > 0
          ? glassSub.map((o) => ({ id: o.id, label: o.label, color: GARAGE_DOOR_GLASS_HEX[o.id] ?? '#cccccc' }))
          : FALLBACK_GARAGE_DOOR_GLASS,
    }
  }, [services])

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 rounded-xl border bg-background p-4 overflow-hidden"
    >
      <h4 className="text-base font-semibold text-foreground mb-4">Garage Door Options</h4>

      <div className="flex flex-col gap-4">
        {/* Type */}
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</span>
          <div className="flex gap-2">
            {garageDoorTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ ...selection, type: t.id, size: t.id === 'single_garage' ? '' : selection.size })}
                className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  selection.type === t.id
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted'
                }`}
              >
                {/* Garage door icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width={t.id === 'double_garage' ? '18' : '12'} height="16" rx="1" />
                  {t.id === 'double_garage' && <line x1="12" y1="4" x2="12" y2="20" />}
                  <line x1="5" y1="8" x2={t.id === 'double_garage' ? '19' : '13'} y2="8" strokeOpacity="0.4" />
                  <line x1="5" y1="12" x2={t.id === 'double_garage' ? '19' : '13'} y2="12" strokeOpacity="0.4" />
                  <line x1="5" y1="16" x2={t.id === 'double_garage' ? '19' : '13'} y2="16" strokeOpacity="0.4" />
                </svg>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Size - for both Single and Double */}
        {selection.type && (
          <div>
            <span className="text-sm font-medium text-muted-foreground mb-1.5 block">Size</span>
            <div className="flex gap-2">
              {garageDoorSizes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChange({ ...selection, size: s.id })}
                  className={`flex-1 inline-flex items-center justify-center rounded-xl border px-3 py-2.5 min-h-[44px] text-lg font-semibold transition-all duration-150 ${
                    selection.size === s.id
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PR-#434 — Color + Glass Color ADJACENT (not split-full-row). flex-wrap so mobile wraps when total > viewport */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Color */}
          <div className="w-48">
            <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Color</span>
            <Select
              value={selection.color}
              onValueChange={(v) => onChange({ ...selection, color: v ?? '' })}
            >
              <SelectTrigger className="h-9 text-sm [&>span]:text-center [&>span]:w-full">
                <SelectValue placeholder="Select color" />
              </SelectTrigger>
              <SelectContent>
                {garageDoorColors.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-sm py-2.5 pl-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full shrink-0 border border-gray-300 shadow-inner" style={{ backgroundColor: c.color }} />
                      <span>{c.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Glass Color */}
          <div className="w-48">
            <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Glass Color</span>
            <Select
              value={selection.glass}
              onValueChange={(v) => onChange({ ...selection, glass: v ?? '' })}
            >
              <SelectTrigger className="h-9 text-sm [&>span]:text-center [&>span]:w-full">
                <SelectValue placeholder="Select glass color" />
              </SelectTrigger>
              <SelectContent>
                {garageDoorGlass.map((g) => (
                  <SelectItem key={g.id} value={g.id} className="text-sm py-2.5 pl-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full shrink-0 border border-gray-300 shadow-inner" style={{ backgroundColor: g.color }} />
                      <span>{g.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary + Save */}
      {selection.type && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
              {garageDoorTypes.find(t => t.id === selection.type)?.label}
            </span>
            {selection.size && (
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                {garageDoorSizes.find(s => s.id === selection.size)?.label}
              </span>
            )}
            {selection.color && (
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                {garageDoorColors.find(c => c.id === selection.color)?.label}
              </span>
            )}
            {selection.glass && (
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                {garageDoorGlass.find(g => g.id === selection.glass)?.label} Glass
              </span>
            )}
          </div>
          {/* PR-#433 — always-render Save with disabled-state until Color + Glass Color picked */}
          {onSave && (
            <Button
              className="w-full h-10 rounded-xl text-sm font-semibold"
              onClick={onSave}
              disabled={!isComplete}
            >
              Save Selection
            </Button>
          )}
        </div>
      )}
    </motion.div>
  )
}
