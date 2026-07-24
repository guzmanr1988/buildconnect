import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface DropdownOption {
  value: number
  label: string
}

interface AddonSubQuestionConfiguratorProps {
  id: string
  label: string
  questionLabel: string
  type: 'dropdown' | 'number'
  dropdownOptions?: DropdownOption[]
  value: number | null
  onChange: (n: number | null) => void
  onSave: () => void
  requiredCaption: string
  numberPlaceholder?: string
}

export function AddonSubQuestionConfigurator({
  id,
  label,
  questionLabel,
  type,
  dropdownOptions,
  value,
  onChange,
  onSave,
  requiredCaption,
  numberPlaceholder = 'e.g. 20',
}: AddonSubQuestionConfiguratorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  // Overflow is hidden during entry/exit animation (so height:0 clips content)
  // but switched to visible after entry completes so the absolute dropdown
  // list can escape the container without being clipped. Rod feedback: the
  // dropdown was rendering as a cramped overlapping scroll box because
  // overflow:hidden on the wrapper clipped the absolute-positioned list.
  const [overflowHidden, setOverflowHidden] = useState(true)
  const isComplete = value !== null && value > 0
  const selectedOption = type === 'dropdown' ? (dropdownOptions?.find((o) => o.value === value) ?? null) : null

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      onAnimationStart={() => setOverflowHidden(true)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onAnimationComplete={(def: any) => {
        if (def?.opacity === 1) setOverflowHidden(false)
      }}
      className={cn('mt-3 rounded-xl border bg-background p-4', overflowHidden && 'overflow-hidden')}
      data-addon-configurator={id}
      data-addon-sub-question-required={value === null ? 'true' : 'false'}
      data-addon-sub-question-selected={value !== null ? String(value) : 'null'}
    >
      <h4 className="text-sm font-semibold text-foreground mb-3">{label}</h4>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">{questionLabel}</label>

          {type === 'dropdown' && dropdownOptions && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                onBlur={() => setDropdownOpen(false)}
                className={cn(
                  'w-full flex items-center justify-between h-10 px-3 rounded-lg border bg-background text-left transition-colors',
                  dropdownOpen ? 'border-primary ring-1 ring-primary/30' : 'border-input hover:border-primary/40',
                )}
                data-testid={`${id}-dropdown`}
              >
                <span className={cn('text-sm', selectedOption ? 'text-foreground' : 'text-muted-foreground/60')}>
                  {selectedOption ? selectedOption.label : 'Select...'}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground/50 transition-transform duration-150',
                    dropdownOpen && 'rotate-180',
                  )}
                />
              </button>
              {dropdownOpen && (
                <div className="absolute z-50 top-full left-0 mt-1 w-full bg-popover border border-border rounded-lg shadow-md overflow-auto max-h-72 py-1">
                  {dropdownOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(opt.value)
                        setDropdownOpen(false)
                      }}
                      className={cn(
                        'w-full flex items-center px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-left',
                        value === opt.value && 'bg-primary/10 text-primary font-medium',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {type === 'number' && (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder={numberPlaceholder}
              value={value ?? ''}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === '') { onChange(null); return }
                const n = parseInt(raw, 10)
                if (!isNaN(n) && n > 0) onChange(n)
              }}
              className="max-w-[200px]"
              data-testid={`${id}-number-input`}
            />
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t space-y-2">
        <Button
          className="w-full h-10 rounded-xl text-sm font-semibold"
          onClick={onSave}
          disabled={!isComplete}
          aria-disabled={!isComplete}
          data-addon-save={id}
          data-addon-save-blocked={!isComplete ? 'true' : 'false'}
        >
          Save Selection
        </Button>
        {!isComplete && (
          <p
            className="text-[11px] text-destructive text-center"
            data-addon-save-cue={id}
            data-testid={`${id}-required-caption`}
          >
            {requiredCaption}
          </p>
        )}
      </div>
    </motion.div>
  )
}
