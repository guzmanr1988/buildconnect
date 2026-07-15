import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Roofing-material summary-row parity wrapper (Rod voice 2026-07-15 dispatch
// kratos msg 1784139233599). Metal shipped this pattern in v2-collapse
// (service-detail.tsx pre-parity); Rod flagged the other 4 materials render
// their configurator inline+open with no equivalent required-gate row. This
// component is the single source of truth for the row so all 5 render
// byte-identical DOM shape; per-material variation happens via props only:
//   metal    → placeholder "Choose a color",   gated on selection.color
//   shingle  → placeholder "Choose a color",   gated on selection.color
//   aluminum → placeholder "Choose a color",   gated on selection.color
//   tile     → placeholder "Choose your tile", gated on selection.tileType && selection.tileColor
//   flat     → placeholder "Choose a membrane", gated on selection.membraneType
export interface MaterialConfigCollapseRowProps {
  // Prefix for data-testid + aria ids. Pick one per material and keep
  // stable — apollo walker selectors key off these.
  testIdPrefix: string
  // Text shown in the row when nothing is picked yet.
  placeholder: string
  // Human-readable label to show when the picker is satisfied; null when
  // no valid selection yet (row falls back to placeholder + required *).
  filledLabel: string | null
  // Hex color for the round bullet next to the label. Optional — pass a
  // truthy value only when a valid selection carries a hex swatch (metal
  // color, aluminum color, shingle color, tile color). Flat membrane has
  // no meaningful swatch; leave undefined for the neutral bullet.
  swatchHex?: string
  // True when the material's required field(s) are missing — drives the
  // destructive border + red asterisk + required-caption.
  isRequired: boolean
  // Caption below the row when isRequired (e.g. "Color required to
  // continue.", "Membrane required to continue.").
  requiredCaption: string
  // Stable id (or 'none') exposed via data-color-selected for probe tooling.
  selectedIdForTest: string | null
  expanded: boolean
  onToggle: () => void
  // Configurator body — rendered inside AnimatePresence when expanded.
  children: ReactNode
}

export function MaterialConfigCollapseRow({
  testIdPrefix,
  placeholder,
  filledLabel,
  swatchHex,
  isRequired,
  requiredCaption,
  selectedIdForTest,
  expanded,
  onToggle,
  children,
}: MaterialConfigCollapseRowProps) {
  const showFilled = !!filledLabel && !isRequired
  const bodyId = `${testIdPrefix}-config-body`
  return (
    <div className="mt-4 flex flex-col gap-2" data-testid={`${testIdPrefix}-collapse`}>
      <button
        type="button"
        onClick={onToggle}
        data-testid={`${testIdPrefix}-summary-row`}
        data-color-collapse-state={expanded ? 'expanded' : 'collapsed'}
        data-color-selected={selectedIdForTest || 'none'}
        data-color-required={isRequired ? 'true' : 'false'}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className={cn(
          'w-full rounded-xl border bg-background px-3 py-2.5 flex items-center justify-between cursor-pointer text-left',
          isRequired ? 'border-destructive/40' : 'border-muted'
        )}
      >
        <span className="flex items-center min-w-0">
          <span
            className={cn(
              'h-4 w-4 rounded-full shrink-0 border',
              swatchHex ? 'border-primary/30' : 'border-muted-foreground/20 bg-muted'
            )}
            style={swatchHex ? { backgroundColor: swatchHex } : undefined}
            aria-hidden="true"
          />
          <span className={cn(
            'ml-2 text-sm truncate',
            showFilled ? 'font-medium text-foreground' : 'text-muted-foreground'
          )}>
            {showFilled ? filledLabel : placeholder}
          </span>
          {isRequired && (
            <span className="ml-1 text-destructive text-xs shrink-0" aria-hidden="true">*</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
            expanded && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>
      {isRequired && (
        <p className="text-xs text-destructive mt-1.5" data-testid={`${testIdPrefix}-required-caption`}>
          {requiredCaption}
        </p>
      )}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key={bodyId}
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
