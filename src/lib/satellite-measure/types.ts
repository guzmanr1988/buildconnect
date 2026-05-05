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
  material?: 'shingle' | 'barrel_tile' | 'metal' | 'flat_roof'
  pitchedAreaSqft?: number
  flatAreaSqft?: number
  perimeterFt: number
  includeFlat?: boolean
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
