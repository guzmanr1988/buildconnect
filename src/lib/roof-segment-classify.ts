/**
 * Solar API roofSegmentStats classifier — splits raw segments into pitched
 * vs flat sqft using a 5° pitch threshold (industry low-slope is <2:12 ≈ 9.46°;
 * 5° is conservative so gray-zone low-pitch shingle areas stay in the pitched
 * bucket).
 *
 * Single source of truth for segment-classification math. Imported by
 * roof-measurement-wizard for runtime + by tests/snapshots/quote-protection
 * runner for pre-merge fixture replay. Pure-fn — no DOM, no fetch, safe to
 * call from node + browser.
 */

export const FLAT_PITCH_THRESHOLD_DEG = 5
export const SQM_TO_SQFT = 10.7639

export type RoofSegmentStat = {
  pitchDegrees: number
  stats: { areaMeters2: number }
}

export type ClassifiedRoofAreas = {
  pitchedAreaSqft: number
  flatAreaSqft: number
}

export function classifyRoofSegments(segments: RoofSegmentStat[]): ClassifiedRoofAreas {
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
