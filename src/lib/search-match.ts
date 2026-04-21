// Shared multi-field search matcher used across every admin + vendor
// surface with a search input. Case-insensitive substring on `fields`,
// digits-normalized comparison on `phones` (so "305-555-0101", "3055550101",
// and "555-01" all match), exact-substring on `ids` (for stable tokens like
// L-XXXX lead ids). Empty query matches everything. Shipped with #134 per
// kratos msg 1776742649330.

export interface SearchMatchOptions {
  query: string
  fields?: (string | null | undefined)[]
  phones?: (string | null | undefined)[]
  ids?: (string | null | undefined)[]
}

export function matchesSearch({ query, fields = [], phones = [], ids = [] }: SearchMatchOptions): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  const qDigits = q.replace(/\D/g, '')

  for (const f of fields) {
    if (f && f.toLowerCase().includes(q)) return true
  }
  if (qDigits.length > 0) {
    for (const p of phones) {
      if (p && p.replace(/\D/g, '').includes(qDigits)) return true
    }
  }
  for (const id of ids) {
    if (id && id.toLowerCase().includes(q)) return true
  }
  return false
}
