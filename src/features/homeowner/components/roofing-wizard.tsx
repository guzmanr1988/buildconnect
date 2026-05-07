import { useState } from 'react'
import { Check, Home, Wrench } from 'lucide-react'
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
import { ROOF_WASTE_FACTOR, GUTTER_DROP_FT_BY_FLOORS, computeGutterTotalLinFt } from '@/lib/roof-pricing'
import { computeRoofTotal } from '@/lib/roof-area-math'
import { cn } from '@/lib/utils'
import type { ServiceConfig } from '@/types'

const ADDON_LINEAR_FT_CONFIG = [
  { id: 'gutters', label: 'Gutter linear feet' },
  { id: 'soffit_wood', label: 'Soffit Wood linear feet' },
  { id: 'fascia_wood', label: 'Fascia Wood linear feet' },
  { id: 'soffit_metal', label: 'Soffit Metal linear feet' },
  { id: 'fascia_metal', label: 'Fascia Metal linear feet' },
] as const
const ADDON_LINEAR_FT_IDS: string[] = ADDON_LINEAR_FT_CONFIG.map((c) => c.id)

const ADDONS_PATH_B_HIDE: string[] = ['extra_plywood', 'solar_prep', 'insulation']

type FlowPath = 'full_replacement' | 'addons_only'

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

function computeVisibleSteps(flowPath: FlowPath | null, selections: Selections): number[] {
  if (flowPath === 'addons_only') {
    const hasLinearFt = ADDON_LINEAR_FT_IDS.some((id) => (selections['addons'] ?? []).includes(id))
    return hasLinearFt ? [1, 2, 6, 7, 9, 10] : [1, 2, 6, 9, 10]
  }
  const hasMetal = (selections['material'] ?? []).includes('metal')
  const hasLinearFt = ADDON_LINEAR_FT_IDS.some((id) => (selections['addons'] ?? []).includes(id))
  const steps = [1, 2, 3, 4]
  if (hasMetal) steps.push(5)
  steps.push(6)
  if (hasLinearFt) steps.push(7)
  steps.push(8, 9, 10)
  return steps
}

function getNextStep(step: number, selections: Selections, path: FlowPath | null): number {
  if (step === 1) return 2
  if (path === 'addons_only') {
    if (step === 2) return 6
    if (step === 6) {
      const hasLinearFt = ADDON_LINEAR_FT_IDS.some((id) => (selections['addons'] ?? []).includes(id))
      return hasLinearFt ? 7 : 9
    }
    if (step === 7) return 9
  }
  const next = step + 1
  if (next === 5 && !(selections['material'] ?? []).includes('metal')) return 6
  if (next === 7) {
    const hasLinearFt = ADDON_LINEAR_FT_IDS.some((id) => (selections['addons'] ?? []).includes(id))
    if (!hasLinearFt) return 8
  }
  return next
}

function getPrevStep(step: number, selections: Selections, path: FlowPath | null): number {
  if (path === 'addons_only') {
    if (step === 9) {
      const hasLinearFt = ADDON_LINEAR_FT_IDS.some((id) => (selections['addons'] ?? []).includes(id))
      return hasLinearFt ? 7 : 6
    }
    if (step === 7) return 6
    if (step === 6) return 2
  }
  const prev = step - 1
  if (prev === 7) {
    const hasLinearFt = ADDON_LINEAR_FT_IDS.some((id) => (selections['addons'] ?? []).includes(id))
    if (!hasLinearFt) return 6
  }
  if (prev === 5 && !(selections['material'] ?? []).includes('metal')) return 4
  return prev
}

function inferFlowPath(editItem: Record<string, unknown> | null | undefined): FlowPath | null {
  if (!editItem) return null
  const persisted = editItem.flowPath as FlowPath | undefined
  if (persisted === 'full_replacement' || persisted === 'addons_only') return persisted
  const sel = (editItem.selections as Selections) ?? {}
  if ((sel.material ?? []).length > 0) return 'full_replacement'
  if ((sel.addons ?? []).length > 0) return 'addons_only'
  return 'full_replacement'
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

  const [flowPath, setFlowPathState] = useState<FlowPath | null>(() => inferFlowPath(editItem))
  const [step, setStep] = useState(() => (editItem ? 2 : 1))
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
  const [waiverAcknowledged, setWaiverAcknowledged] = useState(false)
  const [waiverName, setWaiverName] = useState('')
  const [addonLinearFt, setAddonLinearFt] = useState<Record<string, string>>(() => {
    const raw = editItem?.roofAddonLinearFt as Record<string, number> | undefined
    if (!raw) return {}
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]))
  })
  const [gutterFloors, setGutterFloors] = useState<1 | 2 | null>(() => {
    const persisted = (editItem?.gutterDropsConfig as { floors?: 1 | 2 } | undefined)?.floors
    return persisted === 1 || persisted === 2 ? persisted : null
  })
  const [gutterDrops, setGutterDrops] = useState<number>(() => {
    const persisted = (editItem?.gutterDropsConfig as { drops?: number } | undefined)?.drops
    return persisted && persisted >= 1 && persisted <= 5 ? persisted : 3
  })
  const [addressKey, setAddressKey] = useState(defaultAddressKey)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingItemId] = useState<string | null>(initEditId ?? null)
  const [submitting, setSubmitting] = useState(false)

  const selectedAddress = addressOptions.find((o) => o.key === addressKey) ?? addressOptions[0]

  function setFlowPath(next: FlowPath) {
    setFlowPathState(next)
    if (next === 'addons_only') {
      setSelections((prev) => {
        const cleaned = { ...prev }
        delete cleaned.material
        delete cleaned.service_type
        return cleaned
      })
      setMetalRoofSelection({ color: '', roofSize: '' })
      setRoofPermit(null)
      setWaiverAcknowledged(false)
      setWaiverName('')
    }
  }

  function goNext() {
    const next = getNextStep(step, selections, flowPath)
    setDirection(1)
    setStep(next)
  }
  function goBack() {
    if (step === 1 || (editItem && step === 2)) { onCancel(); return }
    setDirection(-1)
    setStep(getPrevStep(step, selections, flowPath))
  }

  function handleWizardComplete(result: RoofWizardResult) {
    if (flowPath !== 'addons_only') {
      const materials = [result.material]
      if (result.includeFlat && result.material !== 'flat_roof') materials.push('flat_roof')
      setSelections((prev) => ({ ...prev, material: materials }))
      if (result.material === 'metal') {
        const wasteSqft = Math.round(result.areaSqft * ROOF_WASTE_FACTOR)
        setMetalRoofSelection((prev) => ({ ...prev, roofSize: String(sqftToSquares(wasteSqft)) }))
      }
    }
    setRoofMeasurement({
      areaSqft: result.areaSqft, pitch: result.pitch, address: result.address,
      perimeterFt: result.perimeterFt, pitchedAreaSqft: result.pitchedAreaSqft,
      flatAreaSqft: result.flatAreaSqft, includeFlat: result.includeFlat,
    })
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
      ...(flowPath && { flowPath }),
      ...(metalRoofSelection.color && { metalRoofSelection }),
      ...(roofMeasurement && { roofMeasurement }),
      ...(roofPermit && { roofPermit }),
      ...(roofPermit === 'no' && waiverAcknowledged && waiverName.trim().length >= 2 && {
        permitWaiver: { acknowledged: true, signedName: waiverName.trim(), signedAt: new Date().toISOString() },
      }),
      ...(Object.keys(roofAddonLinearFtParsed).length > 0 && { roofAddonLinearFt: roofAddonLinearFtParsed }),
      ...((selections['addons'] ?? []).includes('gutters') && gutterFloors && {
        gutterDropsConfig: { floors: gutterFloors, drops: gutterDrops },
      }),
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

  const visibleAddonOptions = addonsGroup.options.filter((opt) =>
    flowPath === 'addons_only' ? !ADDONS_PATH_B_HIDE.includes(opt.id) : true
  )
  function addonOptionLabel(opt: { id: string; label: string }): string {
    if (flowPath === 'addons_only' && opt.id === 'gutters') {
      return 'Gutter Installation (includes downspouts)'
    }
    return opt.label
  }

  const visibleSteps = computeVisibleSteps(flowPath, selections)
  const displayStep = Math.max(1, visibleSteps.indexOf(step) + 1)
  const totalDisplaySteps = visibleSteps.length

  const stepTitles: Record<number, string> = {
    1: 'What are you doing today?',
    2: 'Measure your roof',
    3: 'What type of service?',
    4: 'Pick your roofing material',
    5: 'Configure metal roof',
    6: 'Any add-ons?',
    7: 'Add-on measurements',
    8: 'Do you need a permit?',
    9: 'Which property?',
    10: 'Review and add to project',
  }
  const stepSubtitles: Record<number, string> = {
    1: 'Pick the option that matches your project.',
    2: "We'll use satellite data to pre-fill your roof config.",
    4: 'Select all that apply — many homes have both a flat section and sloped sections.',
    6: "Select any extras you'd like included.",
    7: "We'll use these measurements to give you the most accurate quote.",
    8: 'Permits are required for full replacements in most Florida counties.',
  }

  return (
    <div
      className="pb-10"
      data-roofing-wizard-step={step}
      data-roofing-flow-path={flowPath ?? ''}
    >
      <RoofMeasurementWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        defaultAddress={selectedAddress?.full ?? ''}
        onComplete={handleWizardComplete}
        flowPath={flowPath}
      />

      <CardSlideWizard
        step={displayStep}
        totalSteps={totalDisplaySteps}
        title={stepTitles[step] ?? ''}
        subtitle={stepSubtitles[step]}
        direction={direction}
        onBack={goBack}
        onNext={step === 10 ? handleAddToProject : goNext}
        onSkip={step === 6 ? () => {
          setDirection(1)
          setStep(flowPath === 'addons_only' ? 9 : 8)
        } : undefined}
        skipLabel="Skip add-ons"
        nextLabel={
          step === 10
            ? (editingItemId ? 'Save Changes' : 'Add to Project')
            : 'Continue'
        }
        nextDisabled={
          (step === 1 && !flowPath) ||
          (step === 2 && !roofMeasurement) ||
          (step === 3 && !selectedServiceType) ||
          (step === 4 && selectedMaterials.length === 0) ||
          (step === 5 && (!metalRoofSelection.color || !metalRoofSelection.roofSize)) ||
          (step === 7 && (selections['addons'] ?? []).includes('gutters') && gutterFloors === null) ||
          (step === 8 && roofPermit === null) ||
          (step === 8 && roofPermit === 'no' && (!waiverAcknowledged || waiverName.trim().length < 2)) ||
          (step === 10 && submitting)
        }
      >
        {/* S1 — Gate (Full replacement vs Addons-only) */}
        {step === 1 && (
          <div className="flex flex-col gap-3" data-roofing-gate="true">
            <button
              type="button"
              onClick={() => setFlowPath('full_replacement')}
              data-roofing-gate-option="full_replacement"
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                flowPath === 'full_replacement'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/40 hover:bg-muted'
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <Home className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Full roof replacement</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Replace your entire roof with new materials and a permit.
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFlowPath('addons_only')}
              data-roofing-gate-option="addons_only"
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                flowPath === 'addons_only'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/40 hover:bg-muted'
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <Wrench className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Gutters, fascia, soffit, or downspouts only</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Quick install or replace of these. No roof replacement.
                </p>
              </div>
            </button>
          </div>
        )}

        {/* S2 — Measure Roof */}
        {step === 2 && (
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
                          {flowPath !== 'addons_only' && (
                            <>
                              <span className="text-[12px] text-muted-foreground">Main roof</span>
                              <span className="text-[12px] font-medium text-foreground">
                                {(() => {
                                  const sqft = roofMeasurement.pitchedAreaSqft ?? roofMeasurement.areaSqft
                                  const sq = Math.ceil((sqft * 1.02) / 100)
                                  return `${sqft.toLocaleString()} sqft (${sq} sq)`
                                })()}
                              </span>
                            </>
                          )}
                          {roofMeasurement.perimeterFt ? (
                            <>
                              <span className="text-[12px] text-muted-foreground">Linear ft</span>
                              <span className="text-[12px] font-medium text-foreground">~{roofMeasurement.perimeterFt.toLocaleString()} lin ft</span>
                            </>
                          ) : null}
                          {flowPath !== 'addons_only' && roofMeasurement.flatAreaSqft !== undefined && roofMeasurement.flatAreaSqft > 0 && roofMeasurement.includeFlat !== false && (
                            <>
                              <span className="text-[12px] text-muted-foreground">Flat</span>
                              <span className="text-[12px] font-medium text-foreground">
                                {roofMeasurement.flatAreaSqft.toLocaleString()} sqft ({Math.ceil((roofMeasurement.flatAreaSqft * 1.01) / 100)} sq)
                              </span>
                            </>
                          )}
                          {flowPath !== 'addons_only' && roofMeasurement.pitch && (
                            <>
                              <span className="text-[12px] text-muted-foreground">Pitch</span>
                              <span className="text-[12px] font-medium text-foreground">{roofMeasurement.pitch}</span>
                            </>
                          )}
                          {flowPath !== 'addons_only' && roofMeasurement.pitchedAreaSqft !== undefined && roofMeasurement.flatAreaSqft !== undefined && (
                            <>
                              <span className="text-[12px] text-muted-foreground font-semibold">Total</span>
                              <span className="text-[12px] font-semibold text-foreground">
                                {(() => {
                                  const { totalSqft, totalSquares } = computeRoofTotal({
                                    pitchedAreaSqft: roofMeasurement.pitchedAreaSqft!,
                                    flatAreaSqft: roofMeasurement.flatAreaSqft!,
                                    includeFlat: roofMeasurement.includeFlat ?? (roofMeasurement.flatAreaSqft! > 0),
                                  })
                                  return `${totalSqft.toLocaleString()} sqft (${totalSquares} sq)`
                                })()}
                              </span>
                            </>
                          )}
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

        {/* S3 — Service Type */}
        {step === 3 && (
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
                  <span className="text-base font-medium text-foreground">{opt.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* S4 — Material */}
        {step === 4 && (
          <div className="flex flex-col gap-3">
            {materialGroup.options.map((opt) => {
              const isSelected = selectedMaterials.includes(opt.id)
              const isFlatGated = opt.id === 'flat_roof' && roofMeasurement?.includeFlat === false
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isFlatGated}
                  title={isFlatGated ? 'Toggle Flat section ON in Step 1 to enable' : undefined}
                  onClick={() => {
                    if (isFlatGated) return
                    toggleMulti('material', opt.id)
                    if (opt.id === 'metal' && isSelected) {
                      setMetalRoofSelection({ color: '', roofSize: '' })
                    }
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                    isFlatGated
                      ? 'border-border opacity-40 cursor-not-allowed'
                      : isSelected
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
                    <p className="text-base font-medium text-foreground">{opt.label}</p>
                    {opt.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    )}
                    {opt.id === 'flat_roof' && !isFlatGated && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Add Flat Roof if part of your home has a flat section like a porch or garage. We estimate the flat area from satellite — you can adjust it in the measurement step if it looks off.
                      </p>
                    )}
                    {isFlatGated && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Toggle the Flat section ON in Step 1 to enable this option.
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* S5 — Metal Config */}
        {step === 5 && metalSelected && (
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

        {/* S6 — Add-Ons */}
        {step === 6 && (
          <div className="flex flex-col gap-3">
            {visibleAddonOptions.map((opt) => {
              const isSelected = selectedAddons.includes(opt.id)
              const label = addonOptionLabel(opt)
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
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* S7 — Add-On Details (linear ft) */}
        {step === 7 && (() => {
          const showGutterDrops = linearFtAddonIds.includes('gutters')
          const gutterPerimeter = Number(addonLinearFt['gutters'] ?? 0) || 0
          const perFloor = gutterFloors ? GUTTER_DROP_FT_BY_FLOORS[gutterFloors] : 0
          const gutterTotal = computeGutterTotalLinFt(
            gutterPerimeter,
            gutterFloors ? { floors: gutterFloors, drops: gutterDrops } : undefined,
          )
          const floorsLabel = gutterFloors === 1 ? '1-story' : '2-story'
          return (
            <div className="space-y-5">
              {showGutterDrops && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">How many floors does the home have?</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {([1, 2] as const).map((n) => {
                        const isSelected = gutterFloors === n
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setGutterFloors(n)}
                            className={cn(
                              'rounded-xl border p-3 text-center transition-all duration-150',
                              isSelected
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-primary font-semibold'
                                : 'border-border hover:border-primary/40 hover:bg-muted text-foreground'
                            )}
                          >
                            <span className="text-sm">{n === 1 ? 'One story' : 'Two stories'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">How many downspouts (drops)?</Label>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const isSelected = gutterDrops === n
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setGutterDrops(n)}
                            className={cn(
                              'rounded-xl border p-3 text-center transition-all duration-150',
                              isSelected
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-primary font-semibold'
                                : 'border-border hover:border-primary/40 hover:bg-muted text-foreground'
                            )}
                          >
                            <span className="text-sm">{n}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Most homes have 2 or 3 drops.</p>
                  </div>
                </>
              )}
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
              {showGutterDrops && gutterFloors && gutterPerimeter > 0 && (
                <div className="rounded-xl border bg-muted/40 p-3 space-y-1" data-roofing-gutter-breakdown="true">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total gutter lin ft</p>
                  <p className="text-sm font-semibold text-foreground">
                    {gutterTotal.toLocaleString()} lin ft
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {gutterPerimeter.toLocaleString()} perimeter + {gutterDrops} drop{gutterDrops === 1 ? '' : 's'} × {perFloor} ft for {floorsLabel}
                  </p>
                </div>
              )}
            </div>
          )
        })()}

        {/* S8 — Permit */}
        {step === 8 && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setRoofPermit('yes')}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                roofPermit === 'yes'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/40 hover:bg-muted'
              )}
            >
              <div className={cn(
                'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                roofPermit === 'yes' ? 'border-primary bg-primary' : 'border-muted-foreground'
              )}>
                {roofPermit === 'yes' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Yes — include permit</p>
                <p className="text-xs text-muted-foreground mt-0.5">Required for full replacements in most FL counties. Adds ~2 weeks but ensures code compliance.</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1 font-medium">Financing options available with permit.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => { setRoofPermit('no'); setWaiverAcknowledged(false); setWaiverName('') }}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                roofPermit === 'no'
                  ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 ring-2 ring-amber-200 dark:ring-amber-800'
                  : 'border-border hover:border-primary/40 hover:bg-muted'
              )}
            >
              <div className={cn(
                'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                roofPermit === 'no' ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground'
              )}>
                {roofPermit === 'no' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No permit needed</p>
                <p className="text-xs text-muted-foreground mt-0.5">For repairs. Payment is cash, check, or wire transfer only.</p>
              </div>
            </button>

            {roofPermit === 'no' && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">Acknowledgment Required</p>
                <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
                  I acknowledge that proceeding without a permit means I am personally responsible for any fines, penalties, or remediation costs imposed by the city or county if code-enforcement becomes involved. BuildConnect and the contractor are not liable for any penalties resulting from this decision.
                </p>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waiverAcknowledged}
                    onChange={(e) => setWaiverAcknowledged(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-600 shrink-0"
                  />
                  <span className="text-xs text-amber-900 dark:text-amber-300">I understand and accept full responsibility.</span>
                </label>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-amber-800 dark:text-amber-400">Print full name</label>
                  <input
                    type="text"
                    value={waiverName}
                    onChange={(e) => setWaiverName(e.target.value)}
                    placeholder="Your full legal name"
                    className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* S9 — Property */}
        {step === 9 && (
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

        {/* S10 — Review */}
        {step === 10 && (() => {
          const matOpts = materialGroup.options
          const addonOpts = addonsGroup.options
          const serviceTypeLabel = flowPath === 'addons_only'
            ? 'Add-ons only (no roof replacement)'
            : serviceTypeGroup.options.find(o => o.id === selectedServiceType)?.label
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
                  {flowPath === 'addons_only' ? (
                    roofMeasurement.perimeterFt ? (
                      <p className="text-sm text-foreground">
                        ~{roofMeasurement.perimeterFt.toLocaleString()} lin ft perimeter
                      </p>
                    ) : null
                  ) : (
                    <>
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
                    </>
                  )}
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
                    const opt = addonOpts.find(o => o.id === id)
                    const label = opt ? addonOptionLabel(opt) : id
                    const linFt = ADDON_LINEAR_FT_IDS.includes(id) ? addonLinearFt[id] : undefined
                    const showGutterBreakdown = id === 'gutters' && gutterFloors !== null && !!linFt
                    const perimeter = Number(linFt ?? 0) || 0
                    const perFloorReview = gutterFloors ? GUTTER_DROP_FT_BY_FLOORS[gutterFloors] : 0
                    const totalLinFt = computeGutterTotalLinFt(
                      perimeter,
                      gutterFloors ? { floors: gutterFloors, drops: gutterDrops } : undefined,
                    )
                    return (
                      <div key={id}>
                        <p className="text-sm text-foreground">
                          {label}{linFt ? ` — ${showGutterBreakdown ? totalLinFt.toLocaleString() : linFt} lin ft` : ''}
                        </p>
                        {showGutterBreakdown && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {perimeter.toLocaleString()} perimeter + {gutterDrops} drop{gutterDrops === 1 ? '' : 's'} × {perFloorReview} ft for {gutterFloors === 1 ? '1-story' : '2-story'}
                          </p>
                        )}
                      </div>
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
