import { Input } from '@/components/ui/input'
import type { OptionGroup } from '@/types'
import { cn } from '@/lib/utils'

interface SubGroupChoicesProps {
  parentOption: { id: string; label: string; subGroups?: OptionGroup[] | null }
  selections: Record<string, string[]>
  onSelect: (parentOptionId: string, subGroupId: string, choiceId: string) => void
  linearFeet: string
  onLinearFeetChange: (parentOptionId: string, value: string) => void
}

function buildChoices(sg: OptionGroup) {
  if (sg.options.length > 0) {
    return sg.options.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description ?? null,
    }))
  }
  return [{ id: sg.id, label: sg.label, description: sg.description ?? null }]
}

export function SubGroupChoices({
  parentOption,
  selections,
  onSelect,
  linearFeet,
  onLinearFeetChange,
}: SubGroupChoicesProps) {
  const subGroups = parentOption.subGroups ?? []
  if (subGroups.length === 0) return null

  // Single sub_group (Kitchen Cabinet pattern): preserve PR-290 flat-chip render
  // + inline Linear feet input once a pick lands. Multi sub_group (Windows /
  // Doors / Storm Front / Garage Doors pattern): restore pre-PR-290 per-section
  // labeled chip rows, one independent pick per section, no Linear feet input.
  const isMultiSubGroup = subGroups.length > 1
  const hasPickForLinearFt =
    !isMultiSubGroup &&
    (selections[`${parentOption.id}-sub-${subGroups[0].id}`]?.length ?? 0) > 0

  return (
    <div
      className="ml-2 sm:ml-4 mt-2 border-l-2 border-primary/20 pl-3 sm:pl-4"
      data-testid="config-sub-menu-group"
      data-parent-option-id={parentOption.id}
      data-sub-group-count={subGroups.length}
    >
      {subGroups.map((sg) => {
        const choices = buildChoices(sg)
        const selectionKey = `${parentOption.id}-sub-${sg.id}`
        const selected = selections[selectionKey] ?? []
        return (
          <div
            key={sg.id}
            className={isMultiSubGroup ? 'mb-3 last:mb-0' : ''}
            data-testid="config-sub-menu-section"
            data-sub-menu-id={sg.id}
          >
            {isMultiSubGroup && (
              <div
                className="mb-1.5 text-xs font-medium text-foreground"
                data-testid="config-sub-menu-section-label"
                data-sub-menu-id={sg.id}
              >
                {sg.label}
              </div>
            )}
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {choices.map((choice) => {
                const isSelected = selected.includes(choice.id)
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    data-testid="config-sub-menu-choice"
                    data-choice-id={choice.id}
                    data-choice-name={choice.label}
                    data-sub-menu-id={sg.id}
                    data-chip-state={isSelected ? 'active' : 'inactive'}
                    aria-checked={isSelected}
                    onClick={() => onSelect(parentOption.id, sg.id, choice.id)}
                    className={cn(
                      'inline-flex max-w-[220px] flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-all duration-150',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm ring-1 ring-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
                    )}
                  >
                    <span className="font-medium">{choice.label}</span>
                    {choice.description && (
                      <span
                        data-testid="config-sub-menu-choice-desc"
                        className={cn(
                          'text-xs',
                          isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground',
                        )}
                      >
                        {choice.description}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {hasPickForLinearFt && (
        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor={`sub-linear-feet-${parentOption.id}`}
            className="text-sm font-medium text-foreground"
          >
            Linear feet
          </label>
          <Input
            id={`sub-linear-feet-${parentOption.id}`}
            data-testid="config-sub-linear-feet-input"
            data-parent-option-id={parentOption.id}
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="0"
            value={linearFeet}
            onChange={(e) => onLinearFeetChange(parentOption.id, e.target.value)}
            className="h-9 w-24"
          />
        </div>
      )}
    </div>
  )
}
