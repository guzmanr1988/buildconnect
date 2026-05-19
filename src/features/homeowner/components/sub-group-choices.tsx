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

  const flatChoices = subGroups.flatMap((sg) =>
    sg.options.length > 0
      ? sg.options.map((o) => ({
          id: o.id,
          label: o.label,
          description: o.description ?? null,
          subGroupId: sg.id,
        }))
      : [
          {
            id: sg.id,
            label: sg.label,
            description: sg.description ?? null,
            subGroupId: sg.id,
          },
        ],
  )

  const selectionKey = `${parentOption.id}-sub`
  const selected = selections[selectionKey] ?? []
  const hasPick = selected.length > 0

  return (
    <div
      className="ml-2 sm:ml-4 mt-2 border-l-2 border-primary/20 pl-3 sm:pl-4"
      data-testid="config-sub-menu-group"
      data-parent-option-id={parentOption.id}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {flatChoices.map((choice) => {
          const isSelected = selected.includes(choice.id)
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              data-testid="config-sub-menu-choice"
              data-choice-id={choice.id}
              data-choice-name={choice.label}
              data-sub-menu-id={choice.subGroupId}
              data-chip-state={isSelected ? 'active' : 'inactive'}
              aria-checked={isSelected}
              onClick={() => onSelect(parentOption.id, choice.id)}
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
