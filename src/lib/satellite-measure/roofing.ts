import type { RoofingMeasurements } from './types'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string
const FLAT_PITCH_THRESHOLD_DEG = 5
const SQM_TO_SQFT = 10.7639

interface RoofSegmentStat { pitchDegrees: number; stats: { areaMeters2: number } }

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
    const perimeterFt = Math.round(Math.sqrt(areaSqft) * 4)

    return {
      type: 'roofing',
      areaSqft,
      pitch: degreesToPitch(avgPitchDeg),
      pitchedAreaSqft,
      flatAreaSqft,
      perimeterFt,
    }
  } catch {
    return null
  }
}
