import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PoolFloorSqftConfiguratorProps {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  onSave: () => void
}

// Arc-19 — Pool Floor sqft popup+chip per Rod photo 324, mirrors the
// Roofing Class A addon-linear-ft chip-tap → Save → collapse → chip-badge
// flow. Kept as a separate component (not a generalization of
// AddonLinearFtConfigurator) to preserve zero-regression-risk on the
// Roofing surface shipped via Arc-7.
export function PoolFloorSqftConfigurator({
  id,
  label,
  value,
  onChange,
  onSave,
}: PoolFloorSqftConfiguratorProps) {
  const numericValue = Number(value) || 0
  const isComplete = value.trim().length > 0 && numericValue > 0

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-3 rounded-xl border bg-background p-4 overflow-hidden"
      data-pool-floor-configurator={id}
    >
      <h4 className="text-sm font-semibold text-foreground mb-3">{label}</h4>

      <div className="flex items-center gap-3">
        <Label className="text-sm w-36 shrink-0">Square footage</Label>
        <Input
          type="number"
          inputMode="numeric"
          className="max-w-[160px]"
          placeholder="sqft"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid="pool-floor-sqft-input"
        />
      </div>

      {isComplete && (
        <div className="mt-4 pt-4 border-t">
          <Button
            className="w-full h-10 rounded-xl text-sm font-semibold"
            onClick={onSave}
            data-pool-floor-save={id}
          >
            Save Selection
          </Button>
        </div>
      )}
    </motion.div>
  )
}
