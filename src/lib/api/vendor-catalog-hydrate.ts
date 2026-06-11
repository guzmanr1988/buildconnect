// Pure-fn extraction from vendor-catalog-store.hydrateFromSupabase. Lives
// here so tests/active-toggle-protection/runner.mts can unit-test the
// active-toggle reconstruction without touching zustand or supabase.

export type HydrateOptionRow = {
  id: string
  option_id: string
  option_groups: { group_id: string; service_id: string } | null
}

export type HydrateSubOptionRow = {
  id: string
  sub_groups:
    | {
        options:
          | {
              option_groups: { service_id: string } | null
            }
          | null
      }
    | null
}

export type HydratePriceRow = {
  price_cents: number
  active: boolean
  options: {
    id?: string
    option_id: string
    option_groups: { group_id: string; service_id: string } | null
  } | null
}

export type HydratePermitRow = {
  service_id: string
  permit_price_cents: number
  active: boolean
}

export type EnabledState = {
  enabledByService: Record<string, boolean>
  enabledOptionsByService: Record<string, Record<string, string[]>>
}

export type PriceMaps = {
  priceBySvcOption: Record<string, Record<string, number>>
  permitByService: Record<string, number>
}

export function buildEnabledStateFromRows(
  priceRows: HydratePriceRow[],
  permitRows: HydratePermitRow[],
): EnabledState {
  const enabledByService: Record<string, boolean> = {}
  const enabledOptionsByService: Record<string, Record<string, string[]>> = {}

  for (const row of priceRows) {
    if (!row.active) continue
    const og = row.options?.option_groups
    if (!og) continue
    const svc = og.service_id
    const grp = og.group_id
    const optId = row.options?.option_id
    if (!optId) continue
    enabledByService[svc] = true
    if (!enabledOptionsByService[svc]) enabledOptionsByService[svc] = {}
    const arr = enabledOptionsByService[svc][grp] ?? []
    if (!arr.includes(optId)) arr.push(optId)
    enabledOptionsByService[svc][grp] = arr
  }

  for (const row of permitRows) {
    if (!row.active) continue
    if (!row.service_id) continue
    enabledByService[row.service_id] = enabledByService[row.service_id] ?? true
  }

  return { enabledByService, enabledOptionsByService }
}

export function buildPriceMapFromRows(
  priceRows: HydratePriceRow[],
  permitRows: HydratePermitRow[],
): PriceMaps {
  const priceBySvcOption: Record<string, Record<string, number>> = {}
  for (const row of priceRows) {
    if (!row.active) continue
    const og = row.options?.option_groups
    if (!og) continue
    const svc = og.service_id
    const optId = row.options?.option_id
    if (!optId) continue
    if (!priceBySvcOption[svc]) priceBySvcOption[svc] = {}
    priceBySvcOption[svc][optId] = row.price_cents
  }
  const permitByService: Record<string, number> = {}
  for (const row of permitRows) {
    if (!row.active) continue
    if (!row.service_id) continue
    permitByService[row.service_id] = row.permit_price_cents ?? 0
  }
  return { priceBySvcOption, permitByService }
}

export function buildSubOptionIdsByService(
  subOptionRows: HydrateSubOptionRow[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const row of subOptionRows) {
    const svc = row.sub_groups?.options?.option_groups?.service_id
    if (!svc) continue
    if (!out[svc]) out[svc] = []
    out[svc].push(row.id)
  }
  return out
}
