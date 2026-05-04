import type { PoolMeasurements } from './types'

// Phase 2: call satellite imagery / ML service for pool detection.
// MVP: returns null so caller falls back to mock default.
export async function measurePoolFromCoords(
  _lat: number,
  _lng: number,
): Promise<PoolMeasurements | null> {
  return null
}
