import { useEffect, useState } from 'react'
import { useFeatureFlagsStore } from '@/stores/feature-flags-store'
import { Loader2, RotateCcw, MapPin, Ruler, Layers, Home, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

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

// Expand common US street-suffix abbreviations so Google Geocoding parses
// them reliably (it usually does, but "Ter" for Terrace is one of the
// shorter forms it sometimes mis-resolves, especially without zip context).
function expandStreetAbbrev(street: string): string {
  return street
    .replace(/\b(ter|ter\.)\b/gi, 'Terrace')
    .replace(/\b(st|st\.)\b/gi, 'Street')
    .replace(/\b(ave|ave\.)\b/gi, 'Avenue')
    .replace(/\b(blvd|blvd\.)\b/gi, 'Boulevard')
    .replace(/\b(dr|dr\.)\b/gi, 'Drive')
    .replace(/\b(rd|rd\.)\b/gi, 'Road')
    .replace(/\b(ln|ln\.)\b/gi, 'Lane')
    .replace(/\b(ct|ct\.)\b/gi, 'Court')
    .replace(/\b(pl|pl\.)\b/gi, 'Place')
    .replace(/\b(pkwy|pkwy\.)\b/gi, 'Parkway')
    .replace(/\b(cir|cir\.)\b/gi, 'Circle')
}

interface AddressParts { street: string; city: string; state: string; zip: string }

async function geocodeOnce(parts: AddressParts) {
  // Use Google's structured components for reliable parsing. address= holds
  // the street; components pin country/state/city/zip so partial street input
  // resolves against the right region.
  const params = new URLSearchParams({
    address: expandStreetAbbrev(parts.street),
    components: [
      'country:US',
      parts.state ? `administrative_area:${parts.state}` : '',
      parts.city ? `locality:${parts.city}` : '',
      parts.zip ? `postal_code:${parts.zip}` : '',
    ].filter(Boolean).join('|'),
    key: MAPS_KEY,
  })
  const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`)
  return await geoRes.json() as {
    status: string
    results: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }>
  }
}

async function measureRoofFromParts(parts: AddressParts): Promise<MeasurementData & { canonicalAddress?: string }> {
  // Stage 1: Structured geocode. Default state to FL when blank
  // (BuildConnect's market is South Florida).
  const normalized: AddressParts = { ...parts, state: parts.state.trim() || 'FL' }
  const geoJson = await geocodeOnce(normalized)
  if (geoJson.status !== 'OK' || !geoJson.results.length) {
    throw new Error('Could not find address')
  }
  const { lat, lng } = geoJson.results[0].geometry.location
  const canonicalAddress = geoJson.results[0].formatted_address

  // Stage 2: Solar API
  const solarRes = await fetch(
    `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&key=${MAPS_KEY}`,
  )
  if (solarRes.status === 404) {
    throw new Error('NO_BUILDING')
  }
  if (!solarRes.ok) {
    console.debug('[Solar] API error', solarRes.status)
    throw new Error('SOLAR_ERROR')
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
    throw new Error('LOW_QUALITY')
  }

  const areaM2 = wholeRoofStats.areaMeters2
  const areaSqft = Math.round(areaM2 * SQM_TO_SQFT)
  const wasteSqft = Math.round(areaSqft * 1.12)

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

// Best-effort split of a single-line address into {street, city, state, zip}.
// Falls back to putting the whole string in `street` when parsing fails.
function splitAddress(input: string): AddressParts {
  const trimmed = input.trim()
  if (!trimmed) return { street: '', city: '', state: '', zip: '' }
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1]
    const m = stateZip.match(/^([A-Za-z]{2})\s*(\d{5})?$/)
    if (m) {
      return { street: parts[0], city: parts[1], state: m[1].toUpperCase(), zip: m[2] ?? '' }
    }
  }
  if (parts.length === 2) {
    return { street: parts[0], city: parts[1], state: '', zip: '' }
  }
  return { street: trimmed, city: '', state: '', zip: '' }
}

export function RoofMeasurementWizard({ open, onClose, defaultAddress, onComplete }: Props) {
  const gmpEnabled = useFeatureFlagsStore((s) => s.getFlag('googleMapsPlatform'))
  const [step, setStep] = useState(1)
  const initialParts = splitAddress(defaultAddress)
  const [street, setStreet] = useState(initialParts.street)
  const [city, setCity] = useState(initialParts.city)
  const [stateCode, setStateCode] = useState(initialParts.state || 'FL')
  const [zip, setZip] = useState(initialParts.zip)
  const [canonicalAddress, setCanonicalAddress] = useState('')
  const [measuring, setMeasuring] = useState(false)
  const [measureError, setMeasureError] = useState(false)
  const [measureErrorMsg, setMeasureErrorMsg] = useState('')
  const [measurement, setMeasurement] = useState<MeasurementData | null>(null)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjArea, setAdjArea] = useState('')
  const [adjPitch, setAdjPitch] = useState('')
  const [material, setMaterial] = useState<Exclude<RoofMaterialKey, 'flat_roof'> | null>(null)
  const [flatSelected, setFlatSelected] = useState(false)

  useEffect(() => {
    if (open) {
      const seed = splitAddress(defaultAddress)
      setStep(1)
      setStreet(seed.street)
      setCity(seed.city)
      setStateCode(seed.state || 'FL')
      setZip(seed.zip)
      setCanonicalAddress('')
      setMeasuring(false)
      setMeasureError(false)
      setMeasureErrorMsg('')
      setMeasurement(null)
      setShowAdjust(false)
      setMaterial(null)
      setFlatSelected(false)
    }
  }, [open, defaultAddress])

  const formAddress = canonicalAddress || [street, city, [stateCode, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const canMeasure = street.trim().length > 0 && city.trim().length > 0 && stateCode.trim().length > 0

  const anyMaterialSelected = material !== null || flatSelected

  const startMeasuring = async () => {
    if (!canMeasure) return
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
      const result = await measureRoofFromParts({ street: street.trim(), city: city.trim(), state: stateCode.trim(), zip: zip.trim() })
      if (result.canonicalAddress) setCanonicalAddress(result.canonicalAddress)
      setMeasurement({ areaSqft: result.areaSqft, wasteSqft: result.wasteSqft, pitch: result.pitch, perimeterFt: result.perimeterFt, pitchedAreaSqft: result.pitchedAreaSqft, flatAreaSqft: result.flatAreaSqft })
      setAdjArea(String(result.areaSqft))
      setAdjPitch(result.pitch)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'Could not find address') {
        setMeasureErrorMsg("Couldn't find that address. Double-check the street, city, state, and zip and try again.")
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

  const finalArea = showAdjust && adjArea ? Math.max(100, Number(adjArea) || 0) : (measurement?.areaSqft ?? 0)
  const finalWaste = showAdjust && adjArea
    ? Math.round(Math.max(100, Number(adjArea) || 0) * 1.12)
    : (measurement?.wasteSqft ?? 0)
  const finalPitch = showAdjust ? (adjPitch || (measurement?.pitch ?? '')) : (measurement?.pitch ?? '')

  const handleComplete = () => {
    if (!anyMaterialSelected) return
    const dominantMaterial: RoofMaterialKey = material ?? 'flat_roof'
    const hasFlatSection = material !== null && flatSelected
    onComplete({
      address: formAddress,
      areaSqft: finalArea,
      pitch: finalPitch,
      material: dominantMaterial,
      hasFlatSection,
      perimeterFt: measurement?.perimeterFt ?? 0,
      // Persist split areas so pricing engine can bill each material
      // against its own slice. Undefined when manual entry (no Solar data).
      pitchedAreaSqft: measurement?.pitchedAreaSqft,
      flatAreaSqft: measurement?.flatAreaSqft,
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
                <div className="space-y-2.5">
                  <div>
                    <Label className="mb-1.5 block text-xs">Street</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        className="pl-9"
                        placeholder="10990 SW 225 Ter"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <Label className="mb-1.5 block text-xs">City</Label>
                      <Input
                        placeholder="Miami"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Zip</Label>
                      <Input
                        placeholder="33170"
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && canMeasure && startMeasuring()}
                        inputMode="numeric"
                        maxLength={5}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">State</Label>
                    <Input
                      placeholder="FL"
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value.toUpperCase().slice(0, 2))}
                      maxLength={2}
                      className="w-20"
                    />
                  </div>
                </div>
                {measureErrorMsg && step === 1 && (
                  <p className="mt-2 text-xs text-destructive">{measureErrorMsg}</p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" disabled={!canMeasure} onClick={startMeasuring}>
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
                <p className="text-[13px] text-muted-foreground mb-4 truncate">{formAddress}</p>
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
                            Total Area w/Waste
                          </span>
                        </div>
                        <p className="text-xl font-bold text-foreground">
                          {showAdjust && adjArea
                            ? finalWaste.toLocaleString()
                            : measurement.wasteSqft.toLocaleString()}{' '}
                          <span className="text-sm font-normal text-muted-foreground">sq ft</span>
                        </p>
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
                      <div className="border-t pt-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Area Breakdown
                        </span>
                        <p className="text-[12px] text-foreground mt-1">
                          Pitched: <span className="font-semibold">{measurement.pitchedAreaSqft.toLocaleString()} sqft</span>
                          {' · '}
                          Flat deck: <span className="font-semibold">{measurement.flatAreaSqft.toLocaleString()} sqft</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Used when Flat Roof is selected alongside a pitched material</p>
                      </div>
                    )}
                  </div>

                  {!showAdjust ? (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                      onClick={() => setShowAdjust(true)}
                    >
                      Looks wrong? Adjust manually
                    </button>
                  ) : (
                    <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium">Manual adjustment</p>
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                          onClick={() => { setShowAdjust(false); setAdjArea(String(measurement.areaSqft)); setAdjPitch(measurement.pitch) }}
                        >
                          <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="mb-1 block text-xs">Area (sq ft)</Label>
                          <Input
                            value={adjArea}
                            onChange={(e) => setAdjArea(e.target.value)}
                            placeholder="e.g. 1800"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs">Pitch</Label>
                          <Input
                            value={adjPitch}
                            onChange={(e) => setAdjPitch(e.target.value)}
                            placeholder="e.g. 4/12"
                            className="h-8 text-sm"
                          />
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
              <div className="flex justify-between gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>Back</Button>
                <Button size="sm" disabled={!anyMaterialSelected} onClick={() => setStep(4)}>
                  Next →
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Ready ── */}
          {step === 4 && anyMaterialSelected && (
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
                  { label: 'Address', value: formAddress },
                ]
                if (hasFlatSection && measurement?.pitchedAreaSqft !== undefined) {
                  rows.push({ label: 'Pitched section', value: `${measurement.pitchedAreaSqft.toLocaleString()} sqft` })
                  rows.push({ label: 'Flat section', value: `${measurement.flatAreaSqft.toLocaleString()} sqft` })
                } else {
                  rows.push({ label: 'Roof Area', value: `${finalWaste.toLocaleString()} sq ft (with waste)` })
                }
                rows.push({ label: 'Roof Pitch', value: finalPitch })
                if (measurement?.perimeterFt) rows.push({ label: 'Perimeter', value: `~${measurement.perimeterFt.toLocaleString()} lin ft` })
                rows.push({ label: 'Material', value: materialLabel })
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
