import { useCallback, useEffect, useState } from 'react'
import { PITCHED_WASTE_FACTOR } from '@/lib/roof-pricing'
import { useFeatureFlagsStore } from '@/stores/feature-flags-store'
import { Loader2, MapPin, Home, RotateCcw } from 'lucide-react'
import { evalPitchedOmittedTriggered } from '@/lib/roof-area-math'
import { classifyRoofSegments, reconcileSplit, SQM_TO_SQFT } from '@/lib/roof-segment-classify'
import { computePerimeterFt } from '@/lib/roof-perimeter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { RoofMeasurementBreakdownCard } from '@/components/shared/roof-measurement-breakdown-card'
import { usePlacesAutocomplete } from '@/hooks/use-places-autocomplete'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoofMaterialKey = 'shingle' | 'barrel_tile' | 'metal' | 'aluminum' | 'flat_roof'

export interface RoofWizardResult {
  address: string
  areaSqft: number
  pitch: string
  material: RoofMaterialKey  // dominant material; 'flat_roof' only when flat is selected alone
  hasFlatSection?: boolean   // true when flat roof is selected alongside a pitched material
  // Split areas populated when Solar segments are available. Used by pricing
  // engine to bill each material against its own slice (pitched vs flat).
  // Optional/nullable for widen-reads-narrow-writes on legacy items.
  pitchedAreaSqft?: number
  flatAreaSqft?: number
  // Available for gutter/fascia/soffit downstream consumption when those
  // config questions gain a linear-feet input field.
  perimeterFt: number
  // When true (default), the roof-material order (pitched + flat shingles or
  // membrane) is included in the cart. When false, the cart skips material
  // line items and the price drops to perimeter-only add-ons.
  includeMaterialOrder?: boolean
  // When true (default), perimeter-priced add-ons (gutters, fascia, soffit)
  // are included. When false, those line items are skipped.
  includePerimeter?: boolean
  // When true (default), the flat-area slice (membrane) is part of the
  // Material Order bundle. When false, flat is excluded from totals + cost
  // even though Material Order itself is ON.
  includeFlatArea?: boolean
}

interface MeasurementData {
  areaSqft: number
  wasteSqft: number
  pitch: string
  perimeterFt: number
  pitchedAreaSqft: number
  flatAreaSqft: number
  isMock?: boolean
  wholeRoofDivergencePct?: number
}

// Threshold for the segment-sum vs whole-roof divergence catch. Tripping this
// surfaces a warning that routes the homeowner to "Adjust roof area" so the
// downstream price math doesn't silently undercount.
const DIVERGENCE_WARN_THRESHOLD = 0.02

// TODO(consolidate): same divergence calc lives in
// src/lib/satellite-measure/roofing.ts as computeDivergencePct. Cleanup arc
// owned by kratos — pure-math helper, low-risk to fold into
// roof-segment-classify alongside reconcileSplit when a follow-up has space.
function computeDivergencePct(wholeSqft: number, segSumSqft: number): number {
  if (!Number.isFinite(wholeSqft) || wholeSqft <= 0) return 0
  if (!Number.isFinite(segSumSqft)) return 0
  return Math.min(1, Math.abs(wholeSqft - segSumSqft) / wholeSqft)
}

// ─── Measurement helper ───────────────────────────────────────────────────────
// Stage 1: Google Geocoding API → lat/lng + normalized address
// Stage 2: Google Solar API buildingInsights:findClosest → roof area + pitch
// Swap body only when API key / endpoint changes; UI layer is unchanged.

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string

function degreesToPitch(deg: number): string {
  const rise = 12 * Math.tan((deg * Math.PI) / 180)
  const rounded = Math.round(rise * 2) / 2  // nearest 0.5
  return `${rounded}/12`
}

// Mock measurement returned when Google Geocoding or Solar API can't resolve
// the input. Keeps the wizard flow unblocked for the homeowner — they can
// still proceed to the material/config steps with a reasonable default and
// adjust the area manually in step 2.
function mockMeasurement(address: string): MeasurementData & { canonicalAddress?: string } {
  return {
    areaSqft: 2000,
    wasteSqft: 2240,
    pitch: '4/12',
    perimeterFt: 180,
    pitchedAreaSqft: 2000,
    flatAreaSqft: 0,
    isMock: true,
    canonicalAddress: address,
  }
}

async function measureRoofFromAddress(address: string): Promise<MeasurementData & { canonicalAddress?: string }> {
  // Stage 1: Geocode — fall back to mock if no result so the wizard never blocks.
  let geoJson: { status: string; results: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }> }
  try {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${MAPS_KEY}`,
    )
    geoJson = await geoRes.json()
  } catch {
    return mockMeasurement(address)
  }
  if (geoJson.status !== 'OK' || !geoJson.results.length) {
    return mockMeasurement(address)
  }
  const { lat, lng } = geoJson.results[0].geometry.location
  const canonicalAddress = geoJson.results[0].formatted_address

  // Stage 2: Solar API — fall back to mock on any failure mode.
  try {
    const solarRes = await fetch(
      `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&key=${MAPS_KEY}`,
    )
    if (solarRes.status === 404 || !solarRes.ok) {
      return { ...mockMeasurement(address), canonicalAddress }
    }
    const solarJson = await solarRes.json() as {
      boundingBox?: { sw: { latitude: number; longitude: number }; ne: { latitude: number; longitude: number } }
      solarPotential: {
        wholeRoofStats: { areaMeters2: number }
        roofSegmentStats: Array<{ pitchDegrees: number; stats: { areaMeters2: number } }>
        imageryQuality: 'HIGH' | 'MEDIUM' | 'LOW'
      }
    }

    const { imageryQuality, wholeRoofStats, roofSegmentStats } = solarJson.solarPotential
    console.debug('[Solar]', canonicalAddress, { imageryQuality, areaM2: wholeRoofStats.areaMeters2 })

    if (imageryQuality === 'LOW') {
      return { ...mockMeasurement(address), canonicalAddress }
    }

    const areaM2 = wholeRoofStats.areaMeters2
    const areaSqft = Math.round(areaM2 * SQM_TO_SQFT)
    const wasteSqft = Math.round(areaSqft * PITCHED_WASTE_FACTOR)

    // Area-weighted average pitch across all roof segments
    const totalArea = roofSegmentStats.reduce((s, seg) => s + seg.stats.areaMeters2, 0)
    const weightedDeg = roofSegmentStats.reduce(
      (s, seg) => s + seg.pitchDegrees * (seg.stats.areaMeters2 / totalArea),
      0,
    )
    const pitch = degreesToPitch(weightedDeg)

    const perimeterFt = computePerimeterFt(solarJson.boundingBox, areaSqft)

    // Raw classify → divergence on raw (so the warning surface still fires
    // when Solar under-covered) → reconcile to wholeRoofStats so the values
    // consumed by RoofMeasurementBreakdownCard + chip-tap material seed +
    // service-detail handleWizardComplete sum to areaSqft. Mirrors the
    // library measureRoofFromCoords path; primitive is shared via
    // @/lib/roof-segment-classify per PR-181 follow-up.
    const rawSplit = classifyRoofSegments(roofSegmentStats)
    const wholeRoofDivergencePct = computeDivergencePct(areaSqft, rawSplit.pitchedAreaSqft + rawSplit.flatAreaSqft)
    const { pitchedAreaSqft, flatAreaSqft } = reconcileSplit(rawSplit, areaSqft)

    return { areaSqft, wasteSqft, pitch, perimeterFt, pitchedAreaSqft, flatAreaSqft, wholeRoofDivergencePct, canonicalAddress }
  } catch {
    return { ...mockMeasurement(address), canonicalAddress }
  }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 pt-1 pb-3">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={
            n === current
              ? 'h-1.5 w-8 rounded-full bg-primary transition-all'
              : n < current
                ? 'h-1.5 w-6 rounded-full bg-primary/50 transition-all'
                : 'h-1.5 w-6 rounded-full bg-muted transition-all'
          }
        />
      ))}
      <span className="ml-2 text-[11px] text-muted-foreground">
        Step {current} of {total}
      </span>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  defaultAddress: string
  onComplete: (result: RoofWizardResult) => void
  flowPath?: 'full_replacement' | 'addons_only' | null
  // Material is sourced from the chip-tap selection on service-detail; the
  // wizard reads it as a prop to drive dominantMaterial on save. Material
  // picking lives on the chip-tap surface; the modal is measurement-only.
  material?: Exclude<RoofMaterialKey, 'flat_roof'> | null
  hasFlatSection?: boolean
}

export function RoofMeasurementWizard({ open, onClose, defaultAddress, onComplete, flowPath, material = null, hasFlatSection = false }: Props) {
  const gmpEnabled = useFeatureFlagsStore((s) => s.getFlag('googleMapsPlatform'))
  const [step, setStep] = useState(1)
  const [address, setAddress] = useState(defaultAddress)
  const [measuring, setMeasuring] = useState(false)
  const [measureError, setMeasureError] = useState(false)
  const [measureErrorMsg, setMeasureErrorMsg] = useState('')
  const [measurement, setMeasurement] = useState<MeasurementData | null>(null)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjArea, setAdjArea] = useState('')
  const [adjPitch, setAdjPitch] = useState('')
  const [adjFlatArea, setAdjFlatArea] = useState('')
  const [adjPerimeterFt, setAdjPerimeterFt] = useState('')

  const setAddressInputRef = usePlacesAutocomplete(gmpEnabled, MAPS_KEY, setAddress)

  // Internal measurement runner — accepts an explicit address arg so the open
  // auto-trigger can call it without depending on the (just-set) `address`
  // state's timing. The Step 1 fallback button calls runMeasurement(address).
  const runMeasurement = useCallback(async (addr: string) => {
    if (!addr.trim()) return
    setStep(2)
    setMeasureError(false)
    setMeasureErrorMsg('')
    if (!gmpEnabled) {
      setMeasureErrorMsg('Satellite measurement is disabled — please enter your measurements manually.')
      setMeasureError(true)
      return
    }
    setMeasuring(true)
    try {
      const result = await measureRoofFromAddress(addr.trim())
      if (result.canonicalAddress) setAddress(result.canonicalAddress)
      setMeasurement({ areaSqft: result.areaSqft, wasteSqft: result.wasteSqft, pitch: result.pitch, perimeterFt: result.perimeterFt, pitchedAreaSqft: result.pitchedAreaSqft, flatAreaSqft: result.flatAreaSqft, wholeRoofDivergencePct: result.wholeRoofDivergencePct })
      setAdjArea(String(Math.max(0, result.areaSqft - (result.flatAreaSqft || 0))))
      setAdjPitch(result.pitch)
      setAdjFlatArea(String(result.flatAreaSqft))
      setAdjPerimeterFt(String(result.perimeterFt))
      // Include-flat default stays OFF on measurement complete — user opts in
      // explicitly via the breakdown-card toggle when they want flat priced.
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'Could not find address') {
        setMeasureErrorMsg("We couldn't find that address — try again.")
        setStep(1)
      } else if (msg === 'NO_BUILDING') {
        setMeasureErrorMsg("Couldn't measure — no building found at that address. Enter manually.")
        setMeasureError(true)
      } else if (msg === 'LOW_QUALITY') {
        setMeasureErrorMsg("Couldn't get a clear satellite image — please enter manually.")
        setMeasureError(true)
      } else {
        setMeasureErrorMsg("Measurement service unavailable — please enter manually.")
        setMeasureError(true)
      }
    } finally {
      setMeasuring(false)
    }
  }, [gmpEnabled, material])

  useEffect(() => {
    if (!open) return
    setAddress(defaultAddress)
    setMeasuring(false)
    setMeasureError(false)
    setMeasureErrorMsg('')
    setMeasurement(null)
    setShowAdjust(false)
    setAdjFlatArea('')
    setAdjPerimeterFt('')
    setStep(1)
  }, [open, defaultAddress])

  const startMeasuring = () => {
    void runMeasurement(address)
  }

  const canSave = !!measurement || (measureError && !!adjArea.trim() && !!adjPitch.trim())

  // adjArea = pitched-only footprint (not total). flat is additive on top.
  const finalArea = adjArea
    ? Math.max(100, Number(adjArea) || 0)
    : measurement
      ? Math.max(0, (measurement.areaSqft || 0) - (measurement.flatAreaSqft || 0))
      : 0
  const finalFlatAreaSqft = measurement ? Math.max(0, Number(adjFlatArea) || 0) : 0
  const finalPitch = adjPitch || (measurement?.pitch ?? '')
  const derivedPitchedAreaSqft = finalArea

  const wizardPitchedOmittedTriggered = evalPitchedOmittedTriggered({
    pitchedAreaSqft: derivedPitchedAreaSqft,
    flatAreaSqft: finalFlatAreaSqft,
    hasPitchedMaterialSelected: material !== null,
  })

  // Modal preview override: when the user opens the wizard before chip-tapping
  // any material on the page (material === null && !hasFlatSection), the
  // breakdown card's pitchedOmittedTriggered warning is suppressed so the
  // first-open view shows real numbers instead of the red NOT-INCLUDED frame.
  // handleComplete still uses the real material prop at cart-commit time.
  const noChipTapYet = material === null && !hasFlatSection
  const previewPitchedOmittedTriggered = noChipTapYet ? false : wizardPitchedOmittedTriggered

  const handleComplete = () => {
    if (!canSave) return
    // Material is sourced from chip-tap (the SoT). When the modal is opened
    // before any material chip is picked, fall back to flat_roof so legacy
    // dormant callers (roofing-wizard.tsx) keep working.
    const dominantMaterial: RoofMaterialKey = material ?? 'flat_roof'
    const hasFlatAlongPitched = material !== null && hasFlatSection
    // Pass through RAW measurements regardless of chip-tap intent. Service-detail
    // evalPitchedOmittedTriggered + cart-side IIFE are SoT for what reaches the
    // cart payload. Stripping at source defeats the under-quote gate evaluator
    // (it would read the zeroed value and never fire).
    const pitchedSqftOut = Math.round(derivedPitchedAreaSqft)
    const flatSqftOut = Math.round(finalFlatAreaSqft)
    const areaSqftOut = pitchedSqftOut + flatSqftOut
    onComplete({
      address: address.trim(),
      areaSqft: areaSqftOut,
      pitch: finalPitch,
      material: dominantMaterial,
      hasFlatSection: hasFlatAlongPitched,
      perimeterFt: Number(adjPerimeterFt) || (measurement?.perimeterFt ?? 0),
      pitchedAreaSqft: measurement ? pitchedSqftOut : undefined,
      flatAreaSqft: measurement ? flatSqftOut : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            Roof Measurement
          </DialogTitle>
          <DialogDescription className="sr-only">
            Measure your roof and pre-fill your configuration.
          </DialogDescription>
        </DialogHeader>

        <StepBar current={step} total={2} />

        <div className="py-1">
          {/* ── Step 1: Address ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground mb-0.5">What's the property address?</p>
                <p className="text-[13px] text-muted-foreground mb-3">
                  We'll measure your roof from satellite imagery.
                </p>
                <Label className="mb-1.5 block text-xs">Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    ref={setAddressInputRef}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-base ring-offset-background placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="1234 Coral Way, Miami, FL 33145"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && address.trim() && startMeasuring()}
                    autoFocus
                  />
                </div>
                {measureErrorMsg && step === 1 && (
                  <p className="mt-2 text-xs text-destructive">{measureErrorMsg}</p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" disabled={!address.trim()} onClick={startMeasuring}>
                  Measure My Roof →
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Measurement ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground mb-0.5">Measuring your roof…</p>
                <p className="text-[13px] text-muted-foreground mb-4 truncate">{address}</p>
              </div>

              {measuring && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Analyzing satellite data…</p>
                </div>
              )}

              {measureError && !measuring && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-3">
                  <p>{measureErrorMsg || "Couldn't measure — enter manually."}</p>
                  <div className="space-y-2">
                    <div>
                      <Label className="mb-1 block text-xs">Roof Area (sq ft)</Label>
                      <Input value={adjArea} onChange={(e) => setAdjArea(e.target.value)} placeholder="e.g. 1800" />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Roof Pitch</Label>
                      <Input value={adjPitch} onChange={(e) => setAdjPitch(e.target.value)} placeholder="e.g. 4/12" />
                    </div>
                  </div>
                </div>
              )}

              {measurement && !measuring && (
                <div className="space-y-3">
                  {measurement.isMock && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 text-[12px] text-amber-800 dark:text-amber-300">
                      Satellite data wasn't available for this address — measurements below are estimates. Tap <span className="font-semibold">Adjust manually</span> to correct them before continuing.
                    </div>
                  )}
                  {/* TODO(refine): suppression-when-actually-overridden vs
                      suppression-while-panel-open. Current gate is
                      !showAdjust because adjArea pre-fills to pitched-base on
                      measurement complete, making the adjArea===0 gate
                      dead-code. Revisit post-launch if !showAdjust feels
                      noisy (e.g. user opens panel to look but doesn't edit). */}
                  {!measurement.isMock
                    && measurement.wholeRoofDivergencePct !== undefined
                    && measurement.wholeRoofDivergencePct > DIVERGENCE_WARN_THRESHOLD
                    && !showAdjust && (
                    <div
                      role="alert"
                      data-testid="solar-divergence-warning"
                      className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 text-[12px] text-amber-800 dark:text-amber-300 space-y-2"
                    >
                      <p>
                        Satellite read came in <span className="font-semibold">{Math.round(measurement.wholeRoofDivergencePct * 100)}% smaller</span> than your home's footprint.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAdjust(true)}
                        className="text-[12px] font-semibold underline underline-offset-2 hover:no-underline"
                      >
                        Adjust roof area
                      </button>
                    </div>
                  )}
                  <RoofMeasurementBreakdownCard
                    pitchedAreaSqft={Math.round(derivedPitchedAreaSqft)}
                    flatAreaSqft={Math.round(finalFlatAreaSqft)}
                    pitch={showAdjust ? (adjPitch || measurement.pitch) : measurement.pitch}
                    perimeterFt={Number(adjPerimeterFt) || measurement.perimeterFt}
                    includeMaterialOrder={true}
                    includePerimeter={true}
                    includeFlatArea={true}
                    pitchedOmittedTriggered={previewPitchedOmittedTriggered}
                    flowPath={flowPath ?? null}
                    source="wizard-step2"
                  />

                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                    onClick={() => setShowAdjust((v) => !v)}
                  >
                    {showAdjust ? 'Hide adjustments' : 'Adjust manually'}
                  </button>
                  {showAdjust && (
                    <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium">Manual adjustment</p>
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                          onClick={() => {
                            setAdjArea(String(measurement!.areaSqft))
                            setAdjPitch(measurement!.pitch)
                            setAdjFlatArea(String(measurement!.flatAreaSqft))
                            setAdjPerimeterFt(String(measurement!.perimeterFt))
                          }}
                        >
                          <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="mb-1 block text-xs">Pitched area (sq ft)</Label>
                          <Input value={adjArea} onChange={(e) => setAdjArea(e.target.value)} placeholder="e.g. 1800" className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs">Pitch</Label>
                          <Input value={adjPitch} onChange={(e) => setAdjPitch(e.target.value)} placeholder="e.g. 4/12" className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs">Flat (sq ft)</Label>
                          <Input value={adjFlatArea} onChange={(e) => setAdjFlatArea(e.target.value)} placeholder="0" className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs">Perimeter (lin ft)</Label>
                          <Input value={adjPerimeterFt} onChange={(e) => setAdjPerimeterFt(e.target.value)} placeholder="e.g. 180" className="h-8 text-sm" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!measuring && (measurement || measureError) && (
                <div className="flex justify-between gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)}>← Back</Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                    <Button
                      size="default"
                      disabled={!canSave}
                      onClick={handleComplete}
                      className="h-12 px-6 text-sm font-semibold"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
