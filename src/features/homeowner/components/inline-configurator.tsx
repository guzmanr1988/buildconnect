import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ServiceConfig, OptionGroup } from '@/types'
import { cn } from '@/lib/utils'
import { applyRoofingMaterialPitchedSingleton } from '@/lib/roofing-rules'
import { SubGroupChoices } from './sub-group-choices'

interface InlineConfiguratorProps {
  service: ServiceConfig
}

function resolveSubChoiceLabel(
  option: { subGroups?: OptionGroup[] | null },
  choiceId: string,
): string | null {
  for (const sg of option.subGroups ?? []) {
    if (sg.options.length > 0) {
      const found = sg.options.find((o) => o.id === choiceId)
      if (found) return found.label
    } else if (sg.id === choiceId) {
      return sg.label
    }
  }
  return null
}

export function InlineConfigurator({ service }: InlineConfiguratorProps) {
  const navigate = useNavigate()
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [subGroupExpanded, setSubGroupExpanded] = useState<Record<string, boolean>>({})
  const [subGroupLinearFt, setSubGroupLinearFt] = useState<Record<string, string>>({})

  const requiredGroups = service.optionGroups.filter((g) => g.required)
  const completedRequired = requiredGroups.filter(
    (g) => (selections[g.id]?.length ?? 0) > 0
  ).length
  const subPicksDone = service.optionGroups.every((g) =>
    (selections[g.id] ?? []).every((optId) => {
      const opt = g.options.find((o) => o.id === optId)
      if (!opt?.subGroups?.length) return true
      return (selections[`${optId}-sub`]?.length ?? 0) > 0
    }),
  )
  const allRequiredDone =
    completedRequired === requiredGroups.length && subPicksDone

  function handleSelect(group: OptionGroup, optionId: string) {
    setSelections((prev) => {
      const current = prev[group.id] ?? []
      if (group.type === 'single') {
        return { ...prev, [group.id]: [optionId] }
      }
      if (service.id === 'roofing' && group.id === 'material') {
        return { ...prev, [group.id]: applyRoofingMaterialPitchedSingleton(current, optionId) }
      }
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) }
      }
      return { ...prev, [group.id]: [...current, optionId] }
    })
  }

  function handleParentChipClick(group: OptionGroup, option: { id: string; subGroups?: OptionGroup[] | null }) {
    const isSelected = (selections[group.id] ?? []).includes(option.id)
    const hasSubGroups = (option.subGroups?.length ?? 0) > 0

    if (hasSubGroups && isSelected) {
      setSubGroupExpanded((prev) => ({ ...prev, [option.id]: !(prev[option.id] ?? true) }))
      return
    }

    handleSelect(group, option.id)
    if (hasSubGroups) {
      setSubGroupExpanded((prev) => ({ ...prev, [option.id]: true }))
    }
  }

  function handleSubChoiceSelect(parentOptionId: string, choiceId: string) {
    setSelections((prev) => ({ ...prev, [`${parentOptionId}-sub`]: [choiceId] }))
  }

  function handleSubLinearFeetChange(parentOptionId: string, value: string) {
    setSubGroupLinearFt((prev) => ({ ...prev, [parentOptionId]: value }))
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden"
    >
      <div className="mt-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        {/* Progress */}
        {requiredGroups.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{
                  width: `${requiredGroups.length > 0 ? (completedRequired / requiredGroups.length) * 100 : 0}%`,
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {completedRequired} of {requiredGroups.length} required
            </span>
          </div>
        )}

        {/* Option groups */}
        <div className="flex flex-col gap-5">
          {service.optionGroups.map((group) => {
            const selected = selections[group.id] ?? []
            return (
              <div key={group.id}>
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    {group.label}
                  </span>
                  {group.required ? (
                    <span className="text-destructive text-xs">*</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground font-medium bg-muted rounded-full px-2 py-0.5">
                      Optional
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const isSelected = selected.includes(option.id)
                    const hasSubGroups = (option.subGroups?.length ?? 0) > 0
                    const subPickId = selections[`${option.id}-sub`]?.[0]
                    const subPickLabel = subPickId ? resolveSubChoiceLabel(option, subPickId) : null
                    return (
                      <button
                        key={option.id}
                        type="button"
                        data-chip-id={option.id}
                        data-chip-group={group.id}
                        data-chip-state={isSelected ? 'active' : 'inactive'}
                        data-sub-expanded={hasSubGroups ? String(subGroupExpanded[option.id] ?? true) : undefined}
                        aria-expanded={hasSubGroups ? (subGroupExpanded[option.id] ?? true) : undefined}
                        onClick={() => handleParentChipClick(group, option)}
                        className={cn(
                          'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all duration-150',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted'
                        )}
                      >
                        {group.type === 'multi' && isSelected && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {option.label}
                        {subPickLabel && (
                          <span
                            data-testid="config-parent-sub-pick-badge"
                            data-parent-option-id={option.id}
                            className="ml-1 inline-flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold"
                          >
                            {subPickLabel}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {group.options
                  .filter(
                    (option) =>
                      selected.includes(option.id) &&
                      (option.subGroups?.length ?? 0) > 0 &&
                      (subGroupExpanded[option.id] ?? true),
                  )
                  .map((option) => (
                    <SubGroupChoices
                      key={`${group.id}-${option.id}-subgroups`}
                      parentOption={option}
                      selections={selections}
                      onSelect={handleSubChoiceSelect}
                      linearFeet={subGroupLinearFt[option.id] ?? ''}
                      onLinearFeetChange={handleSubLinearFeetChange}
                    />
                  ))}
              </div>
            )
          })}
        </div>

        {/* Select Vendor button */}
        <div className="mt-5 pt-4 border-t border-border/50">
          <Button
            size="lg"
            className={cn(
              'w-full h-11 text-sm font-medium gap-2',
              allRequiredDone && 'ring-2 ring-primary/50 animate-pulse'
            )}
            disabled={!allRequiredDone}
            onClick={() => navigate('/home/vendor-compare')}
          >
            Select a Vendor
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
