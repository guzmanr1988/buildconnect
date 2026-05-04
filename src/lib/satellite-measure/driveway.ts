import type { DrivewayMeasurements } from './types'

// Phase 2: ortho-image + edge-detection ML model.
// MVP: returns null so caller falls back to mock default.
export async function measureDrivewayFromCoords(
  _lat: number,
  _lng: number,
): Promise<DrivewayMeasurements | null> {
  return null
}
