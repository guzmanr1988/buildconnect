import type { PriceLineItem, ServiceCategory } from '@/types'

// Ship #336 Phase A — per-service-type preset price-line-items.
// Source: Rodolfo "that will be aready preset in overhall price for the
// project choosen by the homeowner ... very detail for admin". Stub
// demo-realistic values for Phase A (mock-data-as-test-harness). Tranche-2
// replaces with real-pricing-engine integration once Rodolfo sets actual
// prices.
//
// Snapshotted onto SentProject.priceLineItems at sendProject time per
// banked feedback_immutable_ledger_freeze_at_write so price-detail LOCKS
// at intake; future preset edits do NOT retro-rewrite past projects.
//
// Per banked #103 format-SoT: this map is the canonical source for
// preset price-line-items. Consumers (sendProject in projects-store)
// read from here; no inline duplication.
//
// Per banked feedback_label_as_contract_indicator_semantics: labels here
// match what gets displayed on Lead Detail Modal + ProjectDetailDialog
// "Pricing Breakdown" sections (no separate display-vs-store divergence).

// Ship #343 Phase A — preset entries now stamp originalAmount = amount
// + source = 'preset' so vendor-edit-arrows (#344 Phase B) and
// auto_sold_adjustment EXTRA $ lines (this ship) can be distinguished
// from preset-originals at render-time.
const lineItem = (id: string, label: string, amount: number): PriceLineItem => ({
  id,
  label,
  amount,
  originalAmount: amount,
  source: 'preset',
})

export const PRICE_LINE_ITEM_PRESETS: Record<ServiceCategory, PriceLineItem[]> = {
  roofing: [
    lineItem('roofing-material', 'Material Price', 8500),
    lineItem('roofing-permit', 'Permit Price', 450),
    lineItem('roofing-tearoff', 'Tear-off & Disposal', 1800),
    lineItem('roofing-install', 'Install Price', 4200),
  ],
  windows_doors: [
    lineItem('wd-product', 'Product Price', 6800),
    lineItem('wd-permit', 'Permit Price', 350),
    lineItem('wd-install-windows', 'Install Windows Price', 1900),
    lineItem('wd-install-doors', 'Install Doors Price', 800),
    lineItem('wd-garage-door', 'Garage Door', 1800),
  ],
  pool: [
    lineItem('pool-excavation', 'Excavation', 8500),
    lineItem('pool-equipment', 'Pump & Filter Equipment', 5400),
    lineItem('pool-permit', 'Permit Price', 750),
    lineItem('pool-install', 'Install Labor', 18500),
    lineItem('pool-finish', 'Surface Finish', 9200),
  ],
  driveways: [
    lineItem('drv-material', 'Material Price', 4500),
    lineItem('drv-permit', 'Permit Price', 250),
    lineItem('drv-install', 'Install Labor', 3100),
  ],
  pergolas: [
    lineItem('pgl-material', 'Material Price', 2900),
    lineItem('pgl-permit', 'Permit Price', 200),
    lineItem('pgl-install', 'Install Labor', 1700),
  ],
  air_conditioning: [
    lineItem('ac-equipment', 'Equipment Price', 3800),
    lineItem('ac-permit', 'Permit Price', 200),
    lineItem('ac-install', 'Install Labor', 1900),
  ],
  kitchen: [
    lineItem('kit-cabinets', 'Cabinets', 8500),
    lineItem('kit-counters', 'Countertops', 4200),
    lineItem('kit-appliances', 'Appliances', 3800),
    lineItem('kit-permit', 'Permit Price', 400),
    lineItem('kit-install', 'Install Labor', 6100),
  ],
  bathroom: [
    lineItem('bath-fixtures', 'Fixtures', 4500),
    lineItem('bath-tile', 'Tile & Surfaces', 3200),
    lineItem('bath-permit', 'Permit Price', 350),
    lineItem('bath-install', 'Install Labor', 5400),
  ],
  wall_paneling: [
    lineItem('wp-material', 'Material Price', 1800),
    lineItem('wp-install', 'Install Labor', 1400),
  ],
  garage: [
    lineItem('grg-door', 'Garage Door', 1400),
    lineItem('grg-opener', 'Opener', 350),
    lineItem('grg-install', 'Install Labor', 750),
  ],
  house_painting: [
    lineItem('paint-materials', 'Paint & Materials', 1200),
    lineItem('paint-labor', 'Labor', 3400),
  ],
  blinds: [
    lineItem('bld-product', 'Product Price', 950),
    lineItem('bld-install', 'Install Labor', 450),
  ],
}
