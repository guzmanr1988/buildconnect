#!/usr/bin/env node
// Fix-C logic-replay test (C1-C6).
//
// Scope (per kratos msg 1780449312985): a single focused, table-driven file
// that asserts C1-C6 produce correct cents.
//
// Approach: logic-replay. Each case re-implements the C1-C6 branch from
// src/lib/api/pricing.ts inline against a hand-built priceMap. We do NOT
// import computeVendorTotal here because src/lib/supabase.ts evaluates
// import.meta.env.VITE_SUPABASE_URL at module load, which throws under
// `node --import tsx` (no Vite import-meta-env polyfill).
//
// Full integration (importing the real computeVendorTotal) needs Rod-go
// test infra: a Node loader that stubs @/lib/supabase, OR minimal vitest
// config that runs in jsdom/Vite-resolve mode. Logic-replay catches the
// fix-mechanism correctness; production-import binding remains a TODO.
//
// Usage:
//   node --import tsx tests/pricing-fix-c.test.mts

// ---------------------------------------------------------------------------
// Helpers replicated from src/lib/api/pricing.ts
// ---------------------------------------------------------------------------

const priceKey = (s: string, g: string, o: string) => `opt:${s}|${g}|${o}`
const subOptionPriceKey = (s: string, g: string, o: string, sub: string) =>
  `subopt:${s}|${g}|${o}|${sub}`

// ---------------------------------------------------------------------------
// Branches replicated from computeVendorTotal — keep these aligned with
// src/lib/api/pricing.ts. Each fn returns cents contribution for ONE branch.
// ---------------------------------------------------------------------------

type PriceMap = Map<string, number>

// C1 — X-sub routing for roofing fascia_wood / soffit_wood / etc.
//   selections['<parent>-sub'] = [subOptionId] → bill via subOptionPriceKey,
//   multiply by roofAddonLinearFt[parentOptionId] when present, zero if the
//   perimeter toggle is OFF (includePerimeter === false).
function applyCSub(
  priceMap: PriceMap,
  serviceId: string,
  subGroupId: string,
  parentOptionId: string,
  optionIds: string[],
  roofAddonLinearFt: Record<string, number> | undefined,
  includePerimeter: boolean,
): { cents: number; missingSub: string[] } {
  let cents = 0
  const missingSub: string[] = []
  const roofLinFt = roofAddonLinearFt?.[parentOptionId]
  const isPerimeterAddonZeroed = roofLinFt !== undefined && !includePerimeter
  for (const optionId of optionIds) {
    const subKey = subOptionPriceKey(serviceId, subGroupId, parentOptionId, optionId)
    const basePrice = priceMap.get(subKey)
    if (basePrice === undefined) { missingSub.push(subKey); continue }
    if (isPerimeterAddonZeroed) continue
    if (roofLinFt !== undefined) cents += basePrice * roofLinFt
    else cents += basePrice
  }
  return { cents, missingSub }
}

// C2 — pool addonQuantities synthetic pass. Only applies to serviceId='pool'.
function applyC2Pool(
  priceMap: PriceMap,
  counts: Partial<Record<string, number>>,
): { cents: number; missing: string[] } {
  const POOL_QUANTITY_MAP: Record<string, { groupId: string; optionId: string }> = {
    ledCount:     { groupId: 'addons',              optionId: 'led' },
    bubblerCount: { groupId: 'addons',              optionId: 'bubbler' },
    laminarJets:  { groupId: 'water_feature_units', optionId: 'laminar_jet' },
    waterfalls:   { groupId: 'water_feature_units', optionId: 'waterfall_unit' },
  }
  let cents = 0
  const missing: string[] = []
  for (const [field, { groupId, optionId }] of Object.entries(POOL_QUANTITY_MAP)) {
    const qty = counts[field] ?? 0
    if (qty <= 0) continue
    const key = priceKey('pool', groupId, optionId)
    const basePrice = priceMap.get(key)
    if (basePrice === undefined) { missing.push(key); continue }
    cents += basePrice * qty
  }
  return { cents, missing }
}

// C3 — kitchen sub-group linear_ft (Stone / Cabinet subgroups write into
// item.subGroupLinearFt[parentOptionId]).
// C4 — fencing perimeterFt fallback (only when serviceId='fencing' and no
// per-id source).
// Both ride the linear_ft branch of computeVendorTotal:
//   linFt = roofAddonLinearFt?.[id]
//        ?? addonLinearFt?.[id]
//        ?? subGroupLinearFt?.[id]
//        ?? (serviceId==='fencing' ? perimeterFt : undefined)
//        ?? 0
function applyLinearFt(
  basePrice: number,
  serviceId: string,
  optionId: string,
  roofAddonLinearFt: Record<string, number> | undefined,
  addonLinearFt: Record<string, number> | undefined,
  subGroupLinearFt: Record<string, number> | undefined,
  perimeterFt: number | undefined,
  includePerimeter: boolean,
): number {
  const roofLinFt = roofAddonLinearFt?.[optionId]
  if (roofLinFt !== undefined && !includePerimeter) return 0
  const linFt = roofLinFt
    ?? addonLinearFt?.[optionId]
    ?? subGroupLinearFt?.[optionId]
    ?? (serviceId === 'fencing' ? perimeterFt : undefined)
    ?? 0
  return basePrice * linFt
}

// C5 — pergolas multi-structure. sqft chain extended with
// structureMeasurements[optionId].sqft BEFORE scalar item.areaSqft, so the
// smaller structure no longer gets dropped.
function applySqft(
  basePrice: number,
  optionId: string,
  customSizeSqft: Record<string, number> | undefined,
  structureMeasurements: Record<string, { sqft: number }> | undefined,
  areaSqft: number | undefined,
  roofAreaSqft: number | undefined,
): number {
  const rawSqft = customSizeSqft?.[optionId]
    ?? structureMeasurements?.[optionId]?.sqft
    ?? areaSqft
    ?? roofAreaSqft
    ?? 0
  return basePrice * rawSqft
}

// C6 — roof permit opt-out gate. Only applies to roofing service.
//   if NO roofing cart item has roofPermit !== 'no', SKIP the permit.
function shouldBillRoofingPermit(
  cartItems: { serviceId: string; roofPermit?: 'yes' | 'no' }[],
): boolean {
  return cartItems.some(
    (it) => it.serviceId === 'roofing' && it.roofPermit !== 'no',
  )
}

// ---------------------------------------------------------------------------
// Table-driven cases
// ---------------------------------------------------------------------------

type Case = { name: string; actual: number | boolean; expected: number | boolean }
const cases: Case[] = []

// ---------- C1: X-sub fascia + soffit roof addons ----------
{
  const pm = new Map<string, number>([
    [subOptionPriceKey('roofing', 'products', 'fascia_wood', 'pine_1x6'), 1200],
    [subOptionPriceKey('roofing', 'products', 'soffit_wood', 'cedar_1x4'), 950],
  ])
  // 150 linear ft fascia × $12.00 = $1,800.00 → 180000 cents
  // 200 linear ft soffit × $9.50 = $1,900.00 → 190000 cents
  const fascia = applyCSub(pm, 'roofing', 'products', 'fascia_wood',
    ['pine_1x6'], { fascia_wood: 150 }, true)
  const soffit = applyCSub(pm, 'roofing', 'products', 'soffit_wood',
    ['cedar_1x4'], { soffit_wood: 200 }, true)
  cases.push({ name: 'C1 fascia X-sub × linFt', actual: fascia.cents, expected: 1200 * 150 })
  cases.push({ name: 'C1 soffit X-sub × linFt', actual: soffit.cents, expected: 950 * 200 })

  // C1 perimeter-toggle OFF zeros the X-sub line entirely.
  const zeroed = applyCSub(pm, 'roofing', 'products', 'fascia_wood',
    ['pine_1x6'], { fascia_wood: 150 }, false)
  cases.push({ name: 'C1 X-sub zeroed when includePerimeter=false', actual: zeroed.cents, expected: 0 })

  // C1 missing-price routes to missingSub, doesn't crash.
  const miss = applyCSub(pm, 'roofing', 'products', 'fascia_wood',
    ['unknown_sub'], { fascia_wood: 150 }, true)
  cases.push({ name: 'C1 unknown sub → missingSub.length=1', actual: miss.missingSub.length, expected: 1 })
  cases.push({ name: 'C1 unknown sub → cents=0', actual: miss.cents, expected: 0 })
}

// ---------- C2: pool synthetic-quantity pass ----------
{
  const pm = new Map<string, number>([
    [priceKey('pool', 'addons', 'led'), 7500],              // $75 per LED
    [priceKey('pool', 'addons', 'bubbler'), 25000],         // $250 per bubbler
    [priceKey('pool', 'water_feature_units', 'laminar_jet'), 65000],   // $650 per jet
    [priceKey('pool', 'water_feature_units', 'waterfall_unit'), 120000],// $1200 per waterfall
  ])
  // 6 LEDs + 2 bubblers + 3 laminar jets + 1 waterfall
  // = 75*6 + 250*2 + 650*3 + 1200*1 = 450 + 500 + 1950 + 1200 = $4,100 → 410000 cents
  const r = applyC2Pool(pm, { ledCount: 6, bubblerCount: 2, laminarJets: 3, waterfalls: 1 })
  cases.push({ name: 'C2 pool 4-addon synthetic sum', actual: r.cents, expected: 7500*6 + 25000*2 + 65000*3 + 120000*1 })

  // C2 zero-quantity skips (no missing, no cents).
  const z = applyC2Pool(pm, { ledCount: 0, bubblerCount: 0 })
  cases.push({ name: 'C2 zero-quantity contributes 0', actual: z.cents, expected: 0 })
  cases.push({ name: 'C2 zero-quantity no missing', actual: z.missing.length, expected: 0 })

  // C2 missing priceMap row surfaces in missing[] (badge stays honest).
  const pmPartial = new Map<string, number>([
    [priceKey('pool', 'addons', 'led'), 7500],
  ])
  const partial = applyC2Pool(pmPartial, { ledCount: 4, waterfalls: 1 })
  cases.push({ name: 'C2 partial-priced contributes only LED', actual: partial.cents, expected: 7500 * 4 })
  cases.push({ name: 'C2 unpriced waterfall → missing.length=1', actual: partial.missing.length, expected: 1 })
}

// ---------- C3: kitchen subGroupLinearFt ----------
{
  // Stone subgroup → cabinet_stone option, vendor priced at $45/ft.
  // User picks 22 linear ft of cabinet → 22 × $45 = $990 → 99000 cents.
  const basePrice = 4500
  const cents = applyLinearFt(basePrice, 'kitchen', 'cabinet_stone',
    undefined, undefined, { cabinet_stone: 22 }, undefined, true)
  cases.push({ name: 'C3 kitchen subGroupLinearFt × basePrice', actual: cents, expected: 4500 * 22 })

  // C3 priority: per-id addonLinearFt wins over subGroupLinearFt for same id.
  const winsPerId = applyLinearFt(basePrice, 'kitchen', 'cabinet_stone',
    undefined, { cabinet_stone: 30 }, { cabinet_stone: 22 }, undefined, true)
  cases.push({ name: 'C3 addonLinearFt wins over subGroupLinearFt', actual: winsPerId, expected: 4500 * 30 })
}

// ---------- C4: fencing perimeterFt fallback ----------
{
  const basePrice = 8500 // $85/ft chain-link
  // 120 ft perimeter → 120 × $85 = $10,200 → 1020000 cents.
  const cents = applyLinearFt(basePrice, 'fencing', 'chain_link',
    undefined, undefined, undefined, 120, true)
  cases.push({ name: 'C4 fencing perimeterFt × basePrice', actual: cents, expected: 8500 * 120 })

  // C4 only fires for serviceId==='fencing'; pergola perimeterFt is ignored
  // (perimeterFt fallback is fencing-scoped).
  const nonFencing = applyLinearFt(basePrice, 'pergola', 'cap_rail',
    undefined, undefined, undefined, 120, true)
  cases.push({ name: 'C4 perimeterFt ignored when serviceId!=fencing', actual: nonFencing, expected: 0 })

  // C4 explicit subGroupLinearFt for same option wins over perimeterFt
  // (subGroupLinearFt sits ABOVE perimeterFt in the ?? chain).
  const subBeatsPerimeter = applyLinearFt(basePrice, 'fencing', 'chain_link',
    undefined, undefined, { chain_link: 50 }, 120, true)
  cases.push({ name: 'C4 subGroupLinearFt wins over perimeterFt', actual: subBeatsPerimeter, expected: 8500 * 50 })
}

// ---------- C5: pergolas multi-structure structureMeasurements ----------
{
  const basePrice = 4500 // $45/sqft wood pergola
  // Pergola: 220 sqft. Terrace: 180 sqft. structureMeasurements differentiates.
  // Without C5, item.areaSqft would have collapsed to one structure; with
  // structureMeasurements the smaller structure is preserved.
  const pergolaCents = applySqft(basePrice, 'wood_pergola',
    undefined,
    { wood_pergola: { sqft: 220 } },
    180,        // scalar areaSqft would have masked the 220 — C5 chain hits structureMeasurements first
    undefined,
  )
  cases.push({ name: 'C5 structureMeasurements wins over scalar areaSqft', actual: pergolaCents, expected: 4500 * 220 })

  // C5 priority: customSizeSqft (per-option-id) still wins over structureMeasurements.
  const customWins = applySqft(basePrice, 'wood_pergola',
    { wood_pergola: 300 },
    { wood_pergola: { sqft: 220 } },
    180,
    undefined,
  )
  cases.push({ name: 'C5 customSizeSqft wins over structureMeasurements', actual: customWins, expected: 4500 * 300 })

  // C5 falls through to scalar areaSqft when no structureMeasurements entry.
  const fallback = applySqft(basePrice, 'wood_pergola',
    undefined, undefined, 180, undefined)
  cases.push({ name: 'C5 falls through to scalar areaSqft when missing', actual: fallback, expected: 4500 * 180 })
}

// ---------- C6: roof permit opt-out gate ----------
{
  // Default behavior (roofPermit undefined) → bill permit.
  cases.push({
    name: 'C6 undefined roofPermit → permit billed',
    actual: shouldBillRoofingPermit([{ serviceId: 'roofing' }]),
    expected: true,
  })
  // Explicit 'yes' → bill permit.
  cases.push({
    name: 'C6 roofPermit=yes → permit billed',
    actual: shouldBillRoofingPermit([{ serviceId: 'roofing', roofPermit: 'yes' }]),
    expected: true,
  })
  // Explicit 'no' on the only roofing item → skip permit.
  cases.push({
    name: 'C6 roofPermit=no → permit skipped',
    actual: shouldBillRoofingPermit([{ serviceId: 'roofing', roofPermit: 'no' }]),
    expected: false,
  })
  // Two roofing items, one 'no', one default → ANY-kept rule bills permit.
  cases.push({
    name: 'C6 mixed roofing items (one no, one default) → permit billed',
    actual: shouldBillRoofingPermit([
      { serviceId: 'roofing', roofPermit: 'no' },
      { serviceId: 'roofing' },
    ]),
    expected: true,
  })
  // Non-roofing item with roofPermit='no' is irrelevant (gate is roofing-only).
  cases.push({
    name: 'C6 non-roofing roofPermit=no ignored (no roofing item)',
    actual: shouldBillRoofingPermit([{ serviceId: 'pool' }]),
    expected: false,
  })
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
for (const c of cases) {
  const ok = c.actual === c.expected
  if (ok) { passed++; console.log(`  PASS  ${c.name}`) }
  else { failed++; console.log(`  FAIL  ${c.name}  expected=${c.expected}  actual=${c.actual}`) }
}
console.log(`\n${passed} passed, ${failed} failed (${cases.length} total)`)
if (failed > 0) process.exit(1)
