import type { RoofingMeasurements } from './types'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string
const FLAT_PITCH_THRESHOLD_DEG = 5
const SQM_TO_SQFT = 10.7639
const M_TO_FT = 3.28084
const EARTH_RADIUS_M = 6371000

// Calibrated against a 5-address Miami-Dade / Broward sample (see
// scripts/perimeter-calibration.md). Bbox-haversine gives the building
// footprint perimeter; real drip-edge linear-ft on multi-plane roofs
// runs along every pitched plane and can exceed footprint. The 1.15
// floor covers that gap and keeps quotes top-of-real per launch
// directive (Rod 2026-05-12: numbers must be 100% correct, err high).
export const PERIMETER_MULTI_PLANE_BIAS = 1.15

interface RoofSegmentStat { pitchDegrees: number; stats: { areaMeters2: number } }
interface LatLng { latitude: number; longitude: number }
interface BoundingBox { sw: LatLng; ne: LatLng }

function classifySegments(segments: RoofSegmentStat[]) {
  let pitchedSqm = 0
  let flatSqm = 0
  for (const seg of segments) {
    if (seg.pitchDegrees < FLAT_PITCH_THRESHOLD_DEG) flatSqm += seg.stats.areaMeters2
    else pitchedSqm += seg.stats.areaMeters2
  }
  return {
    pitchedAreaSqft: Math.round(pitchedSqm * SQM_TO_SQFT),
    flatAreaSqft: Math.round(flatSqm * SQM_TO_SQFT),
  }
}

function degreesToPitch(deg: number): string {
  const rise = Math.round(12 * Math.tan((deg * Math.PI) / 180) * 2) / 2
  return `${rise}/12`
}

// |whole - (pitched + flat)| / whole. Clamped to [0, 1]. Returns 0 when whole
// is non-positive so callers can treat undefined-or-zero as "no divergence
// signal" without a separate null check.
export function computeDivergencePct(wholeSqft: number, segSumSqft: number): number {
  if (!Number.isFinite(wholeSqft) || wholeSqft <= 0) return 0
  if (!Number.isFinite(segSumSqft)) return 0
  return Math.min(1, Math.abs(wholeSqft - segSumSqft) / wholeSqft)
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(x))
}

function bboxPerimeterFt(bb: BoundingBox): number {
  const sw = { lat: bb.sw.latitude, lng: bb.sw.longitude }
  const ne = { lat: bb.ne.latitude, lng: bb.ne.longitude }
  const nw = { lat: ne.lat, lng: sw.lng }
  const se = { lat: sw.lat, lng: ne.lng }
  const widthM = haversineMeters(sw, se)
  const heightM = haversineMeters(sw, nw)
  return (2 * widthM + 2 * heightM) * M_TO_FT
}

// Calls Google Solar API at lat/lng. Returns null on any failure — caller falls back.
export async function measureRoofFromCoords(
  lat: number,
  lng: number,
): Promise<RoofingMeasurements | null> {
  if (!MAPS_KEY) return null
  try {
    const res = await fetch(
      `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&key=${MAPS_KEY}`,
    )
    if (res.status === 404 || !res.ok) return null
    const json = await res.json() as {
      boundingBox?: BoundingBox
      solarPotential: {
        wholeRoofStats: { areaMeters2: number }
        roofSegmentStats: Array<RoofSegmentStat>
        imageryQuality: 'HIGH' | 'MEDIUM' | 'LOW'
      }
    }
    const { imageryQuality, wholeRoofStats, roofSegmentStats } = json.solarPotential
    if (imageryQuality === 'LOW') return null

    const { pitchedAreaSqft, flatAreaSqft } = classifySegments(roofSegmentStats)
    const areaSqft = Math.round(wholeRoofStats.areaMeters2 * SQM_TO_SQFT)
    const avgPitchDeg = roofSegmentStats.reduce((s, r) => s + r.pitchDegrees, 0) / (roofSegmentStats.length || 1)
    // Base perimeter: bbox-haversine when the API returns a boundingBox;
    // fall back to the legacy 4·sqrt(area) approximation if the field is
    // absent (older / edge-case responses). Either path is multiplied by
    // PERIMETER_MULTI_PLANE_BIAS for multi-plane drip-edge safety.
    const basePerimeterFt = json.boundingBox
      ? bboxPerimeterFt(json.boundingBox)
      : Math.sqrt(areaSqft) * 4
    const perimeterFt = Math.round(basePerimeterFt * PERIMETER_MULTI_PLANE_BIAS)
    // TODO(consolidate): same divergence calc mirrored in
    // src/features/homeowner/components/roof-measurement-wizard.tsx where the
    // wizard has its own inline Solar caller. Cleanup arc owned by kratos.
    const wholeRoofDivergencePct = computeDivergencePct(areaSqft, pitchedAreaSqft + flatAreaSqft)

    return {
      type: 'roofing',
      areaSqft,
      pitch: degreesToPitch(avgPitchDeg),
      pitchedAreaSqft,
      flatAreaSqft,
      perimeterFt,
      wholeRoofDivergencePct,
    }
  } catch {
    return null
  }
}
