import { useState } from 'react'
import { Check, Home } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CardSlideWizard } from './card-slide-wizard'
import { MetalRoofConfigurator, type MetalRoofSelection } from './metal-roof-configurator'
import { RoofMeasurementWizard, type RoofWizardResult } from './roof-measurement-wizard'
import { MeasurementTutorialCTA } from '@/components/shared/measurement-tutorial-cta'
import { useCartStore, type CartItemAddress } from '@/stores/cart-store'
import { useFeatureFlagsStore } from '@/stores/feature-flags-store'
import { geocodeAddressToCoords } from '@/lib/geo-distance'
import { sqftToSquares } from '@/lib/option-metadata'
import { ROOF_WASTE_FACTOR } from '@/lib/roof-pricing'
import { computeRoofTotal } from '@/lib/roof-area-math'
import { cn } from '@/lib/utils'
import type { ServiceConfig } from '@/types'

const ADDON_LINEAR_FT_CONFIG = [
  { id: 'gutters', label: 'Gutter linear feet' },
  { id: 'soffit_wood', label: 'Soffit linear feet' },
  { id: 'fascia_wood', label: 'Fascia linear feet' },
] as const
const ADDON_LINEAR_FT_IDS: string[] = ADDON_LINEAR_FT_CONFIG.map((c) => c.id)

function metalRoofDisplaySquares(roofSize: string): number {
  const n = Number(roofSize)
  return n > 200 ? sqftToSquares(Math.round(n * ROOF_WASTE_FACTOR)) : n
}

type Selections = Record<string, string[]>

interface RoofingWizardProps {
  service: ServiceConfig
  editItem?: Record<string, unknown> | null
  addressOptions: Array<{ key: string; label: string; full: string }>
  defaultAddressKey: string
  editingItemId?: string | null
  onCancel: () => void
  onDone: () => void
}

const TOTAL_STEPS = 9

function getNextStep(step: number, selections: Selections): number {
  const next = step + 1
  if (next === 4 && !(selections['material'] ?? []).includes('metal')) return 5
  if (next === 6) {
    const hasLinearFt = ADDON_LINEAR_FT_IDS.some((id) => (selections['addons'] ?? []).includes(id))
    if (!hasLinearFt) return 7
  }
  return next
}

function getPrevStep(step: number, selections: Selections): number {
  const prev = step - 1
  if (prev === 6) {
    const hasLinearFt = ADDON_LINEAR_FT_IDS.some((id) => (selections['addons'] ?? []).includes(id))
    if (!hasLinearFt) return 5
  }
  if (prev === 4 && !(selections['material'] ?? []).includes('metal')) return 3
  return prev
}

export function RoofingWizard({
  service,
  editItem,
  addressOptions,
  defaultAddressKey,
  editingItemId: initEditId,
  onCancel,
  onDone,
}: RoofingWizardProps) {
  const addItem = useCartStore((s) => s.addItem)
  const removeItem = useCartStore((s) => s.removeItem)
  const getFlag = useFeatureFlagsStore((s) => s.getFlag)

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState<1 | -1>(1)

  const [selections, setSelections] = useState<Selections>(
    (editItem?.selections as Selections) || {}
  )
  const [metalRoofSelection, setMetalRoofSelection] = useState<MetalRoofSelection>(
    (editItem?.metalRoofSelection as MetalRoofSelection) || { color: '', roofSize: '' }
  )
  const [roofMeasurement, setRoofMeasurement] = useState<{
    areaSqft: number; pitch: string; address: string
    perimeterFt?: number; pitchedAreaSqft?: number; flatAreaSqft?: number; includeFlat?: boolean
  } | null>(null)
  const [roofPermit, setRoofPermit] = useState<'yes' | 'no' | null>(
    (editItem?.roofPermit as 'yes' | 'no') ?? null
  )
  const [addonLinearFt, setAddonLinearFt] = useState<Record<string, string>>(() => {
    const raw = editItem?.roofAddonLinearFt as Record<string, number> | undefined
    if (!raw) return {}
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]))
  })
  const [addressKey, setAddressKey] = useState(defaultAddressKey)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingItemId] = useState<string | null>(initEditId ?? null)
  const [submitting, setSubmitting] = useState(false)

  const selectedAddress = addressOptions.find((o) => o.key === addressKey) ?? addressOptions[0]

  function goNext() {
    const next = getNextStep(step, selections)
    setDirection(1)
    setStep(next)
  }
  function goBack() {
    if (step === 1) { onCancel(); return }
    setDirection(-1)
    setStep(getPrevStep(step, selections))
  }

  function handleWizardComplete(result: RoofWizardResult) {
    const materials = [result.material]
    if (result.hasFlatSection) materials.push('flat_roof')
    setSelections((prev) => ({ ...prev, material: materials }))
    if (result.material === 'metal') {
      const wasteSqft = Math.round(result.areaSqft * ROOF_WASTE_FACTOR)
      setMetalRoofSelection((prev) => ({ ...prev, roofSize: String(sqftToSquares(wasteSqft)) }))
    }
    setRoofMeasurement({
      areaSqft: result.areaSqft, pitch: result.pitch, address: result.address,
      perimeterFt: result.perimeterFt, pitchedAreaSqft: result.pitchedAreaSqft,
      flatAreaSqft: result.flatAreaSqft, includeFlat: result.includeFlat,
    })
    setRoofPermit(result.permit)
    setWizardOpen(false)
    toast.success('Roof measured — config pre-filled!')
  }

  async function handleAddToProject() {
    setSubmitting(true)
    const roofAddonLinearFtParsed: Record<string, number> = {}
    for (const { id } of ADDON_LINEAR_FT_CONFIG) {
      const val = addonLinearFt[id]
      if (val && (selections['addons'] ?? []).includes(id)) {
        const n = Number(val)
        if (!isNaN(n) && n > 0) roofAddonLinearFtParsed[id] = n
      }
    }
    let projectLat: number | undefined
    let projectLng: number | undefined
    if (getFlag('googleMapsPlatform') && getFlag('realGeocoding') && selectedAddress?.full) {
      const coords = await geocodeAddressToCoords(
        selectedAddress.full,
        import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
      )
      if (coords) { projectLat = coords.lat; projectLng = coords.lng }
    }
    const itemAddress: CartItemAddress | undefined = selectedAddress?.full
      ? { label: selectedAddress.label, full: selectedAddress.full }
      : undefined

    const itemData = {
      serviceId: service.id,
      serviceName: service.name,
      selections,
      ...(metalRoofSelection.color && { metalRoofSelection }),
      ...(roofMeasurement && { roofMeasurement }),
      ...(roofPermit && { roofPermit }),
      ...(Object.keys(roofAddonLinearFtParsed).length > 0 && { roofAddonLinearFt: roofAddonLinearFtParsed }),
      ...(itemAddress && { address: itemAddress }),
      ...(projectLat !== undefined && projectLng !== undefined && { projectLat, projectLng }),
    }
    if (editingItemId) {
      removeItem(editingItemId)
      addItem(itemData)
      toast.success(`${service.name} updated`)
    } else {
      addItem(itemData)
      toast.success(`${service.name} added to your project`, {
        action: { label: 'View projects', onClick: onDone },
      })
    }
    setSubmitting(false)
    onDone()
  }

  function toggleMulti(groupId: string, optionId: string) {
    setSelections((prev) => {
      const current = prev[groupId] ?? []
      return current.includes(optionId)
        ? { ...prev, [groupId]: current.filter((id) => id !== optionId) }
        : { ...prev, [groupId]: [...current, optionId] }
    })
  }
  function setSingle(groupId: string, optionId: string) {
    setSelections((prev) => ({ ...prev, [groupId]: [optionId] }))
  }

  const materialGroup = service.optionGroups.find((g) => g.id === 'material')!
  const serviceTypeGroup = service.optionGroups.find((g) => g.id === 'service_type')!
  const addonsGroup = service.optionGroups.find((g) => g.id === 'addons')!

  const selectedMaterials = selections['material'] ?? []
  const selectedServiceType = (selections['service_type'] ?? [])[0] ?? null
  const selectedAddons = selections['addons'] ?? []
  const metalSelected = selectedMaterials.includes('metal')
  const linearFtAddonIds = ADDON_LINEAR_FT_IDS.filter((id) => selectedAddons.includes(id))

  const stepTitles: Record<number, string> = {
    1: 'Measure your roof',
    2: 'What type of service?',
    3: 'Pick your roofing material',
    4: 'Configure metal roof',
    5: 'Any add-ons?',
    6: 'Add-on measurements',
    7: 'Do you need a permit?',
    8: 'Which property?',
    9: 'Review and add to project',
  }
  const stepSubtitles: Record<number, string> = {
    1: "We'll use satellite data to pre-fill your config. Skip this if you already know your measurements.",
    3: 'Select all that apply — many homes have both a flat section and sloped sections.',
    5: 'Select any extras you\'d like included.',
    6: "We'll use these measurements to give you the most accurate quote.",
    7: 'Permits are required for full replacements in most Florida counties.',
  }

  return (
    <div className="pb-10" data-roofing-wizard-step={step}>
      <RoofMeasurementWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        defaultAddress={selectedAddress?.full ?? ''}
        onComplete={handleWizardComplete}
      />

      <CardSlideWizard
        step={step}
        totalSteps={TOTAL_STEPS}
        title={stepTitles[step] ?? ''}
        subtitle={stepSubtitles[step]}
        direction={direction}
        onBack={goBack}
        onNext={step === 9 ? handleAddToProject : goNext}
        onSkip={
          step === 1 ? () => { setDirection(1); setStep(2) }
          : step === 5 ? () => { setDirection(1); setStep(7) }
          : undefined
        }
        skipLabel={step === 1 ? 'Skip measurement' : 'Skip add-ons'}
        nextLabel={
          step === 9
            ? (editingItemId ? 'Save Changes' : 'Add to Project')
            : 'Continue'
        }
        nextDisabled={
          (step === 2 && !selectedServiceType) ||
          (step === 3 && selectedMaterials.length === 0) ||
          (step === 4 && (!metalRoofSelection.color || !metalRoofSelection.roofSize)) ||
          (step === 7 && roofPermit === null) ||
          (step === 9 && submitting)
        }
      >
        {/* S1 — Measure Roof */}
        {step === 1 && (
          <div className="space-y-4">
            <MeasurementTutorialCTA serviceId={service.id} />
            <div className="rounded-2xl border bg-primary/5 border-primary/20 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                  <Home className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  {roofMeasurement ? (
                    <>
                      <p className="text-sm font-semibold text-foreground mb-2">Roof measured</p>
                      <div className="space-y-1">
                        {roofMeasurement.address && (
                          <p className="text-[13px] text-foreground">{roofMeasurement.address}</p>
                        )}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                          <span className="text-[12px] text-muted-foreground">Total area</span>
                          <span className="text-[12px] font-medium text-foreground">{roofMeasurement.areaSqft.toLocaleString()} sq ft</span>
                          {roofMeasurement.pitchedAreaSqft !== undefined && (
                            <>
                              <span className="text-[12px] text-muted-foreground">Pitched</span>
                              <span className="text-[12px] font-medium text-foreground">{roofMeasurement.pitchedAreaSqft.toLocaleString()} sq ft</span>
                            </>
                          )}
                          {roofMeasurement.flatAreaSqft !== undefined && (
                            <>
                              <span className="text-[12px] text-muted-foreground">Flat</span>
                              <span className="text-[12px] font-medium text-foreground">{roofMeasurement.flatAreaSqft.toLocaleString()} sq ft</span>
                            </>
                          )}
                          {roofMeasurement.pitch && (
                            <>
                              <span className="text-[12px] text-muted-foreground">Pitch</span>
                              <span className="text-[12px] font-medium text-foreground">{roofMeasurement.pitch}</span>
                            </>
                          )}
                          {roofMeasurement.perimeterFt ? (
                            <>
                              <span className="text-[12px] text-muted-foreground">Perimeter</span>
                              <span className="text-[12px] font-medium text-foreground">~{roofMeasurement.perimeterFt.toLocaleString()} lin ft</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <button
                        className="mt-3 text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                        onClick={() => setWizardOpen(true)}
                      >
                        Re-measure
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-foreground">Get an instant roof measurement</p>
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        We'll measure your roof from satellite data and pre-fill your configuration.
                      </p>
                      <Button size="sm" className="mt-3" onClick={() => setWizardOpen(true)}>
                        Measure My Roof
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* S2 — Service Type */}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            {serviceTypeGroup.options.map((opt) => {
              const isSelected = selectedServiceType === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSingle('service_type', opt.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted'
                  )}
                >
                  <div className={cn(
                    'h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                  )}>
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* S3 — Material */}
        {step === 3 && (
          <div className="flex flex-col gap-3">
            {materialGroup.options.map((opt) => {
              const isSelected = selectedMaterials.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    toggleMulti('material', opt.id)
                    if (opt.id === 'metal' && isSelected) {
                      setMetalRoofSelection({ color: '', roofSize: '' })
                    }
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center',
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                  )}>
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    {opt.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    )}
                    {opt.id === 'flat_roof' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Add Flat Roof if part of your home has a flat section like a porch or garage. We estimate the flat area from satellite — you can adjust it in the measurement step if it looks off.
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* S4 — Metal Config */}
        {step === 4 && metalSelected && (
          <AnimatePresence>
            <MetalRoofConfigurator
              selection={metalRoofSelection}
              onChange={(updated) => {
                setMetalRoofSelection(updated)
                if (updated.roofSize) {
                  const sq = Number(updated.roofSize)
                  if (!isNaN(sq) && sq > 0) {
                    setRoofMeasurement((prev) => prev
                      ? { ...prev, areaSqft: sq * 100 }
                      : { areaSqft: sq * 100, pitch: '', address: '' })
                  }
                }
              }}
            />
          </AnimatePresence>
        )}

        {/* S5 — Add-Ons */}
        {step === 5 && (
          <div className="flex flex-col gap-3">
            {addonsGroup.options.map((opt) => {
              const isSelected = selectedAddons.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    toggleMulti('addons', opt.id)
                    if (ADDON_LINEAR_FT_IDS.includes(opt.id)) {
                      if (isSelected) {
                        setAddonLinearFt((prev) => { const n = { ...prev }; delete n[opt.id]; return n })
                      } else {
                        setAddonLinearFt((prev) => ({
                          ...prev, [opt.id]: String(roofMeasurement?.perimeterFt ?? ''),
                        }))
                      }
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted'
                  )}
                >
                  <div className={cn(
                    'h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center',
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                  )}>
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* S6 — Add-On Details (linear ft) */}
        {step === 6 && (
          <div className="space-y-5">
            {linearFtAddonIds.map((id) => {
              const config = ADDON_LINEAR_FT_CONFIG.find((c) => c.id === id)!
              return (
                <div key={id} className="space-y-2">
                  <Label className="text-sm font-medium">{config.label}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 120"
                    value={addonLinearFt[id] ?? ''}
                    onChange={(e) => setAddonLinearFt((prev) => ({ ...prev, [id]: e.target.value }))}
                    className="h-12 text-base"
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* S7 — Permit */}
        {step === 7 && (
          <div className="flex flex-col gap-3">
            {(['yes', 'no'] as const).map((val) => {
              const isSelected = roofPermit === val
              const label = val === 'yes' ? 'Yes — include permit' : 'No permit needed'
              const sub = val === 'yes'
                ? 'Required for full replacements in most FL counties. Adds ~2 weeks but ensures code compliance.'
                : 'For repairs and inspections. Payment is cash, check, or wire transfer only.'
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRoofPermit(val)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                  )}>
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* S8 — Property */}
        {step === 8 && (
          <div className="space-y-3">
            <Select value={addressKey} onValueChange={(v) => setAddressKey(v ?? '')}>
              <SelectTrigger className="h-12 text-sm">
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
            {selectedAddress?.full && (
              <p className="text-sm text-muted-foreground">{selectedAddress.full}</p>
            )}
            {addressOptions.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Add more properties from your profile to target a different address.
              </p>
            )}
          </div>
        )}

        {/* S9 — Review */}
        {step === 9 && (() => {
          const matOpts = materialGroup.options
          const addonOpts = addonsGroup.options
          const serviceTypeLabel = serviceTypeGroup.options.find(o => o.id === selectedServiceType)?.label
          return (
            <div className="space-y-3" data-roofing-review="true">
              {serviceTypeLabel && (
                <div className="rounded-xl border bg-muted/40 p-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Service</p>
                  <p className="text-sm font-medium text-foreground">{serviceTypeLabel}</p>
                </div>
              )}
              {roofMeasurement && (
                <div className="rounded-xl border bg-muted/40 p-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Measurement</p>
                  <p className="text-sm text-foreground">
                    {roofMeasurement.areaSqft.toLocaleString()} sq ft · {(() => {
                      const { pitchedAreaSqft, flatAreaSqft, includeFlat } = roofMeasurement
                      if (pitchedAreaSqft !== undefined && flatAreaSqft !== undefined) {
                        return computeRoofTotal({ pitchedAreaSqft, flatAreaSqft, includeFlat: includeFlat ?? (flatAreaSqft > 0) }).totalSquares
                      }
                      return sqftToSquares(Math.round(roofMeasurement.areaSqft * ROOF_WASTE_FACTOR))
                    })()} squares w/waste
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pitch {roofMeasurement.pitch}{roofMeasurement.perimeterFt ? ` · ~${roofMeasurement.perimeterFt} lin ft perimeter` : ''}
                  </p>
                </div>
              )}
              {selectedMaterials.length > 0 && (
                <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Materials</p>
                  {selectedMaterials.map((matId) => {
                    const label = matOpts.find(o => o.id === matId)?.label ?? matId
                    return (
                      <div key={matId}>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        {matId === 'metal' && metalRoofSelection.color && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {metalRoofSelection.color.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                            {metalRoofSelection.roofSize ? ` · ${metalRoofDisplaySquares(metalRoofSelection.roofSize)} squares` : ''}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {selectedAddons.length > 0 && (
                <div className="rounded-xl border bg-muted/40 p-4 space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Add-Ons</p>
                  {selectedAddons.map((id) => {
                    const label = addonOpts.find(o => o.id === id)?.label ?? id
                    const linFt = ADDON_LINEAR_FT_IDS.includes(id) ? addonLinearFt[id] : undefined
                    return (
                      <p key={id} className="text-sm text-foreground">
                        {label}{linFt ? ` — ${linFt} lin ft` : ''}
                      </p>
                    )
                  })}
                </div>
              )}
              {roofPermit && (
                <div className="rounded-xl border bg-muted/40 p-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Permit</p>
                  <p className="text-sm text-foreground">
                    {roofPermit === 'yes' ? 'Yes — permit included' : 'No permit'}
                  </p>
                </div>
              )}
              {selectedAddress?.full && (
                <div className="rounded-xl border bg-muted/40 p-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Property</p>
                  <p className="text-sm text-foreground">{selectedAddress.full}</p>
                </div>
              )}
            </div>
          )
        })()}
      </CardSlideWizard>
    </div>
  )
}
