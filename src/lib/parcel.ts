// Parcel-boundary service for South Florida counties.
//
// Address → lat/lng → county router → ArcGIS REST FeatureServer point-in-polygon
// query → GeoJSON polygon for the parcel containing that point.
//
// Silent fallback: any failure (out-of-bounds, network, no parcel found, malformed
// response) returns null so callers render no parcel ring rather than show an error.

// Minimal GeoJSON shape — only what we need from the ArcGIS f=geojson response.
type LngLat = [number, number]
type Ring = LngLat[]
interface PolygonGeom { type: 'Polygon'; coordinates: Ring[] }
interface MultiPolygonGeom { type: 'MultiPolygon'; coordinates: Ring[][] }
export type ParcelGeometry = PolygonGeom | MultiPolygonGeom

// Defaults are public ArcGIS REST FeatureServer endpoints maintained by each
// county's GIS / property-appraiser office. Verified-working endpoints can be
// overridden via env at build time without a code change.
const ENDPOINTS: Record<string, string> = {
  'miami-dade':
    import.meta.env.VITE_PARCEL_MIAMI_DADE_URL ??
    'https://gisws.miamidade.gov/arcgis/rest/services/MD_PropertyAppr/MapServer/0',
  broward:
    import.meta.env.VITE_PARCEL_BROWARD_URL ??
    'https://services1.arcgis.com/qSZ6JDDPLP4yOhgZ/ArcGIS/rest/services/Parcels/FeatureServer/0',
  'palm-beach':
    import.meta.env.VITE_PARCEL_PALM_BEACH_URL ??
    'https://services1.arcgis.com/ujasZ0lqLsDS8RIR/ArcGIS/rest/services/Parcels/FeatureServer/0',
}

// Approximate lat/lng bounding boxes for the three South Florida launch counties.
// First match wins; outside all three returns null.
const COUNTY_BOUNDS: Array<{ slug: keyof typeof ENDPOINTS; lat: [number, number]; lng: [number, number] }> = [
  { slug: 'miami-dade', lat: [25.13, 25.98], lng: [-80.87, -80.12] },
  { slug: 'broward', lat: [25.95, 26.40], lng: [-80.50, -80.06] },
  { slug: 'palm-beach', lat: [26.32, 27.00], lng: [-80.65, -80.03] },
]

function findCounty(lat: number, lng: number): keyof typeof ENDPOINTS | null {
  for (const c of COUNTY_BOUNDS) {
    if (lat >= c.lat[0] && lat <= c.lat[1] && lng >= c.lng[0] && lng <= c.lng[1]) return c.slug
  }
  return null
}

// Process-lifetime cache. Same address geocoded twice in one session shouldn't
// re-hit the county API.
const cache = new Map<string, ParcelGeometry | null>()
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`

export async function getParcelByLatLng(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ParcelGeometry | null> {
  const key = cacheKey(lat, lng)
  if (cache.has(key)) return cache.get(key) ?? null

  const slug = findCounty(lat, lng)
  if (!slug) {
    cache.set(key, null)
    return null
  }
  const endpoint = ENDPOINTS[slug]
  if (!endpoint) {
    cache.set(key, null)
    return null
  }

  const url =
    `${endpoint}/query?` +
    new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      outSR: '4326',
      returnGeometry: 'true',
      f: 'geojson',
    }).toString()

  try {
    const res = await fetch(url, { signal })
    if (!res.ok) {
      cache.set(key, null)
      return null
    }
    const json = (await res.json()) as { features?: Array<{ geometry: ParcelGeometry }> }
    const geom = json.features?.[0]?.geometry ?? null
    cache.set(key, geom)
    return geom
  } catch {
    return null
  }
}

// Convert a GeoJSON Polygon/MultiPolygon to google.maps Polygon paths.
// google.maps.Polygon accepts an array-of-rings (polygon) or array-of-polygons (multi).
export function geometryToGoogleMapsPaths(
  geom: ParcelGeometry,
): google.maps.LatLngLiteral[][] {
  if (geom.type === 'Polygon') {
    return geom.coordinates.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })))
  }
  // MultiPolygon: flatten to all rings (outer + inner) of each polygon.
  return geom.coordinates.flatMap((poly) =>
    poly.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
  )
}
