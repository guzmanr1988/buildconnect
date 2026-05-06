import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CardSlideWizard } from './card-slide-wizard'
import { useCartStore, type CartItemAddress } from '@/stores/cart-store'
import { cn } from '@/lib/utils'
import type { ServiceConfig } from '@/types'

type Selections = Record<string, string[]>

// One entry per content step (address + review are added automatically).
export interface GenericWizardStep {
  groupId: string
  title: string
  subtitle?: string
  // When provided the step renders a Skip button.
  skipLabel?: string
}

interface GenericServiceWizardProps {
  service: ServiceConfig
  steps: GenericWizardStep[]
  // Optional skip predicates — return the target step number to jump to.
  getNextStep?: (step: number, sel: Selections) => number
  getPrevStep?: (step: number, sel: Selections) => number
  addressOptions: Array<{ key: string; label: string; full: string }>
  defaultAddressKey: string
  editItem?: Record<string, unknown> | null
  editingItemId?: string | null
  onCancel: () => void
  onDone: () => void
  initialAreaSqft?: number
  initialPerimeterFt?: number
}

// Chip button used on every content step.
function OptionChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full sm:w-auto inline-flex min-h-[44px] sm:min-h-[40px] items-center gap-2 rounded-xl border px-4 py-2 text-base font-medium transition-all duration-150',
        selected
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
      )}
    >
      {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}

export function GenericServiceWizard({
  service,
  steps,
  getNextStep: getNextStepProp,
  getPrevStep: getPrevStepProp,
  addressOptions,
  defaultAddressKey,
  editItem,
  editingItemId: initEditId,
  onCancel,
  onDone,
  initialAreaSqft,
  initialPerimeterFt,
}: GenericServiceWizardProps) {
  const addItem = useCartStore((s) => s.addItem)
  const removeItem = useCartStore((s) => s.removeItem)

  const CONTENT_STEPS = steps.length
  const ADDR_STEP = CONTENT_STEPS + 1
  const REVIEW_STEP = CONTENT_STEPS + 2
  const TOTAL_STEPS = REVIEW_STEP

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [selections, setSelections] = useState<Selections>(
    (editItem?.selections as Selections) ?? {},
  )
  const [addressKey, setAddressKey] = useState(defaultAddressKey)
  const [editingItemId, setEditingItemId] = useState<string | null>(initEditId ?? null)
  const [added, setAdded] = useState(false)

  const selectedAddress = addressOptions.find((o) => o.key === addressKey) ?? addressOptions[0]

  function defaultGetNext(s: number, _sel: Selections) { return s + 1 }
  function defaultGetPrev(s: number, _sel: Selections) { return s - 1 }
  const resolveNext = getNextStepProp ?? defaultGetNext
  const resolvePrev = getPrevStepProp ?? defaultGetPrev

  function goNext() {
    const next = step >= CONTENT_STEPS ? step + 1 : resolveNext(step, selections)
    setDirection(1)
    setStep(Math.min(next, TOTAL_STEPS))
  }

  function goBack() {
    if (step === 1) { onCancel(); return }
    const prev = step > ADDR_STEP ? step - 1 : resolvePrev(step, selections)
    setDirection(-1)
    setStep(Math.max(prev, 1))
  }

  function toggleOption(groupId: string, optionId: string, type: 'single' | 'multi') {
    setSelections((prev) => {
      const current = prev[groupId] ?? []
      if (type === 'single') return { ...prev, [groupId]: [optionId] }
      if (current.includes(optionId)) return { ...prev, [groupId]: current.filter((id) => id !== optionId) }
      return { ...prev, [groupId]: [...current, optionId] }
    })
  }

  // Content step (1-indexed, maps to steps[step-1])
  function isStepRequired(s: number): boolean {
    const cfg = steps[s - 1]
    if (!cfg) return false
    const group = service.optionGroups.find((g) => g.id === cfg.groupId)
    return group?.required ?? false
  }

  function isStepDone(s: number): boolean {
    const cfg = steps[s - 1]
    if (!cfg) return true
    return (selections[cfg.groupId]?.length ?? 0) > 0
  }

  // Next disabled: required step with no selection
  const nextDisabled =
    step <= CONTENT_STEPS && isStepRequired(step) && !isStepDone(step)

  async function handleSubmit() {
    const itemAddress: CartItemAddress | undefined = selectedAddress?.full
      ? { label: selectedAddress.label, full: selectedAddress.full }
      : undefined

    const itemData = {
      serviceId: service.id,
      serviceName: service.name,
      selections,
      ...(itemAddress && { address: itemAddress }),
      ...(initialAreaSqft != null && { areaSqft: initialAreaSqft }),
      ...(initialPerimeterFt != null && { perimeterFt: initialPerimeterFt }),
    }

    if (editingItemId) {
      removeItem(editingItemId)
      addItem(itemData)
      setEditingItemId(null)
      toast.success(`${service.name} updated`)
    } else {
      addItem(itemData)
      toast.success(`${service.name} added to your project`)
    }

    setAdded(true)
    setTimeout(() => {
      setAdded(false)
      onDone()
    }, 900)
  }

  // ── Step content ──────────────────────────────────────────────────────────

  function renderContentStep(s: number) {
    const cfg = steps[s - 1]
    const group = service.optionGroups.find((g) => g.id === cfg.groupId)
    if (!group) return null
    const selected = selections[group.id] ?? []
    return (
      <div className="flex flex-wrap gap-2">
        {group.options.map((opt) => (
          <OptionChip
            key={opt.id}
            label={opt.label}
            selected={selected.includes(opt.id)}
            onClick={() => toggleOption(group.id, opt.id, group.type)}
          />
        ))}
      </div>
    )
  }

  function renderAddressStep() {
    return (
      <div className="flex flex-col gap-3">
        <Select value={addressKey} onValueChange={(v) => setAddressKey(v ?? '')}>
          <SelectTrigger className="h-11 text-sm">
            <SelectValue placeholder="Select a property" />
          </SelectTrigger>
          <SelectContent>
            {addressOptions.map((opt) => (
              <SelectItem key={opt.key} value={opt.key}>
                <span className="font-medium">{opt.label}</span>
                {opt.full && (
                  <span className="ml-2 text-xs text-muted-foreground">{opt.full}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {addressOptions.length === 1 && (
          <p className="text-[11px] text-muted-foreground">
            Add more properties from your profile to target a different address.
          </p>
        )}
      </div>
    )
  }

  function renderReviewStep() {
    const filled = steps.filter((s) => (selections[s.groupId]?.length ?? 0) > 0)
    return (
      <div className="space-y-3" data-generic-wizard-review="true">
        {initialAreaSqft != null && (
          <div className="rounded-xl bg-muted/50 p-3" data-measured-sqft={initialAreaSqft}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Measured Area
            </p>
            <p className="text-sm text-foreground">{initialAreaSqft.toLocaleString()} sqft</p>
          </div>
        )}
        {initialPerimeterFt != null && (
          <div className="rounded-xl bg-muted/50 p-3" data-measured-perimeter={initialPerimeterFt}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Measured Length
            </p>
            <p className="text-sm text-foreground">{initialPerimeterFt.toLocaleString()} linear ft</p>
          </div>
        )}
        {filled.map((s) => {
          const group = service.optionGroups.find((g) => g.id === s.groupId)
          if (!group) return null
          const sel = selections[s.groupId] ?? []
          return (
            <div key={s.groupId} className="rounded-xl bg-muted/50 p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sel.map((optId) => {
                  const opt = group.options.find((o) => o.id === optId)
                  return (
                    <span
                      key={optId}
                      className="inline-flex items-center rounded-lg bg-primary/10 text-primary px-3 py-1 text-sm font-medium"
                    >
                      {opt?.label ?? optId}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
        {selectedAddress?.full && (
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Property
            </p>
            <p className="text-sm text-foreground">{selectedAddress.full}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Derive title/subtitle/skip for each step ──────────────────────────────

  function stepTitle(): string {
    if (step <= CONTENT_STEPS) return steps[step - 1].title
    if (step === ADDR_STEP) return 'Which property is this for?'
    return 'Review your project'
  }

  function stepSubtitle(): string | undefined {
    if (step <= CONTENT_STEPS) return steps[step - 1].subtitle
    if (step === ADDR_STEP) return 'Choose the address for this project.'
    return 'Looks good? Add it to your project.'
  }

  function stepSkipLabel(): string | undefined {
    if (step <= CONTENT_STEPS) return steps[step - 1].skipLabel
    return undefined
  }

  function stepNextLabel(): string {
    if (step === REVIEW_STEP) return editingItemId ? 'Save Changes' : 'Add to Project'
    return 'Continue'
  }

  function handleSkip() {
    const next = resolveNext(step, selections)
    setDirection(1)
    setStep(next)
  }

  function handleNext() {
    if (step === REVIEW_STEP) { handleSubmit(); return }
    goNext()
  }

  return (
    <div
      data-generic-service-wizard={service.id}
      {...(initialAreaSqft != null && { 'data-initial-sqft': initialAreaSqft })}
      {...(initialPerimeterFt != null && { 'data-initial-perimeter': initialPerimeterFt })}
    >
      <CardSlideWizard
        step={step}
        totalSteps={TOTAL_STEPS}
        title={stepTitle()}
        subtitle={stepSubtitle()}
        direction={direction}
        onBack={goBack}
        onNext={handleNext}
        onSkip={stepSkipLabel() ? handleSkip : undefined}
        skipLabel={stepSkipLabel()}
        nextDisabled={nextDisabled || added}
        nextLabel={added ? (editingItemId ? 'Updated' : 'Added') : stepNextLabel()}
      >
        {step <= CONTENT_STEPS && renderContentStep(step)}
        {step === ADDR_STEP && renderAddressStep()}
        {step === REVIEW_STEP && renderReviewStep()}
      </CardSlideWizard>
    </div>
  )
}

// ── Per-service step configs (pre-built, import directly) ─────────────────

export const FENCING_STEPS: GenericWizardStep[] = [
  { groupId: 'material', title: 'Fence material', subtitle: 'What material would you like for your fence?' },
  { groupId: 'height', title: 'Fence height', subtitle: 'How tall should the fence be?' },
  { groupId: 'addons', title: 'Any add-ons?', subtitle: 'Optional extras for your fence.', skipLabel: 'Skip' },
]

export const DRIVEWAYS_STEPS: GenericWizardStep[] = [
  { groupId: 'scope', title: 'What type of work?', subtitle: 'Tell us the scope of your driveway project.' },
  { groupId: 'surface', title: 'Surface material', subtitle: 'What material would you like for your driveway?' },
  { groupId: 'addons', title: 'Any add-ons?', subtitle: 'Optional extras for your driveway.', skipLabel: 'Skip' },
]

export const PERGOLAS_STEPS: GenericWizardStep[] = [
  { groupId: 'structure', title: 'Structure type', subtitle: 'What kind of outdoor structure are you adding?' },
  { groupId: 'size', title: 'Size', subtitle: 'How large should the structure be?' },
  { groupId: 'addons', title: 'Any add-ons?', subtitle: 'Optional features for your outdoor space.', skipLabel: 'Skip' },
]

export const AIR_CONDITIONING_STEPS: GenericWizardStep[] = [
  { groupId: 'system', title: 'System type', subtitle: 'What HVAC system do you need?' },
  { groupId: 'addons', title: 'Any add-ons?', subtitle: 'Optional upgrades for your system.', skipLabel: 'Skip' },
]

export const WALL_PANELING_STEPS: GenericWizardStep[] = [
  { groupId: 'style', title: 'Panel style', subtitle: 'What wall panel style are you going for?' },
  { groupId: 'rooms', title: 'Which rooms?', subtitle: 'Select all the rooms you want paneled.' },
]

export const HOUSE_PAINTING_STEPS: GenericWizardStep[] = [
  { groupId: 'height', title: 'House height', subtitle: 'How many stories is the home?' },
  { groupId: 'scope', title: 'Inside, outside, or both?', subtitle: 'What areas are you painting?' },
  { groupId: 'rooms', title: 'How many rooms?', subtitle: 'For interior or both — how many rooms?', skipLabel: 'Skip' },
  { groupId: 'colors', title: 'Color scheme', subtitle: 'How do you want to handle the colors?' },
]

export const GARAGE_STEPS: GenericWizardStep[] = [
  { groupId: 'rooms', title: 'Which rooms?', subtitle: 'Select all the rooms you\'d like finished.' },
  { groupId: 'scope', title: "What's included?", subtitle: 'Choose everything in scope for this project.' },
  { groupId: 'size', title: 'Room size', subtitle: 'What\'s the total size of the space?' },
  { groupId: 'finish', title: 'Finish level', subtitle: 'What quality level are you targeting?' },
  { groupId: 'addons', title: 'Any add-ons?', subtitle: 'Optional extras to complete the room.', skipLabel: 'Skip' },
]

export const BLINDS_STEPS: GenericWizardStep[] = [
  { groupId: 'type', title: 'Blind type', subtitle: 'What style of window treatment are you looking for?' },
  { groupId: 'material', title: 'Material', subtitle: 'What material works best for your space?' },
  { groupId: 'control', title: 'Control type', subtitle: 'How would you like to operate the blinds?' },
  { groupId: 'mount', title: 'Mount style', subtitle: 'Inside or outside the window frame?' },
  { groupId: 'light_control', title: 'Light control', subtitle: 'How much light do you want to let in?' },
]

// house_painting: skip S3 (rooms) when scope = exterior_only
// S1=height S2=scope S3=rooms S4=colors → ADDR → REVIEW
export function housePaintingGetNext(step: number, sel: Selections): number {
  if (step === 2 && (sel['scope'] ?? []).includes('exterior_only')) return 4
  return step + 1
}
export function housePaintingGetPrev(step: number, sel: Selections): number {
  if (step === 4 && (sel['scope'] ?? []).includes('exterior_only')) return 2
  return step - 1
}
