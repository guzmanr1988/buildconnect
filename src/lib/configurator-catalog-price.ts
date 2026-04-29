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

const WINDOW_TYPE_IDS: Record<string, string> = {
  'Single Hung': 'single_hung',
  'Casement': 'casement',
  'Awning': 'awning',
  'Rolling': 'rolling',
  'Picture': 'picture',
}

const DOOR_TYPE_IDS: Record<string, string> = {
  'Entry Door': 'entry',
  'French Door': 'french',
  'Sliding Glass': 'sliding_glass',
  'Impact Door': 'impact_door',
  'Patio Door': 'patio',
  'Pivot Door': 'pivot',
}

const FRAME_COLOR_IDS: Record<string, string> = {
  'White': 'white',
  'Bronze': 'bronze',
  'Black': 'black',
}

const GLASS_COLOR_IDS: Record<string, string> = {
  'Grey-White': 'grey_white',
  'Clear-White': 'clear_white',
  'Clear': 'clear',
  'Gray': 'gray',
  'Green': 'green',
}

const GLASS_TYPE_IDS: Record<string, string> = {
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
  garageDoorSelection?: GarageDoorSelectionLike
  selections?: Record<string, string[]>
}

/**
 * Computes the full catalog-first total for a windows_doors project.
 * Per-row: catalog price × quantity, falling back to averaged install-line when no catalog price.
 * Single-line items (Install Windows/Doors, Permit): catalog price × qty, falling back to preset line.
 * Used for pre-sale headline computation and Pricing Breakdown totals.
 */
export function computeWindowsDoorsCatalogTotal(
  item: WindowsDoorsCatalogItem,
  resolvedLineItems: Array<{ id: string; label?: string; amount: number }>,
  getPrice: GetPriceFn,
): number {
  let total = 0

  // Windows
  const wInstallLine = resolvedLineItems.find((l) => l.id === 'wd-install-windows')
  const totalWQty = item.windowSelections?.reduce((s, w) => s + w.quantity, 0) ?? 0
  for (const w of item.windowSelections ?? []) {
    const unit = windowCatalogUnitPrice(w, getPrice, item.serviceId)
    if (unit > 0) {
      total += unit * w.quantity
    } else if (wInstallLine && totalWQty > 0) {
      total += Math.round(wInstallLine.amount / totalWQty * w.quantity)
    }
  }

  // Doors
  const dInstallLine = resolvedLineItems.find((l) => l.id === 'wd-install-doors')
  const totalDQty = item.doorSelections?.reduce((s, d) => s + d.quantity, 0) ?? 0
  for (const d of item.doorSelections ?? []) {
    const unit = doorCatalogUnitPrice(d, getPrice, item.serviceId)
    if (unit > 0) {
      total += unit * d.quantity
    } else if (dInstallLine && totalDQty > 0) {
      total += Math.round(dInstallLine.amount / totalDQty * d.quantity)
    }
  }

  // Garage door
  const gd = item.garageDoorSelection
  if (gd?.type) {
    const gdUnit = garageDoorCatalogUnitPrice(gd, getPrice, item.serviceId)
    const gdLine = resolvedLineItems.find((l) => l.id === 'wd-garage-door')
    total += gdUnit > 0 ? gdUnit : (gdLine?.amount ?? 0)
  }

  // Install Windows (per unit)
  if (totalWQty > 0) {
    const catalogInstallW = getPrice(item.serviceId, 'install_windows')
    total += catalogInstallW > 0 ? catalogInstallW * totalWQty : (wInstallLine?.amount ?? 0)
  }

  // Install Doors (per unit)
  if (totalDQty > 0) {
    const catalogInstallD = getPrice(item.serviceId, 'install_doors')
    total += catalogInstallD > 0 ? catalogInstallD * totalDQty : (dInstallLine?.amount ?? 0)
  }

  // Permit
  const hasPermit = item.selections && Object.values(item.selections).flat().includes('permit')
  if (hasPermit) {
    const catalogPermit = getPrice(item.serviceId, 'permit')
    const permitLine = resolvedLineItems.find((l) => l.label?.toLowerCase().includes('permit'))
    total += catalogPermit > 0 ? catalogPermit : (permitLine?.amount ?? 0)
  }

  return total
}
