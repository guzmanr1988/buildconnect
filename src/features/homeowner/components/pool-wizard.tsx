import { useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CardSlideWizard } from './card-slide-wizard'
import { useCartStore, type CartItemAddress } from '@/stores/cart-store'
import { cn } from '@/lib/utils'
import type { ServiceConfig } from '@/types'

type Selections = Record<string, string[]>

interface PoolWizardProps {
  service: ServiceConfig
  editItem?: Record<string, unknown> | null
  addressOptions: Array<{ key: string; label: string; full: string }>
  defaultAddressKey: string
  editingItemId?: string | null
  onCancel: () => void
  onDone: () => void
}

const TOTAL_STEPS = 7
// S1=project_type S2=pool_size S3=pool_floor S4=addons S5=addon_config S6=address S7=review
const CONFIGURABLE_ADDON_IDS = ['spa', 'beach', 'waterfall', 'led', 'bubbler', 'pool_fence']

// Named pool sizes auto-derive sqft (W × L). Custom uses homeowner-entered value.
// Drives priceUnit:'sqft' billing for pool_size 'custom' option (vendor enters
// $/sqft, total = $/sqft × sqft). Named sizes are still flat-priced today, but
// the sqft is also stored so future flips don't need a homeowner-side input.
const POOL_SIZE_SQFT: Record<string, number> = {
  '10x20': 200,
  '12x24': 288,
  '15x30': 450,
  '20x40': 800,
}

function hasConfigurableAddon(sel: Selections) {
  return CONFIGURABLE_ADDON_IDS.some((id) => (sel['addons'] ?? []).includes(id))
}

function getNextStep(step: number, sel: Selections): number {
  if (step === 4 && !hasConfigurableAddon(sel)) return 6
  return step + 1
}

function getPrevStep(step: number, sel: Selections): number {
  if (step === 6 && !hasConfigurableAddon(sel)) return 4
  return step - 1
}

function OptionChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-150',
        selected
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
      )}
    >
      {selected && <Check className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}

function CountStepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-6 text-center text-sm font-semibold text-primary">{value}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function PoolWizard({
  service,
  editItem,
  addressOptions,
  defaultAddressKey,
  editingItemId: initEditId,
  onCancel,
  onDone,
}: PoolWizardProps) {
  const addItem = useCartStore((s) => s.addItem)
  const removeItem = useCartStore((s) => s.removeItem)

  const editAddons = editItem?.addonQuantities as
    | { laminarJets?: number; waterfalls?: number; ledCount?: number; bubblerCount?: number }
    | undefined
  const editCustomSizeSqft = editItem?.customSizeSqft as Record<string, number> | undefined
  const editAddonLinearFt = editItem?.addonLinearFt as Record<string, number> | undefined

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [selections, setSelections] = useState<Selections>((editItem?.selections as Selections) ?? {})
  // Pool size sqft. For named sizes (10x20 etc.) auto-derived from POOL_SIZE_SQFT.
  // For 'custom', homeowner-entered. Stored at customSizeSqft.<sizeId> in cart.
  const [customPoolSqft, setCustomPoolSqft] = useState<number>(editCustomSizeSqft?.['custom'] ?? 0)
  // Pool floor sqft — SEPARATE from pool size (per Rodolfo Q2: floor priced
  // independently against its own area). Single value for whichever floor
  // surface the homeowner picks; written to customSizeSqft.<floorId> at submit.
  const [poolFloorSqft, setPoolFloorSqft] = useState<number>(() => {
    if (!editCustomSizeSqft) return 0
    for (const k of ['travertine', 'pavers', 'stamped_concrete', 'cement_floor', 'artificial_turf', 'square_concrete']) {
      if (editCustomSizeSqft[k]) return editCustomSizeSqft[k]
    }
    return 0
  })
  // Pool fence linear ft — perimeter of fence, vendor prices $/lin ft.
  const [poolFenceLinFt, setPoolFenceLinFt] = useState<number>(editAddonLinearFt?.['pool_fence'] ?? 0)
  const [laminarJets, setLaminarJets] = useState(editAddons?.laminarJets ?? 0)
  const [waterfalls, setWaterfalls] = useState(editAddons?.waterfalls ?? 0)
  const [ledCount, setLedCount] = useState(editAddons?.ledCount ?? 0)
  const [bubblerCount, setBubblerCount] = useState(editAddons?.bubblerCount ?? 0)
  const [addressKey, setAddressKey] = useState(defaultAddressKey)
  const [editingItemId, setEditingItemId] = useState<string | null>(initEditId ?? null)
  const [added, setAdded] = useState(false)

  const selectedAddress = addressOptions.find((o) => o.key === addressKey) ?? addressOptions[0]

  function goNext() {
    const next = step <= 4 ? getNextStep(step, selections) : step + 1
    setDirection(1)
    setStep(Math.min(next, TOTAL_STEPS))
  }

  function goBack() {
    if (step === 1) { onCancel(); return }
    const prev = step >= 6 ? getPrevStep(step, selections) : step - 1
    setDirection(-1)
    setStep(Math.max(prev, 1))
  }

  function toggleSingle(groupId: string, optionId: string) {
    setSelections((prev) => ({ ...prev, [groupId]: [optionId] }))
  }

  function toggleMulti(groupId: string, optionId: string) {
    setSelections((prev) => {
      const current = prev[groupId] ?? []
      if (current.includes(optionId)) {
        const next = current.filter((id) => id !== optionId)
        // Clear sub-selections when addon is deselected
        const cleared: Selections = { ...prev, [groupId]: next }
        if (optionId === 'spa') cleared['spa_size'] = []
        if (optionId === 'beach') cleared['beach_size'] = []
        return cleared
      }
      return { ...prev, [groupId]: [...current, optionId] }
    })
    if (optionId === 'waterfall') { setLaminarJets(0); setWaterfalls(0) }
    if (optionId === 'led') setLedCount(0)
    if (optionId === 'bubbler') setBubblerCount(0)
    if (optionId === 'pool_fence') setPoolFenceLinFt(0)
  }

  // ── Step content ──────────────────────────────────────────────────────────

  function group(id: string) {
    return service.optionGroups.find((g) => g.id === id)!
  }

  function renderChips(groupId: string, type: 'single' | 'multi') {
    const g = group(groupId)
    const sel = selections[groupId] ?? []
    return (
      <div className="flex flex-wrap gap-2">
        {g.options.map((opt) => (
          <OptionChip
            key={opt.id}
            label={opt.label}
            selected={sel.includes(opt.id)}
            onClick={() => type === 'single' ? toggleSingle(groupId, opt.id) : toggleMulti(groupId, opt.id)}
          />
        ))}
      </div>
    )
  }

  function renderStep1() {
    return renderChips('project_type', 'single')
  }

  function renderStep2() {
    const poolSizeSel = selections['pool_size'] ?? []
    const namedSqft = poolSizeSel[0] ? POOL_SIZE_SQFT[poolSizeSel[0]] : undefined
    return (
      <div className="flex flex-col gap-3">
        {renderChips('pool_size', 'single')}
        {poolSizeSel.includes('custom') && (
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="e.g. 20×40 = 800"
              value={customPoolSqft || ''}
              onChange={(e) => setCustomPoolSqft(Number(e.target.value) || 0)}
              className="h-10 flex-1"
              data-pool-custom-sqft="true"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">sqft</span>
          </div>
        )}
        {namedSqft !== undefined && (
          <p className="text-xs text-muted-foreground">≈ {namedSqft.toLocaleString()} sqft</p>
        )}
      </div>
    )
  }

  function renderStep3() {
    const floorSel = selections['pool_floor']?.[0]
    const showSqftInput = !!floorSel && floorSel !== 'na'
    return (
      <div className="flex flex-col gap-3">
        {renderChips('pool_floor', 'single')}
        {showSqftInput && (
          <div className="flex flex-col gap-1.5 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pool floor area</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="e.g. 350"
                value={poolFloorSqft || ''}
                onChange={(e) => setPoolFloorSqft(Number(e.target.value) || 0)}
                className="h-10 flex-1"
                data-pool-floor-sqft="true"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">sqft</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Deck/surround area around the pool — separate from the pool size itself.</p>
          </div>
        )}
      </div>
    )
  }

  function renderStep4() {
    return renderChips('addons', 'multi')
  }

  function renderStep5() {
    const addons = selections['addons'] ?? []
    const hasSpa = addons.includes('spa')
    const hasBeach = addons.includes('beach')
    const hasWaterfall = addons.includes('waterfall')
    const hasLed = addons.includes('led')
    const hasBubbler = addons.includes('bubbler')
    const hasPoolFence = addons.includes('pool_fence')
    const spaSizeGroup = service.optionGroups.find((g) => g.id === 'spa_size')
    const beachSizeGroup = service.optionGroups.find((g) => g.id === 'beach_size')

    return (
      <div className="flex flex-col gap-5" data-pool-addon-config="true">
        {hasSpa && spaSizeGroup && (
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Spa size</p>
            <div className="flex flex-wrap gap-2">
              {spaSizeGroup.options.map((opt) => (
                <OptionChip
                  key={opt.id}
                  label={opt.label}
                  selected={(selections['spa_size'] ?? []).includes(opt.id)}
                  onClick={() => toggleSingle('spa_size', opt.id)}
                />
              ))}
            </div>
          </div>
        )}
        {hasBeach && beachSizeGroup && (
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Beach size</p>
            <div className="flex flex-wrap gap-2">
              {beachSizeGroup.options.map((opt) => (
                <OptionChip
                  key={opt.id}
                  label={opt.label}
                  selected={(selections['beach_size'] ?? []).includes(opt.id)}
                  onClick={() => toggleSingle('beach_size', opt.id)}
                />
              ))}
            </div>
          </div>
        )}
        {hasWaterfall && (
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Water features</p>
            <div className="rounded-xl border bg-background px-4 divide-y">
              <CountStepper label="Laminar Jets" value={laminarJets} onChange={setLaminarJets} />
              <CountStepper label="Waterfalls" value={waterfalls} onChange={setWaterfalls} />
            </div>
          </div>
        )}
        {hasLed && (
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">LED Lighting</p>
            <div className="rounded-xl border bg-background px-4">
              <CountStepper label="Quantity" value={ledCount} onChange={setLedCount} />
            </div>
          </div>
        )}
        {hasBubbler && (
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Bubbler</p>
            <div className="rounded-xl border bg-background px-4">
              <CountStepper label="Quantity" value={bubblerCount} onChange={setBubblerCount} />
            </div>
          </div>
        )}
        {hasPoolFence && (
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Pool Fence</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="e.g. 80"
                value={poolFenceLinFt || ''}
                onChange={(e) => setPoolFenceLinFt(Number(e.target.value) || 0)}
                className="h-10 flex-1"
                data-pool-fence-linft="true"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">linear ft</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Fence perimeter around the pool — vendor prices per linear foot.</p>
          </div>
        )}
      </div>
    )
  }

  function renderStep6() {
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
                {opt.full && <span className="ml-2 text-xs text-muted-foreground">{opt.full}</span>}
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

  function renderStep7() {
    const addons = selections['addons'] ?? []
    const addonGroup = service.optionGroups.find((g) => g.id === 'addons')

    return (
      <div className="space-y-3" data-pool-wizard-review="true">
        {(['project_type', 'pool_size', 'pool_floor'] as const).map((gid) => {
          const g = service.optionGroups.find((og) => og.id === gid)
          const sel = selections[gid] ?? []
          if (!g || sel.length === 0) return null
          return (
            <div key={gid} className="rounded-xl bg-muted/50 p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{g.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {sel.map((id) => {
                  const label = g.options.find((o) => o.id === id)?.label ?? id
                  let suffix = ''
                  if (gid === 'pool_size') {
                    if (id === 'custom' && customPoolSqft > 0) suffix = ` — ${customPoolSqft.toLocaleString()} sqft`
                    else if (POOL_SIZE_SQFT[id]) suffix = ` — ${POOL_SIZE_SQFT[id].toLocaleString()} sqft`
                  } else if (gid === 'pool_floor' && id !== 'na' && poolFloorSqft > 0) {
                    suffix = ` — ${poolFloorSqft.toLocaleString()} sqft`
                  }
                  return (
                    <span key={id} className="inline-flex items-center rounded-lg bg-primary/10 text-primary px-3 py-1 text-sm font-medium">
                      {label}{suffix}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
        {addons.length > 0 && addonGroup && (
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Add-Ons</p>
            <div className="flex flex-wrap gap-1.5">
              {addons.map((id) => {
                const label = addonGroup.options.find((o) => o.id === id)?.label ?? id
                const spaSel = id === 'spa' ? (selections['spa_size'] ?? [])[0] : undefined
                const beachSel = id === 'beach' ? (selections['beach_size'] ?? [])[0] : undefined
                const spaLabel = spaSel ? service.optionGroups.find((g) => g.id === 'spa_size')?.options.find((o) => o.id === spaSel)?.label : undefined
                const beachLabel = beachSel ? service.optionGroups.find((g) => g.id === 'beach_size')?.options.find((o) => o.id === beachSel)?.label : undefined
                const extra = spaLabel ?? beachLabel
                  ?? (id === 'led' && ledCount > 0 ? `×${ledCount}` : undefined)
                  ?? (id === 'bubbler' && bubblerCount > 0 ? `×${bubblerCount}` : undefined)
                  ?? (id === 'waterfall' && (laminarJets > 0 || waterfalls > 0)
                    ? [laminarJets > 0 && `${laminarJets} Jets`, waterfalls > 0 && `${waterfalls} Falls`].filter(Boolean).join(' · ')
                    : undefined)
                  ?? (id === 'pool_fence' && poolFenceLinFt > 0 ? `${poolFenceLinFt} lin ft` : undefined)
                return (
                  <span key={id} className="inline-flex items-center rounded-lg bg-primary/10 text-primary px-3 py-1 text-sm font-medium gap-1">
                    {label}
                    {extra && <span className="opacity-70 text-xs">({extra})</span>}
                  </span>
                )
              })}
            </div>
          </div>
        )}
        {selectedAddress?.full && (
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Property</p>
            <p className="text-sm text-foreground">{selectedAddress.full}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit() {
    const itemAddress: CartItemAddress | undefined = selectedAddress?.full
      ? { label: selectedAddress.label, full: selectedAddress.full }
      : undefined
    const addonQuantities = (laminarJets || waterfalls || ledCount || bubblerCount)
      ? { laminarJets, waterfalls, ledCount, bubblerCount }
      : undefined
    // Build customSizeSqft map keyed by option_id. Pool size 'custom' uses
    // homeowner-entered sqft; named sizes auto-derive from POOL_SIZE_SQFT so
    // the area is captured even though those options price flat today.
    const sizeId = selections['pool_size']?.[0]
    const floorId = selections['pool_floor']?.[0]
    const customSizeSqft: Record<string, number> = {}
    if (sizeId === 'custom' && customPoolSqft > 0) customSizeSqft.custom = customPoolSqft
    else if (sizeId && POOL_SIZE_SQFT[sizeId]) customSizeSqft[sizeId] = POOL_SIZE_SQFT[sizeId]
    if (floorId && floorId !== 'na' && poolFloorSqft > 0) customSizeSqft[floorId] = poolFloorSqft
    // pool_fence is the only sqft/lin_ft addon with a numeric input today.
    const addonLinearFt: Record<string, number> = {}
    const hasPoolFence = (selections['addons'] ?? []).includes('pool_fence')
    if (hasPoolFence && poolFenceLinFt > 0) addonLinearFt.pool_fence = poolFenceLinFt
    const itemData = {
      serviceId: service.id,
      serviceName: service.name,
      selections,
      ...(addonQuantities && { addonQuantities }),
      ...(Object.keys(customSizeSqft).length > 0 && { customSizeSqft }),
      ...(Object.keys(addonLinearFt).length > 0 && { addonLinearFt }),
      ...(itemAddress && { address: itemAddress }),
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
    setTimeout(() => { setAdded(false); onDone() }, 900)
  }

  // ── Step meta ─────────────────────────────────────────────────────────────

  const STEP_META: Array<{ title: string; subtitle?: string }> = [
    { title: 'New pool or remodel?', subtitle: 'What kind of pool project is this?' },
    { title: 'Pool size', subtitle: 'How large would you like the pool?' },
    { title: 'Pool floor', subtitle: 'What surface material for the pool floor?' },
    { title: 'Any add-ons?', subtitle: 'Optional features — skip if none.' },
    { title: 'Configure your add-ons', subtitle: 'Set the details for each feature you selected.' },
    { title: 'Which property?', subtitle: 'Choose the address for this pool project.' },
    { title: 'Review your pool', subtitle: 'Everything look right? Add it to your project.' },
  ]

  const meta = STEP_META[step - 1]

  const isRequired = (s: number) => [1, 2, 3].includes(s)
  const isDone = (s: number) => {
    if (s === 1) return (selections['project_type']?.length ?? 0) > 0
    if (s === 2) {
      const sel = selections['pool_size'] ?? []
      if (sel.length === 0) return false
      // Custom pool requires sqft entry; named sizes auto-derive.
      if (sel.includes('custom') && customPoolSqft <= 0) return false
      return true
    }
    if (s === 3) {
      const sel = selections['pool_floor'] ?? []
      if (sel.length === 0) return false
      // Non-na floor requires the separate floor-area sqft.
      if (sel[0] !== 'na' && poolFloorSqft <= 0) return false
      return true
    }
    return true
  }
  const nextDisabled = (isRequired(step) && !isDone(step)) || added

  function renderStepContent() {
    switch (step) {
      case 1: return renderStep1()
      case 2: return renderStep2()
      case 3: return renderStep3()
      case 4: return renderStep4()
      case 5: return renderStep5()
      case 6: return renderStep6()
      case 7: return renderStep7()
      default: return null
    }
  }

  return (
    <div data-pool-wizard-step={step}>
      <CardSlideWizard
        step={step}
        totalSteps={TOTAL_STEPS}
        title={meta.title}
        subtitle={meta.subtitle}
        direction={direction}
        onBack={goBack}
        onNext={step === TOTAL_STEPS ? handleSubmit : goNext}
        onSkip={step === 4 ? () => { setDirection(1); setStep(getNextStep(4, selections)) } : undefined}
        skipLabel="Skip"
        nextDisabled={nextDisabled}
        nextLabel={
          step === TOTAL_STEPS
            ? added ? (editingItemId ? 'Updated' : 'Added') : (editingItemId ? 'Save Changes' : 'Add to Project')
            : 'Continue'
        }
      >
        {renderStepContent()}
      </CardSlideWizard>
    </div>
  )
}
