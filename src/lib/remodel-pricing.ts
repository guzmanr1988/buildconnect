import type { PriceLineItem } from '@/types'

// Ship #475+1 — Interior Remodel configurator pricing engine.
// Kratos dispatch task_1780640326369_434 / Rod-direct 1-wk launch.
//
// PLACEHOLDER RATES (flagged for Rod to set real $ before promote).
// See REMODEL_FINDINGS.md at repo root for the rate table + structural
// map + per-line derivation + grand-total demo room calc.
//
// "Mixed per-item units" per kratos spec: area-priced lines use sqft,
// framing uses linear ft, ancillary uses flat. Platform margin is baked
// into the per-unit rate (same as wall_paneling preset entries).
//
// Order matches contractor-scope work order (DEMO → STRUCTURE → SURFACES
// → FINISH → EXTRAS) so the homeowner-review breakdown reads the way the
// crew actually executes the job, not alphabetically.

export interface RemodelMeasurements {
  length: number      // room length in feet
  width: number       // room width in feet
  ceilingHeight: number  // ceiling height in feet
  numWalls: number    // number of walls being framed/surfaced (4 = standard rect room)
}

export type RemodelUnit = 'sqft' | 'linear_ft' | 'flat'

export interface RemodelRate {
  id: string
  label: string
  group: 'DEMO' | 'STRUCTURE' | 'SURFACES' | 'FINISH' | 'EXTRAS'
  unit: RemodelUnit
  // Placeholder dollar rate. Rod replaces these with real $ before
  // any promote. Each rate is independent so Rod can edit one line
  // without re-deriving the others.
  ratePlaceholder: number
  // Selector function: from measurements → quantity (units defined
  // by `unit` above). Pure derivation; no state.
  qtyFrom: (m: RemodelMeasurements) => number
}

// Geometry derivations (rectangular room assumption):
//   avgWallWidth = (length + width) / 2
//   wallsAreaSqft = numWalls × avgWallWidth × ceilingHeight
//   ceilingAreaSqft = length × width
//   framingLf = numWalls × avgWallWidth
// For a standard 4-wall rectangular room, wallsArea = 2*(L+W)*H
// which matches perimeter * height exactly.
function avgWallWidth(m: RemodelMeasurements): number {
  return (m.length + m.width) / 2
}
function wallsAreaSqft(m: RemodelMeasurements): number {
  return m.numWalls * avgWallWidth(m) * m.ceilingHeight
}
function ceilingAreaSqft(m: RemodelMeasurements): number {
  return m.length * m.width
}
function framingLf(m: RemodelMeasurements): number {
  return m.numWalls * avgWallWidth(m)
}

export const REMODEL_RATES: RemodelRate[] = [
  // DEMO
  {
    id: 'remodel-popcorn-removal',
    label: 'Remove popcorn ceiling texture',
    group: 'DEMO',
    unit: 'sqft',
    ratePlaceholder: 2.50,
    qtyFrom: ceilingAreaSqft,
  },
  {
    id: 'remodel-ceiling-demo',
    label: 'Remove old ceiling plywood',
    group: 'DEMO',
    unit: 'sqft',
    ratePlaceholder: 2.00,
    qtyFrom: ceilingAreaSqft,
  },
  // STRUCTURE
  {
    id: 'remodel-framing',
    label: 'New stud-framed wood walls / framing',
    group: 'STRUCTURE',
    unit: 'linear_ft',
    ratePlaceholder: 12.00,
    qtyFrom: framingLf,
  },
  // SURFACES
  {
    id: 'remodel-drywall-walls',
    label: 'New drywall on walls',
    group: 'SURFACES',
    unit: 'sqft',
    ratePlaceholder: 4.00,
    qtyFrom: wallsAreaSqft,
  },
  {
    id: 'remodel-drywall-ceiling',
    label: 'New ceiling drywall / plywood',
    group: 'SURFACES',
    unit: 'sqft',
    ratePlaceholder: 4.50,
    qtyFrom: ceilingAreaSqft,
  },
  // FINISH
  {
    id: 'remodel-paint-texture',
    label: 'Paint and texture',
    group: 'FINISH',
    unit: 'sqft',
    ratePlaceholder: 3.50,
    qtyFrom: (m) => wallsAreaSqft(m) + ceilingAreaSqft(m),
  },
  // EXTRAS
  {
    id: 'remodel-permit-haul-setup',
    label: 'Permit, haul-away, setup',
    group: 'EXTRAS',
    unit: 'flat',
    ratePlaceholder: 850.00,
    qtyFrom: () => 1,
  },
]

export interface RemodelLine extends PriceLineItem {
  group: RemodelRate['group']
  unit: RemodelUnit
  qty: number
  rate: number
}

// Compute the ordered itemized list from measurements. Returns one line
// per REMODEL_RATES entry, in declaration order (DEMO → STRUCTURE →
// SURFACES → FINISH → EXTRAS). Each line stamps unitRate + unitQuantity
// + source='preset_calculated' so it integrates with the existing
// PriceLineItem shape (booking-confirmation snapshot semantics carry
// through unchanged from roofing).
export function computeRemodelLineItems(m: RemodelMeasurements): RemodelLine[] {
  return REMODEL_RATES.map((rate) => {
    const qty = Math.max(0, rate.qtyFrom(m))
    const amount = Math.round(rate.ratePlaceholder * qty * 100) / 100
    const priceUnit: PriceLineItem['priceUnit'] =
      rate.unit === 'sqft' ? 'sqft' :
      rate.unit === 'linear_ft' ? 'linear_ft' :
      undefined
    return {
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
    }
  })
}

export function sumRemodelLineItems(lines: RemodelLine[]): number {
  return lines.reduce((sum, l) => sum + l.amount, 0)
}

export function formatRemodelUnit(unit: RemodelUnit, qty: number): string {
  if (unit === 'flat') return 'flat fee'
  const n = Math.round(qty * 100) / 100
  if (unit === 'sqft') return `${n} sqft`
  return `${n} lf`
}

// Measurement validity gate — block "Add to Project" until all 4
// inputs are positive. NumWalls minimum is 1 (single accent wall);
// length/width/ceilingHeight minimum is any positive number.
export function isMeasurementsValid(m: RemodelMeasurements): boolean {
  return (
    m.length > 0 &&
    m.width > 0 &&
    m.ceilingHeight > 0 &&
    m.numWalls >= 1 &&
    Number.isFinite(m.length) &&
    Number.isFinite(m.width) &&
    Number.isFinite(m.ceilingHeight) &&
    Number.isFinite(m.numWalls)
  )
}
