import { Input } from '@/components/ui/input'
import type { OptionGroup } from '@/types'
import { cn } from '@/lib/utils'

interface SubGroupChoicesProps {
  parentOption: { id: string; label: string; subGroups?: OptionGroup[] | null }
  selections: Record<string, string[]>
  onSelect: (parentOptionId: string, choiceId: string) => void
  linearFeet: string
  onLinearFeetChange: (parentOptionId: string, value: string) => void
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

  // Data-driven shape discriminator. Every sub_group with zero items renders
  // multi-section labeled mode (Cabinet pattern — N labeled sections, the
  // sub_group itself acts as both section label and the single chip choice).
  // When at least one sub_group has items, render flat-chip mode (Stone
  // pattern — sub_groups[0].options are the chip choices under a single
  // implicit section).
  const isMultiSectionMode = subGroups.every((sg) => sg.options.length === 0)

  // Radio-across semantics: ONE selected choiceId per parent option, stored
  // under key `${parentOption.id}-sub`. Tapping a chip in any section switches
  // the pick. Tapping the same chip again toggles it off (handler-side).
  const selectionKey = `${parentOption.id}-sub`
  const selectedChoiceId = selections[selectionKey]?.[0]
  const hasPick = Boolean(selectedChoiceId)

  const chipClass = (isSelected: boolean) =>
    cn(
      'inline-flex max-w-[220px] flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-all duration-150',
      isSelected
        ? 'border-primary bg-primary text-primary-foreground shadow-sm ring-1 ring-primary'
        : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
    )

  const descClass = (isSelected: boolean) =>
    cn('text-xs', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')

  return (
    <div
      className="ml-2 sm:ml-4 mt-2 border-l-2 border-primary/20 pl-3 sm:pl-4"
      data-testid="config-sub-menu-group"
      data-parent-option-id={parentOption.id}
      data-sub-group-count={subGroups.length}
      data-multi-section-mode={String(isMultiSectionMode)}
      role="radiogroup"
    >
      {isMultiSectionMode
        ? subGroups.map((sg) => {
            const isSelected = selectedChoiceId === sg.id
            return (
              <div
                key={sg.id}
                className="mb-3 last:mb-0"
                data-testid="config-sub-menu-section"
                data-sub-menu-id={sg.id}
              >
                <div
                  className="mb-1.5 text-xs font-medium text-foreground"
                  data-testid="config-sub-menu-section-label"
                  data-sub-menu-id={sg.id}
                >
                  {sg.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    role="radio"
                    data-testid="config-sub-menu-choice"
                    data-choice-id={sg.id}
                    data-choice-name={sg.label}
                    data-sub-menu-id={sg.id}
                    data-chip-state={isSelected ? 'active' : 'inactive'}
                    aria-checked={isSelected}
                    onClick={() => onSelect(parentOption.id, sg.id)}
                    className={chipClass(isSelected)}
                  >
                    <span className="font-medium">{sg.label}</span>
                    {sg.description && (
                      <span
                        data-testid="config-sub-menu-choice-desc"
                        className={descClass(isSelected)}
                      >
                        {sg.description}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )
          })
        : (() => {
            const sg = subGroups[0]
            return (
              <div data-testid="config-sub-menu-section" data-sub-menu-id={sg.id}>
                <div className="flex flex-wrap gap-2">
                  {sg.options.map((choice) => {
                    const isSelected = selectedChoiceId === choice.id
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
                        onClick={() => onSelect(parentOption.id, choice.id)}
                        className={chipClass(isSelected)}
                      >
                        <span className="font-medium">{choice.label}</span>
                        {choice.description && (
                          <span
                            data-testid="config-sub-menu-choice-desc"
                            className={descClass(isSelected)}
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
          })()}

      {hasPick && (
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
