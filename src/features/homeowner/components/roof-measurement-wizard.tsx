import { useCallback, useEffect, useRef, useState } from 'react'
import { sqftToSquares } from '@/lib/option-metadata'
import { ROOF_WASTE_FACTOR } from '@/lib/roof-pricing'
import { useFeatureFlagsStore } from '@/stores/feature-flags-store'
import { Loader2, RotateCcw, MapPin, Ruler, Layers, Home, CheckCircle2 } from 'lucide-react'
import { computeRoofTotal } from '@/lib/roof-area-math'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

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

export type RoofMaterialKey = 'shingle' | 'barrel_tile' | 'metal' | 'flat_roof'

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
  // Permit choice — mandatory, set by Step 3 radio selection.
  // 'no' makes this project cash-only (financing unavailable).
  permit: 'yes' | 'no'
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

// ─── Material options ─────────────────────────────────────────────────────────

interface MaterialOption {
  key: RoofMaterialKey
  label: string
  sub: string
}

const MATERIAL_OPTIONS: MaterialOption[] = [
  { key: 'metal',      label: 'Metal',       sub: 'Standing seam, 50+ years' },
  { key: 'shingle',    label: 'Shingle',     sub: 'Architectural, 25–30 years' },
  { key: 'barrel_tile', label: 'Tile',       sub: 'Barrel tile, classic FL look' },
]

// Flat Roof is a separate checkbox-style card — selectable alone OR alongside one pitched material
const FLAT_ROOF_OPTION: MaterialOption = { key: 'flat_roof', label: 'Flat Roof', sub: 'Low-slope commercial-style' }

// ─── Stepper bar ──────────────────────────────────────────────────────────────

function StepBar({ step }: { step: number }) {
  return (
    <div className="space-y-1.5 mb-5">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              n <= step ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground font-medium">Step {step} of 4</p>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  defaultAddress: string
  onComplete: (result: RoofWizardResult) => void
}

export function RoofMeasurementWizard({ open, onClose, defaultAddress, onComplete }: Props) {
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
  const [material, setMaterial] = useState<Exclude<RoofMaterialKey, 'flat_roof'> | null>(null)
  const [flatSelected, setFlatSelected] = useState(false)
  const [permit, setPermit] = useState<'yes' | 'no' | null>(null)

  const setAddressInputRef = usePlacesAutocomplete(gmpEnabled, MAPS_KEY, setAddress)

  useEffect(() => {
    if (open) {
      setStep(1)
      setAddress(defaultAddress)
      setMeasuring(false)
      setMeasureError(false)
      setMeasureErrorMsg('')
      setMeasurement(null)
      setShowAdjust(false)
      setAdjFlatArea('')
      setAdjPerimeterFt('')
      setIncludeFlat(false)
      setMaterial(null)
      setFlatSelected(false)
      setPermit(null)
    }
  }, [open, defaultAddress])

  const anyMaterialSelected = material !== null || flatSelected
  const stepThreeComplete = anyMaterialSelected && permit !== null

  const startMeasuring = async () => {
    if (!address.trim()) return
    setStep(2)
    setMeasureError(false)
    setMeasureErrorMsg('')
    // If Google Maps Platform is OFF, skip the API call and fall through to manual entry
    if (!gmpEnabled) {
      setMeasureErrorMsg('Satellite measurement is disabled — please enter your measurements manually.')
      setMeasureError(true)
      return
    }
    setMeasuring(true)
    try {
      const result = await measureRoofFromAddress(address.trim())
      if (result.canonicalAddress) setAddress(result.canonicalAddress)
      setMeasurement({ areaSqft: result.areaSqft, wasteSqft: result.wasteSqft, pitch: result.pitch, perimeterFt: result.perimeterFt, pitchedAreaSqft: result.pitchedAreaSqft, flatAreaSqft: result.flatAreaSqft })
      setAdjArea(String(result.areaSqft))
      setAdjPitch(result.pitch)
      setAdjFlatArea(String(result.flatAreaSqft))
      setAdjPerimeterFt(String(result.perimeterFt))
      setIncludeFlat(result.flatAreaSqft > 0)
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
  }

  const finalArea = adjArea ? Math.max(100, Number(adjArea) || 0) : (measurement?.areaSqft ?? 0)
  const finalWaste = Math.round(finalArea * ROOF_WASTE_FACTOR)
  const finalPitch = adjPitch || (measurement?.pitch ?? '')
  const finalFlatAreaSqft = measurement
    ? Math.min(Math.max(0, Number(adjFlatArea) || 0), finalArea)
    : 0
  const derivedPitchedAreaSqft = Math.max(0, finalArea - finalFlatAreaSqft)

  const handleComplete = () => {
    if (!stepThreeComplete || !permit) return
    const dominantMaterial: RoofMaterialKey = material ?? 'flat_roof'
    const hasFlatSection = material !== null && flatSelected
    onComplete({
      address: address.trim(),
      areaSqft: includeFlat ? finalArea : Math.round(derivedPitchedAreaSqft),
      pitch: finalPitch,
      material: dominantMaterial,
      hasFlatSection,
      perimeterFt: Number(adjPerimeterFt) || (measurement?.perimeterFt ?? 0),
      // Persist split areas so pricing engine can bill each material
      // against its own slice. Undefined when manual entry (no Solar data).
      pitchedAreaSqft: measurement ? Math.round(derivedPitchedAreaSqft) : undefined,
      flatAreaSqft: measurement ? (includeFlat ? Math.round(finalFlatAreaSqft) : 0) : undefined,
      includeFlat,
      permit,
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
            4-step wizard to measure your roof and pre-fill your configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="py-1">
          <StepBar step={step} />

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
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Layers className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Material Order
                          </span>
                        </div>
                        {(() => {
                          const { totalSqft, totalSquares, pitchedWaste } = computeRoofTotal({
                            pitchedAreaSqft: Math.round(derivedPitchedAreaSqft),
                            flatAreaSqft: Math.round(finalFlatAreaSqft),
                            includeFlat,
                          })
                          return (
                            <>
                              <p className="text-xl font-bold text-foreground">
                                {totalSqft.toLocaleString()}{' '}
                                <span className="text-sm font-normal text-muted-foreground">sqft ({totalSquares} squares)</span>
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Pitched: {Math.round(derivedPitchedAreaSqft).toLocaleString()} sqft + 2% waste ({pitchedWaste.toLocaleString()} sqft)
                              </p>
                            </>
                          )
                        })()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Ruler className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Roof Pitch
                          </span>
                        </div>
                        <p className="text-xl font-bold text-foreground">
                          {showAdjust ? (adjPitch || measurement.pitch) : measurement.pitch}
                        </p>
                      </div>
                    </div>
                    <div className="border-t pt-3">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Ruler className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Roof Perimeter
                        </span>
                      </div>
                      <p className="text-xl font-bold text-foreground">
                        ~{measurement.perimeterFt.toLocaleString()}{' '}
                        <span className="text-sm font-normal text-muted-foreground">lin ft</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Used for gutter, fascia, and soffit estimates
                      </p>
                    </div>
                    {measurement.pitchedAreaSqft !== undefined && (measurement.pitchedAreaSqft > 0 || measurement.flatAreaSqft > 0) && (
                      <div className="border-t pt-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Area Breakdown
                          </span>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="include-flat" className="text-xs text-muted-foreground">Include flat area</Label>
                            <Switch
                              id="include-flat"
                              checked={includeFlat}
                              onCheckedChange={setIncludeFlat}
                            />
                          </div>
                        </div>
                        {/* Flat area */}
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Flat Area</span>
                          <p className="text-xl font-bold text-foreground mt-0.5">
                            {Math.round(finalFlatAreaSqft * 1.01).toLocaleString()}{' '}
                            <span className="text-sm font-normal text-muted-foreground">
                              sqft ({Math.ceil((finalFlatAreaSqft * 1.01) / 100)} squares)
                            </span>
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Flat: {Math.round(finalFlatAreaSqft).toLocaleString()} sqft + 1% waste
                          </p>
                        </div>
                        {/* Pitched (auto) — unchanged */}
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Pitched (auto)</p>
                          <p className="text-sm font-semibold text-foreground">
                            {derivedPitchedAreaSqft.toLocaleString()} sqft
                          </p>
                        </div>
                        <p className="text-[11px] text-muted-foreground">We estimated the flat area from satellite — adjust if it looks off.</p>
                      </div>
                    )}
                  </div>

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
                          <Label className="mb-1 block text-xs">Area (sq ft)</Label>
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
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
                  <Button
                    size="sm"
                    disabled={measureError && (!adjArea.trim() || !adjPitch.trim())}
                    onClick={() => setStep(3)}
                  >
                    Next →
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Material ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground mb-0.5">What type of roof are you replacing?</p>
                <p className="text-[13px] text-muted-foreground mb-3">
                  Pick the main material. Add Flat Roof if you also have a flat section.
                </p>
              </div>
              {/* Pitched materials — radio behavior: one at a time */}
              <div className="grid grid-cols-2 gap-2">
                {MATERIAL_OPTIONS.map((opt) => {
                  const isSelected = material === opt.key
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setMaterial(isSelected ? null : opt.key as Exclude<RoofMaterialKey, 'flat_roof'>)}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border bg-card hover:bg-muted/40',
                      )}
                    >
                      <p className={cn('text-sm font-semibold', isSelected ? 'text-primary' : 'text-foreground')}>
                        {opt.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{opt.sub}</p>
                    </button>
                  )
                })}
              </div>
              {/* Flat-detection hint — shown when Solar saw flat segments but homeowner hasn't ticked Flat yet */}
              {measurement?.flatAreaSqft !== undefined && measurement.flatAreaSqft > 0 && !flatSelected && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2.5 text-[12px] text-blue-800 dark:text-blue-300">
                  Looks like part of your roof is flat — about {measurement.flatAreaSqft.toLocaleString()} sqft. Tap Flat Roof below to add a separate price for that section.
                </div>
              )}
              {/* Flat Roof — checkbox behavior: independent toggle */}
              <button
                onClick={() => setFlatSelected((v) => !v)}
                className={cn(
                  'w-full rounded-xl border p-3 text-left transition-all',
                  flatSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border bg-card hover:bg-muted/40',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                    flatSelected ? 'border-primary bg-primary' : 'border-border bg-background',
                  )}>
                    {flatSelected && <div className="h-2 w-2 rounded-sm bg-white" />}
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold', flatSelected ? 'text-primary' : 'text-foreground')}>
                      {FLAT_ROOF_OPTION.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{FLAT_ROOF_OPTION.sub}</p>
                  </div>
                </div>
              </button>
              <p className="text-[11px] text-muted-foreground -mt-2 px-1">
                Add Flat Roof if part of the home has a flat section like a porch or garage. The measurement will split into pitched and flat areas automatically.
              </p>

              {/* ── Permit selection ── */}
              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Permit</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'yes' as const, label: 'Yes, pull a permit', sub: 'Required by county. Unlocks financing.' },
                    { value: 'no' as const, label: 'No permit needed', sub: 'Cash, check, or wire only.' },
                  ] as const).map(({ value, label, sub }) => (
                    <button
                      key={value}
                      onClick={() => setPermit(value)}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-all',
                        permit === value
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border bg-card hover:bg-muted/40',
                      )}
                    >
                      <p className={cn('text-sm font-semibold', permit === value ? 'text-primary' : 'text-foreground')}>{label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
                    </button>
                  ))}
                </div>
                {permit === 'no' && (
                  <p className="text-xs text-muted-foreground italic px-0.5">
                    If you choose No Permit, financing won't be available for this project — payment must be made by cash, check, or wire transfer.
                  </p>
                )}
              </div>

              <div className="flex justify-between gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>Back</Button>
                <Button size="sm" disabled={!stepThreeComplete} onClick={() => setStep(4)}>
                  Next →
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Ready ── */}
          {step === 4 && stepThreeComplete && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground mb-0.5">You're all set!</p>
                <p className="text-[13px] text-muted-foreground mb-3">
                  Here's what we'll pre-fill in your configuration.
                </p>
              </div>
              {(() => {
                const hasFlatSection = material !== null && flatSelected
                const pitchedLabel = material ? (MATERIAL_OPTIONS.find((m) => m.key === material)?.label ?? material) : null
                const materialLabel = pitchedLabel && flatSelected
                  ? `${pitchedLabel} + Flat Roof`
                  : pitchedLabel ?? FLAT_ROOF_OPTION.label
                const rows: { label: string; value: string }[] = [
                  { label: 'Address', value: address },
                ]
                if (hasFlatSection && measurement?.pitchedAreaSqft !== undefined) {
                  const pitchedWaste = Math.round(measurement.pitchedAreaSqft * ROOF_WASTE_FACTOR)
                  const flatWaste = Math.round(measurement.flatAreaSqft * ROOF_WASTE_FACTOR)
                  rows.push({ label: 'Pitched section', value: `${measurement.pitchedAreaSqft.toLocaleString()} sqft → ${pitchedWaste.toLocaleString()} sqft w/waste (${sqftToSquares(pitchedWaste)} squares)` })
                  rows.push({ label: 'Flat section', value: `${measurement.flatAreaSqft.toLocaleString()} sqft → ${flatWaste.toLocaleString()} sqft w/waste (${sqftToSquares(flatWaste)} squares)` })
                } else {
                  rows.push({ label: 'Material Order', value: `${finalWaste.toLocaleString()} sqft (${sqftToSquares(finalWaste)} squares)` })
                }
                rows.push({ label: 'Roof Pitch', value: finalPitch })
                if (measurement?.perimeterFt) rows.push({ label: 'Perimeter', value: `~${measurement.perimeterFt.toLocaleString()} lin ft` })
                rows.push({ label: 'Material', value: materialLabel })
                rows.push({ label: 'Permit', value: permit === 'yes' ? 'Yes — permit will be pulled' : 'No permit (cash-only)' })
                return (
                  <div className="rounded-xl border bg-muted/20 divide-y divide-border">
                    {rows.map(({ label, value }) => (
                      <div key={label} className="flex items-start gap-3 px-4 py-2.5">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
                          <p className="text-sm text-foreground font-medium leading-tight">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
              <div className="flex justify-between gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(3)}>Back</Button>
                <Button size="sm" onClick={handleComplete}>
                  Start Configuring →
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
