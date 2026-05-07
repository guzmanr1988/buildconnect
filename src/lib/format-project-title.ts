import { SERVICE_CATALOG } from '@/lib/constants'

/*
 * Disambiguator title for homeowner project cards.
 *
 * Source-of-truth helper — single canonical render across home dashboard
 * (Upcoming/Active/Completed/Cancelled lists), project-detail-dialog
 * header, and Your Project (cart) cards. Vendor-side render paths
 * already carry their own selection-suffix format and stay untouched
 * for now (they pass `serviceName + ' — ' + ids.join(', ')`).
 *
 * Roofing is the disambiguated service today (per Rodolfo directive
 * 2026-05-07): identical "Roofing" titles on the Upcoming list when
 * the homeowner has 3 different roofing project configs. Non-roofing
 * services pass through unchanged.
 *
 * Inferred path (no schema change — reads `selections` only):
 *   - material[] non-empty → full_replacement
 *   - addons[] non-empty + no material → addons_only
 *   - else → no disambiguator
 *
 * Format pick:
 *   - Path A (single material): "Roofing - Full Replacement (Aluminum)"
 *   - Path A (multi material):  "Roofing - Full Replacement"
 *   - Path B (1-2 addons):      "Roofing - Gutter Installation"
 *                               "Roofing - Gutter Installation, Soffit Wood"
 *   - Path B (3+ addons):       "Roofing - Gutter Installation, Soffit Wood +2 more"
 */
type TitleItem = {
  serviceId: string
  serviceName: string
  selections?: Record<string, string[]>
}

export function formatProjectTitle(item: TitleItem): string {
  if (item.serviceId !== 'roofing') return item.serviceName

  const service = SERVICE_CATALOG.find((s) => s.id === item.serviceId)
  if (!service) return item.serviceName

  const sel = item.selections ?? {}
  const materialIds = sel.material ?? []
  const addonIds = sel.addons ?? []

  const materialGroup = service.optionGroups.find((g) => g.id === 'material')
  const addonGroup = service.optionGroups.find((g) => g.id === 'addons')
  const labelFor = (
    group: typeof materialGroup,
    id: string,
  ): string => group?.options.find((o) => o.id === id)?.label ?? id

  const isAddonsOnly = materialIds.length === 0 && addonIds.length > 0
  if (isAddonsOnly) {
    const labels = addonIds.map((id) => labelFor(addonGroup, id))
    if (labels.length === 1) return `${item.serviceName} - ${labels[0]}`
    if (labels.length === 2) return `${item.serviceName} - ${labels.join(', ')}`
    return `${item.serviceName} - ${labels[0]}, ${labels[1]} +${labels.length - 2} more`
  }

  if (materialIds.length === 1) {
    return `${item.serviceName} - Full Replacement (${labelFor(materialGroup, materialIds[0])})`
  }
  if (materialIds.length > 1) {
    return `${item.serviceName} - Full Replacement`
  }
  return item.serviceName
}
