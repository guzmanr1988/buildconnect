import type { ServiceCategory } from '@/types'

export type FallbackReason =
  | 'gmp_disabled'
  | 'geocode_failed'
  | 'api_out_of_coverage'
  | 'imagery_quality_low'
  | 'service_api_failed'
  | 'user_cancelled'

export interface RoofingMeasurements {
  type: 'roofing'
  areaSqft: number
  pitch: string
  material?: 'shingle' | 'barrel_tile' | 'metal' | 'aluminum' | 'flat_roof'
  pitchedAreaSqft?: number
  flatAreaSqft?: number
  perimeterFt: number
  includeMaterialOrder?: boolean
  includePerimeter?: boolean
  includeFlatArea?: boolean
  // |wholeRoofStats - (pitched + flat)| / wholeRoofStats. Solar's segment
  // list sometimes drops sub-threshold facets; the warning surface uses
  // this to route the homeowner to Adjust roof area before continuing.
  wholeRoofDivergencePct?: number
}

export interface AreaOnlyMeasurements {
  type: 'area_only'
  areaSqft: number
  perimeterFt?: number
}

export interface PoolMeasurements {
  type: 'pool'
  areaSqft: number
  depthEstimate?: 'shallow' | 'standard' | 'deep'
}

export interface DrivewayMeasurements {
  type: 'driveway'
  areaSqft: number
  lengthFt?: number
  entranceSqft?: number
}

export interface FencingMeasurements {
  type: 'fencing'
  perimeterFt: number
}

export type ServiceMeasurements =
  | RoofingMeasurements
  | AreaOnlyMeasurements
  | PoolMeasurements
  | DrivewayMeasurements
  | FencingMeasurements

export interface MeasurementResult {
  address: string
  areaSqft: number
  measurements: ServiceMeasurements
  confidenceScore?: 'high' | 'medium' | 'low'
  isMock?: boolean
  // Google Static Maps URL pinned to the drawn polygon (encoded path +
  // satellite tile, ~600x400 PNG). Populated for polygon-draw results;
  // undefined for ManualEntryForm + roofing Solar-API flow. Vendor's
  // lead-inbox renders this above the regular itemPhotos grid with a
  // "Measured area" caption. URL form (not base64) keeps persisted
  // cart-item footprint <1KB per item — LS quota stays clear of the
  // PR-194/195/196 5MB cliff.
  mapUrl?: string
}

export interface SatelliteMeasureProps {
  serviceCategory: ServiceCategory
  onMeasure: (result: MeasurementResult) => void
  initialAddress?: string
  gmpEnabled?: boolean
  onFallback?: (reason: FallbackReason, address: string) => void
}

// Default fallback areas per service (sqft). For fencing the value is linear ft (perimeter).
export const SERVICE_DEFAULT_AREAS: Record<ServiceCategory, number> = {
  roofing: 2000,
  pergolas: 200,
  driveways: 500,
  fencing: 150,
  pool: 400,
  air_conditioning: 120,
  kitchen: 200,
  bathroom: 80,
  wall_paneling: 600,
  garage: 400,
  house_painting: 3000,
  windows_doors: 150,
  blinds: 50,
}
