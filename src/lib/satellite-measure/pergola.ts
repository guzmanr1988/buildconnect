import type { AreaOnlyMeasurements } from './types'

// Phase 2: call measurement API for area-based services (pergola, patio, etc.).
// MVP: returns null so caller falls back to mock default.
export async function measurePergolaFromCoords(
  _lat: number,
  _lng: number,
): Promise<AreaOnlyMeasurements | null> {
  return null
}
