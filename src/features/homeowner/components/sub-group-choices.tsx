import { Check } from 'lucide-react'
import type { OptionGroup } from '@/types'
import { cn } from '@/lib/utils'

interface SubGroupChoicesProps {
  parentOption: { id: string; label: string; subGroups?: OptionGroup[] | null }
  selections: Record<string, string[]>
  onSelect: (subGroup: OptionGroup, choiceId: string) => void
}

export function SubGroupChoices({
  parentOption,
  selections,
  onSelect,
}: SubGroupChoicesProps) {
  const subGroups = parentOption.subGroups ?? []
  if (subGroups.length === 0) return null

  return (
    <div
      className="ml-2 sm:ml-4 mt-2 border-l-2 border-primary/20 pl-3 sm:pl-4 space-y-3"
      data-testid="config-sub-menu-group"
      data-parent-option-id={parentOption.id}
    >
      {subGroups.map((subGroup) => {
        const selected = selections[subGroup.id] ?? []
        const choices =
          subGroup.options.length > 0
            ? subGroup.options.map((o) => ({
                id: o.id,
                label: o.label,
                description: o.description ?? null,
              }))
            : [
                {
                  id: subGroup.id,
                  label: subGroup.label,
                  description: subGroup.description ?? null,
                },
              ]

        return (
          <div
            key={subGroup.id}
            data-testid="config-sub-menu"
            data-sub-menu-id={subGroup.id}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {subGroup.label}
              </span>
              {subGroup.required ? (
                <span className="text-destructive text-xs">*</span>
              ) : (
                <span className="text-[10px] text-muted-foreground font-medium bg-muted rounded-full px-2 py-0.5">
                  Optional
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {choices.map((choice) => {
                const isSelected = selected.includes(choice.id)
                return (
                  <button
                    key={choice.id}
                    type="button"
                    data-testid="config-sub-menu-choice"
                    data-choice-id={choice.id}
                    data-choice-name={choice.label}
                    data-chip-state={isSelected ? 'active' : 'inactive'}
                    onClick={() => onSelect(subGroup, choice.id)}
                    className={cn(
                      'group/choice inline-flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all duration-150',
                      isSelected
                        ? 'border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40',
                      )}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium">{choice.label}</span>
                      {choice.description && (
                        <span
                          data-testid="config-sub-menu-choice-desc"
                          className="text-xs text-muted-foreground"
                        >
                          {choice.description}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
