/**
 * Format a phone number input to XXX-XXX-XXXX as user types.
 * Strips non-digit chars, limits to 10 digits, formats progressively:
 * '3'         → '3'
 * '305'       → '305'
 * '3055'      → '305-5'
 * '305555'    → '305-555'
 * '3055550101' → '305-555-0101'
 *
 * Handles paste + partial input + backspace naturally since the formatter
 * is pure (digits → formatted). Wrap onChange handlers to call this before
 * setState so the input always reflects the formatted value.
 */
export function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

/**
 * Compose a structured address into a single-line display string.
 * 'Street, City, State ZIP' format. Empty parts omitted.
 */
export function composeAddress(parts: {
  street: string
  city: string
  state: string
  zip: string
}): string {
  const { street, city, state, zip } = parts
  const s = street.trim()
  const c = city.trim()
  const st = state.trim()
  const z = zip.trim()
  const cityLine = [c, [st, z].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [s, cityLine].filter(Boolean).join(', ')
}
