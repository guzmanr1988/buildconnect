// Shared roof-perimeter primitive — used by both library path
// (src/lib/satellite-measure/roofing.ts measureRoofFromCoords) and wizard
// inline path (src/features/homeowner/components/roof-measurement-wizard.tsx
// measureRoofFromAddress). Single source so both surfaces produce the same
// drip-edge linear-ft on identical Solar API inputs.
//
// Calibrated against a 5-address Miami-Dade / Broward sample (see
// scripts/perimeter-calibration.md). Bbox-haversine gives the building
// footprint perimeter; real drip-edge linear-ft on multi-plane roofs
// runs along every pitched plane and can exceed footprint. The 1.15
// floor covers that gap and keeps quotes top-of-real per launch
// directive (Rod 2026-05-12: numbers must be 100% correct, err high).

const M_TO_FT = 3.28084
const EARTH_RADIUS_M = 6371000

export const PERIMETER_MULTI_PLANE_BIAS = 1.15

interface LatLng { latitude: number; longitude: number }
export interface BoundingBox { sw: LatLng; ne: LatLng }

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(x))
}

export function bboxPerimeterFt(bb: BoundingBox): number {
  const sw = { lat: bb.sw.latitude, lng: bb.sw.longitude }
  const ne = { lat: bb.ne.latitude, lng: bb.ne.longitude }
  const nw = { lat: ne.lat, lng: sw.lng }
  const se = { lat: sw.lat, lng: ne.lng }
  const widthM = haversineMeters(sw, se)
  const heightM = haversineMeters(sw, nw)
  return (2 * widthM + 2 * heightM) * M_TO_FT
}

// Bbox-haversine when the API returns a boundingBox; fall back to the
// legacy 4·sqrt(area) approximation if the field is absent (older /
// edge-case responses). Either path is multiplied by
// PERIMETER_MULTI_PLANE_BIAS for multi-plane drip-edge safety.
export function computePerimeterFt(boundingBox: BoundingBox | undefined, areaSqft: number): number {
  const basePerimeterFt = boundingBox
    ? bboxPerimeterFt(boundingBox)
    : Math.sqrt(areaSqft) * 4
  return Math.round(basePerimeterFt * PERIMETER_MULTI_PLANE_BIAS)
}
