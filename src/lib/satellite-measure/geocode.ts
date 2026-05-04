const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string

export interface GeoResult {
  lat: number
  lng: number
  canonicalAddress: string
}

// Shared geocoding utility: address → lat/lng + Google-canonical address.
// Returns null on any failure so callers fall through to mock gracefully.
export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  if (!address.trim() || !MAPS_KEY) return null
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${MAPS_KEY}`,
    )
    const json = await res.json() as {
      status: string
      results: Array<{
        geometry: { location: { lat: number; lng: number } }
        formatted_address: string
      }>
    }
    if (json.status !== 'OK' || !json.results.length) return null
    const { lat, lng } = json.results[0].geometry.location
    return { lat, lng, canonicalAddress: json.results[0].formatted_address }
  } catch {
    return null
  }
}
