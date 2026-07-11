// Google Places Autocomplete hook (shared).
//
// Extracted from src/features/homeowner/components/roof-measurement-wizard.tsx
// so the Concierge intake address field can mount the same canonical autocomplete
// the roof flow uses. Fields widened to ['address_components','formatted_address']
// so consumers that need a structured {line1, city, state, zip} can derive it from
// place.address_components without re-parsing the formatted string.
//
// Lifecycle:
//   - loadMapsScript() lazy-loads the Maps JS SDK once per page (idempotent —
//     keyed by GMAPS_SCRIPT_ID). Same script tag serves roof + concierge.
//   - usePlacesAutocomplete(enabled, apiKey, onPlace, onStructured?) binds
//     google.maps.places.Autocomplete to the input via the returned ref-setter.
//     On 'place_changed':
//       - onPlace receives place.formatted_address (canonical string)
//       - onStructured (if provided) receives {line1, city, state, zip}
//         derived from place.address_components. Skipped when components
//         are missing (rare, but autocomplete can return partial places).
//   - Re-bind happens on every input remount (step changes in a stepper-style
//     form unmount/remount the field; ref-setter callback handles that).
//
// Returns a ref-setter, NOT a useRef-style ref, because the input may remount
// across steps and we need to detect each remount to rebind.

import { useCallback, useEffect, useRef } from 'react'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any
  }
}

const GMAPS_SCRIPT_ID = 'gmaps-places-sdk'

export function loadMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.maps?.places) { resolve(); return }
    const existing = document.getElementById(GMAPS_SCRIPT_ID)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      return
    }
    const script = document.createElement('script')
    script.id = GMAPS_SCRIPT_ID
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
}

export interface StructuredAddress {
  line1: string
  city: string
  state: string
  zip: string
}

// Walk place.address_components → structured {line1,city,state,zip}.
// Returns null when required pieces are missing (e.g. Autocomplete returned a
// place_id-only stub or a non-address result). Callers fall back to the flat
// formatted_address path via parseFlatAddress in that case.
//
// Component types per Google Places: street_number, route, locality,
// administrative_area_level_1, postal_code. Some addresses substitute
// 'postal_town' or 'sublocality_level_1' for locality (rare in US); not handled
// here — concierge is US-only so locality is the load-bearing slot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractStructuredAddress(place: any): StructuredAddress | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components: Array<{ long_name: string; short_name: string; types: string[] }> =
    place?.address_components ?? []
  if (!components.length) return null

  const find = (type: string) => components.find((c) => c.types.includes(type))
  const streetNumber = find('street_number')?.long_name ?? ''
  const route = find('route')?.long_name ?? ''
  const locality = find('locality')?.long_name ?? ''
  const state = find('administrative_area_level_1')?.short_name ?? ''
  const zip = find('postal_code')?.long_name ?? ''

  const line1 = [streetNumber, route].filter(Boolean).join(' ').trim()
  if (!line1 || !locality || !state || !zip) return null

  return { line1, city: locality, state: state.toUpperCase(), zip }
}

export function usePlacesAutocomplete(
  enabled: boolean,
  apiKey: string,
  onPlace: (formatted: string) => void,
  onStructured?: (parts: StructuredAddress) => void,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const acRef = useRef<{ unbind: () => void } | null>(null)

  const bind = useCallback(() => {
    const el = inputRef.current
    if (!el || acRef.current || !window.google?.maps?.places) return
    const ac = new window.google.maps.places.Autocomplete(el, {
      types: ['address'],
      fields: ['address_components', 'formatted_address'],
    })
    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (place?.formatted_address) onPlace(place.formatted_address)
      if (onStructured) {
        const parts = extractStructuredAddress(place)
        if (parts) onStructured(parts)
      }
    })
    acRef.current = {
      unbind: () => {
        window.google?.maps?.event?.removeListener(listener)
        acRef.current = null
      },
    }
  }, [onPlace, onStructured])

  useEffect(() => {
    if (!enabled || !apiKey) return
    loadMapsScript(apiKey).then(bind)
    return () => { acRef.current?.unbind() }
  }, [enabled, apiKey, bind])

  const setInputRef = useCallback((el: HTMLInputElement | null) => {
    ;(inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
    if (el && enabled && window.google?.maps?.places) bind()
  }, [enabled, bind])

  return setInputRef
}
