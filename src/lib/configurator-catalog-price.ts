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
