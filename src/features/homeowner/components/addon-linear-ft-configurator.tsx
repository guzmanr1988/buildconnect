import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { GUTTER_DROP_FT_BY_FLOORS, computeGutterTotalLinFt } from '@/lib/roof-pricing'

interface AddonLinearFtConfiguratorProps {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  onSave: () => void
  gutterExtras?: {
    floors: 1 | 2 | null
    drops: number
    onFloorsChange: (n: 1 | 2) => void
    onDropsChange: (n: number) => void
  }
  // PR-#404 — consolidate variant pills inside this card (Rod live-feedback
  // on PR-#403 Soffit/Fascia: one box, not pills-row + card). When provided,
  // renders the variant chips inline beside the Linear feet input and Save
  // becomes available once both a variant is picked AND the lin-ft value is
  // non-zero.
  inlineVariantSelector?: {
    variants: { id: string; label: string }[]
    selectedId: string | undefined
    onSelect: (id: string) => void
  }
}

export function AddonLinearFtConfigurator({
  id,
  label,
  value,
  onChange,
  onSave,
  gutterExtras,
  inlineVariantSelector,
}: AddonLinearFtConfiguratorProps) {
  const isGutter = id === 'gutters'
  const numericValue = Number(value) || 0
  const inputComplete = value.trim().length > 0 && numericValue > 0
  const gutterComplete = !isGutter || (gutterExtras && gutterExtras.floors !== null)
  const variantComplete = !inlineVariantSelector || Boolean(inlineVariantSelector.selectedId)
  const isComplete = inputComplete && gutterComplete && variantComplete

  const gutterTotal =
    isGutter && gutterExtras && gutterExtras.floors
      ? computeGutterTotalLinFt(numericValue, {
          floors: gutterExtras.floors,
          drops: gutterExtras.drops,
        })
      : 0
  const perFloor =
    isGutter && gutterExtras && gutterExtras.floors
      ? GUTTER_DROP_FT_BY_FLOORS[gutterExtras.floors]
      : 0
  const floorsLabel = gutterExtras?.floors === 1 ? '1-story' : '2-story'

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-3 rounded-xl border bg-background p-4 overflow-hidden"
      data-addon-configurator={id}
    >
      <h4 className="text-sm font-semibold text-foreground mb-3">{label}</h4>

      <div className="space-y-3">
        {isGutter && gutterExtras && (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-medium">How many floors does the home have?</Label>
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as const).map((n) => {
                  const isSelected = gutterExtras.floors === n
                  return (
                    <button
                      key={n}
                      type="button"
                      data-chip-id={String(n)}
                      data-chip-group="gutter_floors"
                      data-chip-state={isSelected ? 'active' : 'inactive'}
                      onClick={() => gutterExtras.onFloorsChange(n)}
                      className={cn(
                        'rounded-xl border p-3 text-center transition-all duration-150',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-primary font-semibold'
                          : 'border-border hover:border-primary/40 hover:bg-muted text-foreground',
                      )}
                    >
                      <span className="text-sm">{n === 1 ? 'One story' : 'Two stories'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">How many downspouts (drops)?</Label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const isSelected = gutterExtras.drops === n
                  return (
                    <button
                      key={n}
                      type="button"
                      data-chip-id={String(n)}
                      data-chip-group="gutter_drops"
                      data-chip-state={isSelected ? 'active' : 'inactive'}
                      onClick={() => gutterExtras.onDropsChange(n)}
                      className={cn(
                        'rounded-xl border p-3 text-center transition-all duration-150',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-primary font-semibold'
                          : 'border-border hover:border-primary/40 hover:bg-muted text-foreground',
                      )}
                    >
                      <span className="text-sm">{n}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">Most homes have 2 or 3 drops.</p>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-sm w-36 shrink-0">
            {isGutter ? 'Gutter linear feet' : 'Linear feet'}
          </Label>
          <Input
            type="number"
            inputMode="numeric"
            className="max-w-[160px]"
            placeholder="linear feet"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {inlineVariantSelector && inlineVariantSelector.variants.length > 0 && (
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              data-testid="config-sub-menu-group"
              data-inline-variant-selector={id}
            >
              {inlineVariantSelector.variants.map((variant) => {
                const isSelected = inlineVariantSelector.selectedId === variant.id
                return (
                  <button
                    key={variant.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    data-testid="config-sub-menu-choice"
                    data-choice-id={variant.id}
                    data-choice-name={variant.label}
                    data-chip-state={isSelected ? 'active' : 'inactive'}
                    onClick={() => inlineVariantSelector.onSelect(variant.id)}
                    className={cn(
                      'inline-flex items-center rounded-lg border px-3 py-1.5 text-sm transition-all duration-150',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm ring-1 ring-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
                    )}
                  >
                    {variant.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {isGutter && gutterExtras && gutterExtras.floors && numericValue > 0 && (
          <div
            className="rounded-xl border bg-muted/40 p-3 space-y-1"
            data-roofing-gutter-breakdown="true"
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Total gutter lin ft
            </p>
            <p className="text-sm font-semibold text-foreground">
              {gutterTotal.toLocaleString()} lin ft
            </p>
            <p className="text-[11px] text-muted-foreground">
              {numericValue.toLocaleString()} perimeter + {gutterExtras.drops} drop
              {gutterExtras.drops === 1 ? '' : 's'} × {perFloor} ft for {floorsLabel}
            </p>
          </div>
        )}
      </div>

      {isComplete && (
        <div className="mt-4 pt-4 border-t">
          <Button
            className="w-full h-10 rounded-xl text-sm font-semibold"
            onClick={onSave}
            data-addon-save={id}
          >
            Save Selection
          </Button>
        </div>
      )}
    </motion.div>
  )
}
