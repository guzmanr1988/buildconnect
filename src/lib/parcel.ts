// Parcel-boundary service for Florida.
//
// Address → lat/lng → ArcGIS REST FeatureServer point-in-polygon query →
// GeoJSON polygon for the parcel containing that point.
//
// Single source: Florida Statewide Cadastral (FDOR), services9.arcgis.com.
// Covers all 67 FL counties; no per-county routing needed.
//
// Silent fallback: any failure (out-of-bounds, network, malformed response,
// abort) returns null so callers render no parcel ring rather than show an
// error. Every field is null-guarded — never trust the network shape.

type LngLat = [number, number]
type Ring = LngLat[]
interface PolygonGeom { type: 'Polygon'; coordinates: Ring[] }
interface MultiPolygonGeom { type: 'MultiPolygon'; coordinates: Ring[][] }
export type ParcelGeometry = PolygonGeom | MultiPolygonGeom

// Florida Department of Revenue cadastral. Verified working at all 3
// South FL launch counties. Overridable via env without a code change.
const ENDPOINT =
  import.meta.env.VITE_PARCEL_FL_URL ??
  'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0'

// Approximate Florida bounding box. Out-of-state addresses skip the fetch
// entirely — no point spamming the cadastral with point queries it can't answer.
const FL_BOUNDS = { latMin: 24.0, latMax: 31.5, lngMin: -88.0, lngMax: -79.0 }

const cache = new Map<string, ParcelGeometry | null>()
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`

function isValidRing(r: unknown): r is Ring {
  if (!Array.isArray(r) || r.length < 3) return false
  for (const p of r) {
    if (!Array.isArray(p) || p.length < 2) return false
    if (typeof p[0] !== 'number' || typeof p[1] !== 'number') return false
  }
  return true
}

function isValidPolygon(g: unknown): g is PolygonGeom {
  if (!g || typeof g !== 'object') return false
  const obj = g as { type?: unknown; coordinates?: unknown }
  if (obj.type !== 'Polygon' || !Array.isArray(obj.coordinates)) return false
  return obj.coordinates.every(isValidRing)
}

function isValidMultiPolygon(g: unknown): g is MultiPolygonGeom {
  if (!g || typeof g !== 'object') return false
  const obj = g as { type?: unknown; coordinates?: unknown }
  if (obj.type !== 'MultiPolygon' || !Array.isArray(obj.coordinates)) return false
  return obj.coordinates.every(
    (poly) => Array.isArray(poly) && poly.every(isValidRing),
  )
}

function isValidGeom(g: unknown): g is ParcelGeometry {
  return isValidPolygon(g) || isValidMultiPolygon(g)
}

export async function getParcelByLatLng(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ParcelGeometry | null> {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (
    lat < FL_BOUNDS.latMin || lat > FL_BOUNDS.latMax ||
    lng < FL_BOUNDS.lngMin || lng > FL_BOUNDS.lngMax
  ) return null

  const key = cacheKey(lat, lng)
  if (cache.has(key)) return cache.get(key) ?? null

  const url =
    `${ENDPOINT}/query?` +
    new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'PARCEL_ID',
      outSR: '4326',
      returnGeometry: 'true',
      f: 'geojson',
    }).toString()

  try {
    const res = await fetch(url, { signal })
    if (!res || !res.ok) {
      cache.set(key, null)
      return null
    }
    const json: unknown = await res.json().catch(() => null)
    if (!json || typeof json !== 'object') {
      cache.set(key, null)
      return null
    }
    const features = (json as { features?: unknown }).features
    if (!Array.isArray(features) || features.length === 0) {
      cache.set(key, null)
      return null
    }
    const first = features[0] as { geometry?: unknown } | null | undefined
    const geom = first?.geometry
    if (!isValidGeom(geom)) {
      cache.set(key, null)
      return null
    }
    cache.set(key, geom)
    return geom
  } catch {
    return null
  }
}

// Convert a GeoJSON Polygon/MultiPolygon to google.maps Polygon paths.
// Defensive: any malformed input (missing coordinates, bad rings) is filtered
// to an empty array so the caller falls back to no overlay.
export function geometryToGoogleMapsPaths(
  geom: ParcelGeometry | null | undefined,
): google.maps.LatLngLiteral[][] {
  if (!geom || typeof geom !== 'object') return []
  if (geom.type === 'Polygon') {
    if (!Array.isArray(geom.coordinates)) return []
    return geom.coordinates
      .filter(isValidRing)
      .map((ring) => ring.map(([lng, lat]) => ({ lat, lng })))
  }
  if (geom.type === 'MultiPolygon') {
    if (!Array.isArray(geom.coordinates)) return []
    return geom.coordinates.flatMap((poly) => {
      if (!Array.isArray(poly)) return []
      return poly.filter(isValidRing).map((ring) =>
        ring.map(([lng, lat]) => ({ lat, lng })),
      )
    })
  }
  return []
}
