import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useCatalogStore } from '@/stores/catalog-store'

export type FlatMembraneType = 'tpo' | 'epdm' | 'modified_bitumen'

// PR-#430 — bundled fallback. Same substrate-derive pattern as PR-#428
// door-configurator; fallback stays byte-identical to pre-rewire so the
// rendered list does NOT churn on cold open / RLS deny / unauth.
const FALLBACK_FLAT_MEMBRANE_TYPES: Array<{ id: FlatMembraneType; label: string; description: string }> = [
  { id: 'tpo', label: 'TPO', description: 'Heat-welded thermoplastic, energy-efficient' },
  { id: 'epdm', label: 'EPDM', description: 'Rubber membrane, long-lasting' },
  { id: 'modified_bitumen', label: 'Modified Bitumen', description: 'Asphalt-based, layered system' },
]

const FLAT_MEMBRANE_DESCRIPTION: Record<string, string> = Object.fromEntries(
  FALLBACK_FLAT_MEMBRANE_TYPES.map((m) => [m.id, m.description])
)

export interface FlatRoofSelection {
  membraneType: FlatMembraneType | ''
  roofSize: string
}

interface FlatRoofConfiguratorProps {
  selection: FlatRoofSelection
  onChange: (selection: FlatRoofSelection) => void
  onSave?: () => void
}

export function FlatRoofConfigurator({ selection, onChange, onSave }: FlatRoofConfiguratorProps) {
  const services = useCatalogStore((s) => s.services)

  const flatMembraneTypes = useMemo(() => {
    const svc = services.find((s) => s.id === 'roofing')
    const material = svc?.optionGroups?.find((g) => g.id === 'material')
    const flatRoof = material?.options?.find((o) => o.id === 'flat_roof')
    const typesSub = flatRoof?.subGroups?.find((sg) => sg.id === 'flat_membrane_types')?.options

    if (typesSub && typesSub.length > 0) {
      return typesSub.map((o) => ({
        id: o.id as FlatMembraneType,
        label: o.label,
        description: o.description ?? FLAT_MEMBRANE_DESCRIPTION[o.id] ?? '',
      }))
    }
    return FALLBACK_FLAT_MEMBRANE_TYPES
  }, [services])

  const selected = flatMembraneTypes.find((m) => m.id === selection.membraneType)
  const isComplete = !!selection.membraneType && selection.roofSize.trim().length > 0

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 rounded-xl border bg-background p-4 overflow-hidden"
      data-roofing-flat-configurator="true"
    >
      <h4 className="text-sm font-semibold text-foreground mb-4">Flat Roof Options</h4>

      <div className="flex flex-col gap-5">
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-3 block">Membrane Type</span>
          <div className="grid grid-cols-3 gap-2">
            {flatMembraneTypes.map((m) => {
              const isSelected = selection.membraneType === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChange({ ...selection, membraneType: m.id })}
                  data-chip-id={m.id}
                  data-chip-group="flat_membrane_type"
                  data-chip-state={isSelected ? 'active' : 'inactive'}
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
                    {m.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                    {m.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-muted-foreground mb-0.5 block">Roof Size (Squares)</span>
          <span className="text-[10px] text-muted-foreground/70 mb-1.5 block">1 square = 100 sqft</span>
          <Input
            type="number"
            min="0"
            placeholder="e.g. 8"
            value={selection.roofSize}
            onChange={(e) => onChange({ ...selection, roofSize: e.target.value })}
            className="h-10"
          />
        </div>
      </div>

      {(selection.membraneType || selection.roofSize) && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selected && (
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
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
