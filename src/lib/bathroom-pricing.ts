import type { PriceLineItem } from '@/types'

// Ship #475+2 — Bathroom Remodel configurator pricing engine.
// Kratos dispatch task_1780641255537_475 / Phase 1 single-shot build.
//
// PLATFORM-DEFAULT RATES (per Rod 2026-06-05 reframe — contractor sets
// final price, configurator standardizes SCOPE + UNIT + QUANTITY only).
// Review copy reads "Estimate — your contractor confirms final pricing"
// so the per-line $ is a starting-point for quote-compare, not a quote.
//
// See BATHROOM_FINDINGS.md at repo root for the rate table + structural
// map + worked 6×8×9 tub example.
//
// FIXTURES rows are intentionally $0 — homeowner client-provides them
// (toilet/vanity/faucet/shower/tub/tile/lighting). Review UI renders
// them in a separate visually-distinct section with $0 ledger.
//
// Auto double-vanity install line fires when floor_area > 60 sqft
// (master-class threshold per kratos lean Q2).

export interface BathroomMeasurements {
  length: number              // longest wall in feet
  width: number               // shorter wall in feet
  ceilingHeight: number       // ceiling height in feet
  tileCoverageHeight: number  // how high tile goes on walls (4/6/ceiling)
  includesTub: boolean        // true=tub set, false=walk-in shower
}

export type BathroomUnit = 'sqft' | 'linear_ft' | 'flat'

export type BathroomGroup =
  | 'DEMO'
  | 'ROUGH-IN'
  | 'SUBSTRATE'
  | 'TILE'
  | 'INSTALL'
  | 'FINISH'
  | 'FIXTURES'
  | 'EXTRAS'

export interface BathroomRate {
  id: string
  label: string
  group: BathroomGroup
  unit: BathroomUnit
  ratePlaceholder: number
  // Selector: from measurements → quantity (0 if line doesn't apply)
  qtyFrom: (m: BathroomMeasurements) => number
}

// Geometry derivations.
function floorAreaSqft(m: BathroomMeasurements): number {
  return m.length * m.width
}
function perimeterFt(m: BathroomMeasurements): number {
  return 2 * (m.length + m.width)
}
function wallAreaTotalSqft(m: BathroomMeasurements): number {
  return perimeterFt(m) * m.ceilingHeight
}
function wallTileAreaSqft(m: BathroomMeasurements): number {
  return perimeterFt(m) * m.tileCoverageHeight
}
function nonTileWallSqft(m: BathroomMeasurements): number {
  return Math.max(0, wallAreaTotalSqft(m) - wallTileAreaSqft(m))
}
// Walk-in shower (no tub) gets a slightly larger waterproof zone for
// glass-enclosure + curb + niche; tub surround is the standard 50 sqft.
function showerZoneSqft(m: BathroomMeasurements): number {
  return m.includesTub ? 50 : 60
}
// Master-class auto double-vanity install threshold.
function isMaster(m: BathroomMeasurements): boolean {
  return floorAreaSqft(m) > 60
}

export const BATHROOM_RATES: BathroomRate[] = [
  // DEMO
  {
    id: 'bathroom-demo',
    label: 'Gut existing bathroom (toilet/tub/vanity/tile/drywall)',
    group: 'DEMO',
    unit: 'flat',
    ratePlaceholder: 1200.00,
    qtyFrom: () => 1,
  },
  // ROUGH-IN
  {
    id: 'bathroom-plumbing-roughin',
    label: 'Plumbing rough-in (tub/shower drain + toilet + vanity supply)',
    group: 'ROUGH-IN',
    unit: 'flat',
    ratePlaceholder: 1800.00,
    qtyFrom: () => 1,
  },
  {
    id: 'bathroom-electrical-roughin',
    label: 'Electrical rough-in (GFCI + vanity light + exhaust fan)',
    group: 'ROUGH-IN',
    unit: 'flat',
    ratePlaceholder: 650.00,
    qtyFrom: () => 1,
  },
  // SUBSTRATE
  {
    id: 'bathroom-cement-board',
    label: 'Cement board + waterproofing membrane (shower zone)',
    group: 'SUBSTRATE',
    unit: 'sqft',
    ratePlaceholder: 6.00,
    qtyFrom: showerZoneSqft,
  },
  {
    id: 'bathroom-subfloor-leveling',
    label: 'Subfloor leveling',
    group: 'SUBSTRATE',
    unit: 'sqft',
    ratePlaceholder: 2.50,
    qtyFrom: floorAreaSqft,
  },
  // TILE
  {
    id: 'bathroom-floor-tile-install',
    label: 'Floor tile install (labor only, tile supplied)',
    group: 'TILE',
    unit: 'sqft',
    ratePlaceholder: 8.00,
    qtyFrom: floorAreaSqft,
  },
  {
    id: 'bathroom-wall-tile-install',
    label: 'Wall tile install (labor only, tile supplied)',
    group: 'TILE',
    unit: 'sqft',
    ratePlaceholder: 9.00,
    qtyFrom: wallTileAreaSqft,
  },
  // INSTALL
  {
    id: 'bathroom-vanity-set',
    label: 'Vanity set + plumb hookup',
    group: 'INSTALL',
    unit: 'flat',
    ratePlaceholder: 450.00,
    qtyFrom: () => 1,
  },
  {
    id: 'bathroom-double-vanity-extra',
    label: 'Double-vanity install (master bath)',
    group: 'INSTALL',
    unit: 'flat',
    ratePlaceholder: 300.00,
    qtyFrom: (m) => (isMaster(m) ? 1 : 0),
  },
  {
    id: 'bathroom-toilet-set',
    label: 'Toilet set + wax ring + supply line',
    group: 'INSTALL',
    unit: 'flat',
    ratePlaceholder: 250.00,
    qtyFrom: () => 1,
  },
  {
    id: 'bathroom-shower-trim',
    label: 'Shower valve trim-out + head install',
    group: 'INSTALL',
    unit: 'flat',
    ratePlaceholder: 300.00,
    qtyFrom: () => 1,
  },
  {
    id: 'bathroom-tub-set',
    label: 'Tub set + drain trim',
    group: 'INSTALL',
    unit: 'flat',
    ratePlaceholder: 400.00,
    qtyFrom: (m) => (m.includesTub ? 1 : 0),
  },
  {
    id: 'bathroom-mirror-accessories',
    label: 'Mirror + accessories (towel bar, TP holder, hooks)',
    group: 'INSTALL',
    unit: 'flat',
    ratePlaceholder: 180.00,
    qtyFrom: () => 1,
  },
  // FINISH
  {
    id: 'bathroom-paint',
    label: 'Paint above tile line + ceiling',
    group: 'FINISH',
    unit: 'sqft',
    ratePlaceholder: 3.50,
    qtyFrom: (m) => nonTileWallSqft(m) + floorAreaSqft(m),
  },
  // FIXTURES (client-provided, always $0 ledger)
  {
    id: 'bathroom-fixture-toilet',
    label: 'Toilet (client-provided)',
    group: 'FIXTURES',
    unit: 'flat',
    ratePlaceholder: 0,
    qtyFrom: () => 1,
  },
  {
    id: 'bathroom-fixture-vanity',
    label: 'Vanity + sink + countertop (client-provided)',
    group: 'FIXTURES',
    unit: 'flat',
    ratePlaceholder: 0,
    qtyFrom: () => 1,
  },
  {
    id: 'bathroom-fixture-faucet',
    label: 'Faucet (client-provided)',
    group: 'FIXTURES',
    unit: 'flat',
    ratePlaceholder: 0,
    qtyFrom: () => 1,
  },
  {
    id: 'bathroom-fixture-shower-valve',
    label: 'Shower valve + head set (client-provided)',
    group: 'FIXTURES',
    unit: 'flat',
    ratePlaceholder: 0,
    qtyFrom: () => 1,
  },
  {
    id: 'bathroom-fixture-tub',
    label: 'Tub (client-provided)',
    group: 'FIXTURES',
    unit: 'flat',
    ratePlaceholder: 0,
    qtyFrom: (m) => (m.includesTub ? 1 : 0),
  },
  {
    id: 'bathroom-fixture-floor-tile',
    label: 'Floor tile (client-provided)',
    group: 'FIXTURES',
    unit: 'sqft',
    ratePlaceholder: 0,
    qtyFrom: floorAreaSqft,
  },
  {
    id: 'bathroom-fixture-wall-tile',
    label: 'Wall tile (client-provided)',
    group: 'FIXTURES',
    unit: 'sqft',
    ratePlaceholder: 0,
    qtyFrom: wallTileAreaSqft,
  },
  {
    id: 'bathroom-fixture-lighting',
    label: 'Lighting fixtures (client-provided)',
    group: 'FIXTURES',
    unit: 'flat',
    ratePlaceholder: 0,
    qtyFrom: () => 1,
  },
  // EXTRAS
  {
    id: 'bathroom-permit-haul-setup',
    label: 'Permit, haul-away, dumpster, setup',
    group: 'EXTRAS',
    unit: 'flat',
    ratePlaceholder: 950.00,
    qtyFrom: () => 1,
  },
]

export interface BathroomLine extends PriceLineItem {
  group: BathroomGroup
  unit: BathroomUnit
  qty: number
  rate: number
  isFixture: boolean
}

// Compute the ordered itemized list from measurements. Lines with qty=0
// are dropped (e.g. tub-set when includesTub=false, double-vanity when
// floor_area<=60 sqft) so the review UI doesn't render empty rows.
export function computeBathroomLineItems(m: BathroomMeasurements): BathroomLine[] {
  return BATHROOM_RATES.flatMap((rate) => {
    const qty = Math.max(0, rate.qtyFrom(m))
    if (qty === 0) return []
    const amount = Math.round(rate.ratePlaceholder * qty * 100) / 100
    const priceUnit: PriceLineItem['priceUnit'] =
      rate.unit === 'sqft' ? 'sqft' :
      rate.unit === 'linear_ft' ? 'linear_ft' :
      undefined
    return [{
      id: rate.id,
      label: rate.label,
      amount,
      originalAmount: amount,
      source: 'preset_calculated',
      ...(priceUnit && { priceUnit }),
      unitRate: rate.ratePlaceholder,
      unitQuantity: qty,
      group: rate.group,
      unit: rate.unit,
      qty,
      rate: rate.ratePlaceholder,
      isFixture: rate.group === 'FIXTURES',
    }]
  })
}

// Contractor scope total (excludes FIXTURES which are $0 anyway, but the
// flag lets the review UI split visually). Grand total === contractor
// subtotal because fixtures contribute $0 by definition.
export function sumBathroomContractorLineItems(lines: BathroomLine[]): number {
  return lines.filter((l) => !l.isFixture).reduce((sum, l) => sum + l.amount, 0)
}

export function sumBathroomFixtureLineItems(lines: BathroomLine[]): number {
  return lines.filter((l) => l.isFixture).reduce((sum, l) => sum + l.amount, 0)
}

export function formatBathroomUnit(unit: BathroomUnit, qty: number): string {
  if (unit === 'flat') return 'flat fee'
  const n = Math.round(qty * 100) / 100
  if (unit === 'sqft') return `${n} sqft`
  return `${n} lf`
}

// Measurement validity gate — block "Add to Project" until all 4
// numeric inputs are positive. includesTub is boolean (defaults handled
// by the configurator UI). tileCoverageHeight must be > 0 and <=
// ceilingHeight (full-to-ceiling case = equal).
export function isBathroomMeasurementsValid(m: BathroomMeasurements): boolean {
  return (
    m.length > 0 &&
    m.width > 0 &&
    m.ceilingHeight > 0 &&
    m.tileCoverageHeight > 0 &&
    m.tileCoverageHeight <= m.ceilingHeight &&
    Number.isFinite(m.length) &&
    Number.isFinite(m.width) &&
    Number.isFinite(m.ceilingHeight) &&
    Number.isFinite(m.tileCoverageHeight)
  )
}
