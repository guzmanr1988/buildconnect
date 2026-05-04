import type { ServiceCategory } from '@/types'
import type { ServiceMeasurements, MeasurementResult, FallbackReason } from './types'
import { SERVICE_DEFAULT_AREAS } from './types'
import { geocodeAddress } from './geocode'
import { measureRoofFromCoords } from './roofing'
import { measurePoolFromCoords } from './pool'
import { measureDrivewayFromCoords } from './driveway'
import { measurePergolaFromCoords } from './pergola'

export type { MeasurementResult, ServiceMeasurements, FallbackReason, SatelliteMeasureProps } from './types'
export { SERVICE_DEFAULT_AREAS } from './types'

// Service dispatch registry — add entries here for new services, no component changes needed.
type MeasureFn = (lat: number, lng: number) => Promise<ServiceMeasurements | null>

const measurementByService: Partial<Record<ServiceCategory, MeasureFn>> = {
  roofing: measureRoofFromCoords as MeasureFn,
  pool: measurePoolFromCoords as MeasureFn,
  driveways: measureDrivewayFromCoords as MeasureFn,
  pergolas: measurePergolaFromCoords as MeasureFn,
}

function buildMockMeasurement(serviceCategory: ServiceCategory): ServiceMeasurements {
  const defaultVal = SERVICE_DEFAULT_AREAS[serviceCategory] ?? 500
  if (serviceCategory === 'roofing') {
    return { type: 'roofing', areaSqft: defaultVal, pitch: '4/12', pitchedAreaSqft: defaultVal, flatAreaSqft: 0, perimeterFt: 180 }
  }
  if (serviceCategory === 'pool') {
    return { type: 'pool', areaSqft: defaultVal, depthEstimate: 'standard' }
  }
  if (serviceCategory === 'driveways') {
    return { type: 'driveway', areaSqft: defaultVal, lengthFt: Math.round(Math.sqrt(defaultVal)) }
  }
  if (serviceCategory === 'fencing') {
    return { type: 'fencing', perimeterFt: defaultVal }
  }
  return { type: 'area_only', areaSqft: defaultVal }
}

export function buildMockResult(
  serviceCategory: ServiceCategory,
  address: string,
): MeasurementResult {
  const measurements = buildMockMeasurement(serviceCategory)
  const areaSqft = measurements.type === 'fencing' ? 0 : measurements.areaSqft
  return {
    address,
    areaSqft,
    measurements,
    confidenceScore: 'low',
    isMock: true,
  }
}

// Main measurement entry point. Geocodes address, dispatches to service-specific
// measurement function, falls back to mock on any failure — never blocks.
export async function measureFromAddress(
  serviceCategory: ServiceCategory,
  address: string,
  onFallback?: (reason: FallbackReason, address: string) => void,
): Promise<MeasurementResult> {
  const geo = await geocodeAddress(address)
  if (!geo) {
    onFallback?.('geocode_failed', address)
    return buildMockResult(serviceCategory, address)
  }

  const measureFn = measurementByService[serviceCategory]
  if (!measureFn) {
    onFallback?.('service_api_failed', geo.canonicalAddress)
    return buildMockResult(serviceCategory, geo.canonicalAddress)
  }

  let measurements: ServiceMeasurements | null = null
  try {
    measurements = await measureFn(geo.lat, geo.lng)
  } catch {
    // swallow — fall through to mock below
  }

  if (!measurements) {
    onFallback?.('service_api_failed', geo.canonicalAddress)
    return buildMockResult(serviceCategory, geo.canonicalAddress)
  }

  return {
    address: geo.canonicalAddress,
    areaSqft: measurements.type === 'fencing' ? 0 : measurements.areaSqft,
    measurements,
    isMock: false,
  }
}
