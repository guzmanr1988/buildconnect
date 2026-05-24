// Maps ConfiguratorEntry label fields → vendor catalog option IDs so the
// Projects per-line price can be sourced from the vendor's Products-page
// catalog (VendorCatalogStore) rather than averaged preset totals.
//
// ConfiguratorEntry stores display LABELS (e.g. 'Single Hung', 'Clear-White')
// because the window/door configurator components render from WINDOW_TYPES /
// GLASS_COLORS arrays that carry labels. Vendor catalog is keyed by OPTION IDs
// (e.g. 'single_hung', 'clear_white') from SERVICE_CATALOG constants.
// These maps bridge the two.

export interface ConfigEntryLike {
  size: string
  type: string
  frameColor: string
  glassColor: string
  glassType: string
  quantity: number
}

// Arc-42: exported for pricing.ts computeVendorTotal sub-option iteration.
// Same maps power both the legacy flat-key getPrice path (windowCatalogUnitPrice
// etc.) and the new prefixed VendorPriceMap path (computeVendorTotal subopt
// lookups). Single source of truth.
export const WINDOW_TYPE_IDS: Record<string, string> = {
  'Single Hung': 'single_hung',
  'Casement': 'casement',
  'Awning': 'awning',
  'Rolling': 'rolling',
  'Picture': 'picture',
}

export const DOOR_TYPE_IDS: Record<string, string> = {
  'Entry Door': 'entry',
  'French Door': 'french',
  'Sliding Glass': 'sliding_glass',
  'Impact Door': 'impact_door',
  'Patio Door': 'patio',
  'Pivot Door': 'pivot',
}

export const FRAME_COLOR_IDS: Record<string, string> = {
  'White': 'white',
  'Bronze': 'bronze',
  'Black': 'black',
}

export const GLASS_COLOR_IDS: Record<string, string> = {
  'Grey-White': 'grey_white',
  'Clear-White': 'clear_white',
  'Clear': 'clear',
  'Gray': 'gray',
  'Green': 'green',
}

export const GLASS_TYPE_IDS: Record<string, string> = {
  'Impact Glass': 'impact_glass',
  'Low-E Glass': 'low_e',
}

type GetPriceFn = (serviceId: string, optionId: string) => number

function sumOptionPrices(
  optionIds: (string | undefined)[],
  getPrice: GetPriceFn,
  serviceId: string,
): number {
  return optionIds
    .filter((id): id is string => Boolean(id))
    .reduce((sum, id) => sum + (getPrice(serviceId, id) || 0), 0)
}

/** Unit price for one window (before multiplying by quantity). */
export function windowCatalogUnitPrice(
  entry: ConfigEntryLike,
  getPrice: GetPriceFn,
  serviceId: string,
): number {
  return sumOptionPrices(
    [
      entry.size,
      WINDOW_TYPE_IDS[entry.type],
      FRAME_COLOR_IDS[entry.frameColor],
      GLASS_COLOR_IDS[entry.glassColor],
      GLASS_TYPE_IDS[entry.glassType],
    ],
    getPrice,
    serviceId,
  )
}

/** Unit price for one door (before multiplying by quantity). */
export function doorCatalogUnitPrice(
  entry: ConfigEntryLike,
  getPrice: GetPriceFn,
  serviceId: string,
): number {
  return sumOptionPrices(
    [
      entry.size,
      DOOR_TYPE_IDS[entry.type],
      FRAME_COLOR_IDS[entry.frameColor],
      GLASS_COLOR_IDS[entry.glassColor],
      GLASS_TYPE_IDS[entry.glassType],
    ],
    getPrice,
    serviceId,
  )
}

export const STORM_FRONT_TYPE_IDS: Record<string, string> = {
  'Storm Front': 'storm_front_only',
}

export const STORM_FRONT_SIZE_IDS: Record<string, string> = {
  '24x80': 'sf_24x80',
  '24x96': 'sf_24x96',
  '36x80': 'sf_36x80',
  '36x96': 'sf_36x96',
  '48x80': 'sf_48x80',
  '48x96': 'sf_48x96',
  '60x80': 'sf_60x80',
  '60x96': 'sf_60x96',
}

/** Unit price for one storm front (before multiplying by quantity). */
export function stormFrontCatalogUnitPrice(
  entry: ConfigEntryLike,
  getPrice: GetPriceFn,
  serviceId: string,
): number {
  return sumOptionPrices(
    [
      STORM_FRONT_SIZE_IDS[entry.size],
      STORM_FRONT_TYPE_IDS[entry.type],
      FRAME_COLOR_IDS[entry.frameColor],
      GLASS_COLOR_IDS[entry.glassColor],
      GLASS_TYPE_IDS[entry.glassType],
    ],
    getPrice,
    serviceId,
  )
}

export interface GarageDoorSelectionLike {
  type: string
  size: string
  color: string
  glass: string
}

/** Unit price for one garage door (qty=1 implicit). Option IDs stored directly in GarageDoorSelection. */
export function garageDoorCatalogUnitPrice(
  gd: GarageDoorSelectionLike,
  getPrice: GetPriceFn,
  serviceId: string,
): number {
  return sumOptionPrices([gd.type, gd.size, gd.color, gd.glass], getPrice, serviceId)
}

export interface WindowsDoorsCatalogItem {
  serviceId: string
  windowSelections?: Array<ConfigEntryLike & { quantity: number }>
  doorSelections?: Array<ConfigEntryLike & { quantity: number }>
  stormFrontSelections?: Array<ConfigEntryLike & { quantity: number }>
  garageDoorSelection?: GarageDoorSelectionLike
  selections?: Record<string, string[]>
}

/**
 * Computes the full catalog-first total for a windows_doors project.
 * Pure catalog: per-row catalog price × quantity. Items without a catalog
 * price contribute $0 (surfaced as em-dash in card-grid). No preset-line or
 * wd-product distribution fallback — vendors must set prices in catalog.
 */
export function computeWindowsDoorsCatalogTotal(
  item: WindowsDoorsCatalogItem,
  _resolvedLineItems: Array<{ id: string; label?: string; amount: number }>,
  getPrice: GetPriceFn,
): number {
  let total = 0

  for (const w of item.windowSelections ?? []) {
    const unit = windowCatalogUnitPrice(w, getPrice, item.serviceId)
    if (unit > 0) total += unit * w.quantity
  }

  for (const d of item.doorSelections ?? []) {
    const unit = doorCatalogUnitPrice(d, getPrice, item.serviceId)
    if (unit > 0) total += unit * d.quantity
  }

  for (const sf of item.stormFrontSelections ?? []) {
    const unit = stormFrontCatalogUnitPrice(sf, getPrice, item.serviceId)
    if (unit > 0) total += unit * sf.quantity
  }

  const gd = item.garageDoorSelection
  if (gd?.type) {
    total += garageDoorCatalogUnitPrice(gd, getPrice, item.serviceId)
  }

  const totalWQty = item.windowSelections?.reduce((s, w) => s + w.quantity, 0) ?? 0
  const totalDQty = item.doorSelections?.reduce((s, d) => s + d.quantity, 0) ?? 0
  const totalSFQty = item.stormFrontSelections?.reduce((s, sf) => s + sf.quantity, 0) ?? 0

  if (totalWQty > 0) {
    const catalogInstallW = getPrice(item.serviceId, 'install_windows')
    if (catalogInstallW > 0) total += catalogInstallW * totalWQty
  }

  if (totalDQty > 0) {
    const catalogInstallD = getPrice(item.serviceId, 'install_doors')
    if (catalogInstallD > 0) total += catalogInstallD * totalDQty
  }

  if (totalSFQty > 0) {
    const catalogInstallSF = getPrice(item.serviceId, 'install_storm_front')
    if (catalogInstallSF > 0) total += catalogInstallSF * totalSFQty
  }

  const hasPermit = item.selections && Object.values(item.selections).flat().includes('permit')
  if (hasPermit) {
    const catalogPermit = getPrice(item.serviceId, 'permit')
    if (catalogPermit > 0) total += catalogPermit
  }

  return total
}
