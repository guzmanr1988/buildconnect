// Ship #246 — geo-match Phase 1 distance helper.
// Standard Haversine formula, returns miles.
// Used by vendor-compare category+distance filter to gate contractors
// by admin-configurable matchRadiusMiles.

const EARTH_RADIUS_MILES = 3958.8

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Great-circle distance between two lat/lng points, in miles.
 * Null-safe inputs → returns Infinity so distance filters fall through
 * to "unknown, skip filter" at the caller level.
 */
export function haversineMiles(
  lat1?: number,
  lng1?: number,
  lat2?: number,
  lng2?: number,
): number {
  if (
    typeof lat1 !== 'number'
    || typeof lng1 !== 'number'
    || typeof lat2 !== 'number'
    || typeof lng2 !== 'number'
  ) return Infinity
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const lat1Rad = toRadians(lat1)
  const lat2Rad = toRadians(lat2)
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_MILES * c
}

/**
 * Geocode a free-text address to lat/lng via Google Geocoding API.
 * Returns null on any failure — callers must fall through gracefully.
 */
export async function geocodeAddressToCoords(
  address: string,
  apiKey: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`,
    )
    const json = await res.json() as {
      status: string
      results: Array<{ geometry: { location: { lat: number; lng: number } } }>
    }
    if (json.status !== 'OK' || !json.results.length) return null
    return json.results[0].geometry.location
  } catch {
    return null
  }
}
