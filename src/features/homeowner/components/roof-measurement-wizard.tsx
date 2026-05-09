import { useCallback, useEffect, useRef, useState } from 'react'
import { ROOF_WASTE_FACTOR } from '@/lib/roof-pricing'
import { useFeatureFlagsStore } from '@/stores/feature-flags-store'
import { Loader2, MapPin, Home, RotateCcw } from 'lucide-react'
import { evalPitchedOmittedTriggered } from '@/lib/roof-area-math'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { RoofMeasurementBreakdownCard } from '@/components/shared/roof-measurement-breakdown-card'

// ─── Places Autocomplete hook ────────────────────────────────────────────────
// Loads the Maps JS SDK once (idempotent), then binds google.maps.places.Autocomplete
// to the input element passed via ref. On place selection, calls onPlace with the
// canonical formatted_address. No-ops when GMP is disabled (falls through to plain input).

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any
  }
}

const GMAPS_SCRIPT_ID = 'gmaps-places-sdk'

function loadMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.maps?.places) { resolve(); return }
    const existing = document.getElementById(GMAPS_SCRIPT_ID)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      return
    }
    const script = document.createElement('script')
    script.id = GMAPS_SCRIPT_ID
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
}

function usePlacesAutocomplete(
  enabled: boolean,
  apiKey: string,
  onPlace: (formatted: string) => void,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const acRef = useRef<{ unbind: () => void } | null>(null)

  const bind = useCallback(() => {
    const el = inputRef.current
    if (!el || acRef.current || !window.google?.maps?.places) return
    const ac = new window.google.maps.places.Autocomplete(el, {
      types: ['address'],
      fields: ['formatted_address'],
    })
    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (place?.formatted_address) onPlace(place.formatted_address)
    })
    acRef.current = {
      unbind: () => {
        window.google?.maps?.event?.removeListener(listener)
        acRef.current = null
      },
    }
  }, [onPlace])

  // Load SDK and bind on mount when enabled
  useEffect(() => {
    if (!enabled || !apiKey) return
    loadMapsScript(apiKey).then(bind)
    return () => { acRef.current?.unbind() }
  }, [enabled, apiKey, bind])

  // Re-bind when the input element re-mounts (step changes cause unmount/remount)
  const setInputRef = useCallback((el: HTMLInputElement | null) => {
    ;(inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
    if (el && enabled && window.google?.maps?.places) bind()
  }, [enabled, bind])

  return setInputRef
}

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
  // When true, flat area is included in cart (pitched 2% + flat 1% waste).
  // When false, areaSqft = pitched only, flatAreaSqft = 0.
  includeFlat?: boolean
}

interface MeasurementData {
  areaSqft: number
  wasteSqft: number
  pitch: string
  perimeterFt: number
  pitchedAreaSqft: number
  flatAreaSqft: number
  isMock?: boolean
}

// ─── Measurement helper ───────────────────────────────────────────────────────
// Stage 1: Google Geocoding API → lat/lng + normalized address
// Stage 2: Google Solar API buildingInsights:findClosest → roof area + pitch
// Swap body only when API key / endpoint changes; UI layer is unchanged.

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string

// Segments with pitchDegrees < 5° are classified as flat deck (industry
// "low slope" is <2:12 ≈ 9.46°; 5° is conservative so gray-zone low-pitch
// shingle areas stay in the pitched bucket). 5°–9° goes to pitched.
const FLAT_PITCH_THRESHOLD_DEG = 5
const SQM_TO_SQFT = 10.7639

interface RoofSegmentStat { pitchDegrees: number; stats: { areaMeters2: number } }

function classifyAndSumSegments(segments: RoofSegmentStat[]) {
  let pitchedSqm = 0
  let flatSqm = 0
  for (const seg of segments) {
    if (seg.pitchDegrees < FLAT_PITCH_THRESHOLD_DEG) flatSqm += seg.stats.areaMeters2
    else pitchedSqm += seg.stats.areaMeters2
  }
  // Dev-mode math sanity: pitchedSqft + flatSqft should equal total within 1 sqft
  if (import.meta.env.DEV) {
    const totalSqft = Math.round((pitchedSqm + flatSqm) * SQM_TO_SQFT)
    const pitchedSqft = Math.round(pitchedSqm * SQM_TO_SQFT)
    const flatSqft = Math.round(flatSqm * SQM_TO_SQFT)
    console.assert(
      Math.abs(pitchedSqft + flatSqft - totalSqft) <= 1,
      `[roof-split] sum mismatch: ${pitchedSqft} + ${flatSqft} ≠ ${totalSqft}`,
    )
  }
  return {
    pitchedAreaSqft: Math.round(pitchedSqm * SQM_TO_SQFT),
    flatAreaSqft: Math.round(flatSqm * SQM_TO_SQFT),
  }
}

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
      solarPotential: {
        wholeRoofStats: { areaMeters2: number }
        roofSegmentStats: Array<{ pitchDegrees: number; stats: { areaMeters2: number } }>
        imageryQuality: 'HIGH' | 'MEDIUM' | 'LOW'
        buildingStats?: { areaMeters2: number }
      }
    }

    const { imageryQuality, wholeRoofStats, roofSegmentStats, buildingStats } = solarJson.solarPotential
    console.debug('[Solar]', canonicalAddress, { imageryQuality, areaM2: wholeRoofStats.areaMeters2 })

    if (imageryQuality === 'LOW') {
      return { ...mockMeasurement(address), canonicalAddress }
    }

    const areaM2 = wholeRoofStats.areaMeters2
    const areaSqft = Math.round(areaM2 * SQM_TO_SQFT)
    const wasteSqft = Math.round(areaSqft * ROOF_WASTE_FACTOR)

    // Area-weighted average pitch across all roof segments
    const totalArea = roofSegmentStats.reduce((s, seg) => s + seg.stats.areaMeters2, 0)
    const weightedDeg = roofSegmentStats.reduce(
      (s, seg) => s + seg.pitchDegrees * (seg.stats.areaMeters2 / totalArea),
      0,
    )
    const pitch = degreesToPitch(weightedDeg)

    // Rectangular approximation: perim = 5 * sqrt(footprint / 1.5), typical 3:2 aspect ratio
    const footprintM2 = buildingStats?.areaMeters2 ?? (areaM2 / 1.3)  // fallback: deflate roof area
    const perimeterFt = Math.round(5 * Math.sqrt(footprintM2 / 1.5) * 3.28084)

    const { pitchedAreaSqft, flatAreaSqft } = classifyAndSumSegments(roofSegmentStats)

    return { areaSqft, wasteSqft, pitch, perimeterFt, pitchedAreaSqft, flatAreaSqft, canonicalAddress }
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
  // wizard reads it as a prop to drive includeFlat default + dominantMaterial
  // on save. Material picking lives on the chip-tap surface; the modal is
  // measurement-only.
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
  const [includeFlat, setIncludeFlat] = useState(false)
  // Inline pencil-edit overrides for AREA BREAKDOWN. Override input is RAW;
  // display is POST-WASTE; cart payload is RAW (uniform with satellite path).
  const [editingFlat, setEditingFlat] = useState(false)
  const [editingPitched, setEditingPitched] = useState(false)

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
      setMeasurement({ areaSqft: result.areaSqft, wasteSqft: result.wasteSqft, pitch: result.pitch, perimeterFt: result.perimeterFt, pitchedAreaSqft: result.pitchedAreaSqft, flatAreaSqft: result.flatAreaSqft })
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
    setEditingFlat(false)
    setEditingPitched(false)
    // Include-flat defaults OFF on every open. User opts in explicitly via the
    // breakdown-card toggle when they want flat priced — covers regular pitched
    // jobs (the common case) where flat detection shouldn't inflate totals.
    setIncludeFlat(false)
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
      includeFlat,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
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
                  <RoofMeasurementBreakdownCard
                    pitchedAreaSqft={Math.round(derivedPitchedAreaSqft)}
                    flatAreaSqft={Math.round(finalFlatAreaSqft)}
                    pitch={showAdjust ? (adjPitch || measurement.pitch) : measurement.pitch}
                    perimeterFt={Number(adjPerimeterFt) || measurement.perimeterFt}
                    material={material}
                    includeFlat={includeFlat}
                    hasFlatSection={hasFlatSection}
                    pitchedOmittedTriggered={wizardPitchedOmittedTriggered}
                    flowPath={flowPath ?? null}
                    source="wizard-step2"
                    onToggleFlat={setIncludeFlat}
                    editing={{
                      pitched: {
                        active: editingPitched,
                        rawValue: adjArea,
                        onChange: setAdjArea,
                        onStart: () => setEditingPitched(true),
                        onDone: () => setEditingPitched(false),
                      },
                      flat: {
                        active: editingFlat,
                        rawValue: adjFlatArea,
                        onChange: setAdjFlatArea,
                        onStart: () => setEditingFlat(true),
                        onDone: () => setEditingFlat(false),
                      },
                    }}
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
                      size="sm"
                      disabled={!canSave}
                      onClick={handleComplete}
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
