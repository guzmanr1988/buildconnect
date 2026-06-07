# Bathroom Remodel — Configurator Deep-Read

**Ship #475+2 deep-read for task_1780641255537_475.**
Preview-only proposal — awaiting kratos/Rod sign-off on shape before build.

## Brief recap

> "Bathroom Remodel configurator with fixtures-as-$0 split — contractor labor +
> demo + prep + materials platform-priced; fixtures shown as $0 client-provided."

Measurement-driven (NOT chips). Same wizard shell as Interior Remodel. Items
grouped contractor-scope order with FIXTURES as a separate visually-distinct
$0 section so the homeowner sees what they're responsible for sourcing.

## Existing state

- `SERVICE_CATALOG['bathroom']` in `src/lib/constants.ts:518-528` is `status:'draft'` with badge `'Coming Soon'`, empty `optionGroups`. No live wizard.
- `PRICE_LINE_ITEM_PRESETS.bathroom` in `src/lib/price-line-item-presets.ts:80-85` is a 4-line flat preset ($13,450 placeholder, no per-measurement compute). Used by QA personas only (`qa-personas.ts:294`).
- No measurement geometry path exists. `SERVICE_DEFAULT_AREAS.bathroom` currently has a non-zero satellite fallback (should set to 0 like remodel — bathrooms aren't measurable from satellite).

## Proposed measurement inputs (4 fields, same wizard shape as remodel)

| Field | Unit | Hint | Used by |
|-------|------|------|---------|
| Length | ft | Longest wall | floor / walls / framing |
| Width | ft | Shorter side | floor / walls / framing |
| Ceiling Height | ft | Typical 8-9 | wall area |
| Tile Coverage Height | ft | How high tile goes on walls. 4 = wainscot, 6 = mid, ceiling = full | wall tile area |

Plus one **Includes tub?** toggle (yes/no). Tub adds a tub-set line + tub
surround tile area; no-tub assumes walk-in shower.

Optional (defer to v2 if 1-week ship requires): **Bathroom size class**
(Half / Full / Master) — for now derive from sqft (`<25` = half, `25-60` = full,
`>60` = master). Master adds double-vanity install labor line.

## Geometry derivations

```
floor_area_sqft      = length × width
perimeter_ft         = 2 × (length + width)
wall_area_total_sqft = perimeter_ft × ceiling_height
wall_tile_area_sqft  = perimeter_ft × tile_coverage_height
non_tile_wall_sqft   = wall_area_total - wall_tile_area  // paint above tile
shower_zone_sqft     = includesTub ? 50 : 60             // standard tub surround vs walk-in
```

## Proposed line items (rate-table shape — Rod fills $ before promote)

Grouped in contractor-scope work order. Last group `FIXTURES` is always $0 ledger.

| # | Group | Line | Unit | PLACEHOLDER Rate | Quantity formula |
|---|-------|------|------|------------------|------------------|
| 1 | DEMO | Gut existing bathroom (toilet/tub/vanity/tile/drywall) | flat | **$1,200.00** | 1 |
| 2 | ROUGH-IN | Plumbing rough-in (tub or shower drain + toilet + vanity supply) | flat | **$1,800.00** | 1 |
| 3 | ROUGH-IN | Electrical rough-in (GFCI + vanity light + exhaust fan) | flat | **$650.00** | 1 |
| 4 | SUBSTRATE | Cement board + waterproofing membrane (shower zone) | sqft | **$6.00/sqft** | shower_zone_sqft |
| 5 | SUBSTRATE | Subfloor leveling | sqft | **$2.50/sqft** | floor_area_sqft |
| 6 | TILE | Floor tile install (labor only, tile supplied) | sqft | **$8.00/sqft** | floor_area_sqft |
| 7 | TILE | Wall tile install (labor only, tile supplied) | sqft | **$9.00/sqft** | wall_tile_area_sqft |
| 8 | INSTALL | Vanity set + plumb hookup | flat | **$450.00** | 1 |
| 9 | INSTALL | Toilet set + wax ring + supply line | flat | **$250.00** | 1 |
| 10 | INSTALL | Shower valve trim-out + head install | flat | **$300.00** | 1 |
| 11 | INSTALL | Tub set + drain trim | flat | **$400.00** | includesTub ? 1 : 0 |
| 12 | INSTALL | Mirror + accessories (towel bar, TP holder, hooks) | flat | **$180.00** | 1 |
| 13 | FINISH | Paint above tile line + ceiling | sqft | **$3.50/sqft** | non_tile_wall_sqft + floor_area_sqft |
| 14 | FIXTURES | Toilet (client-provided) | flat | **$0.00** | 1 |
| 15 | FIXTURES | Vanity + sink + countertop (client-provided) | flat | **$0.00** | 1 |
| 16 | FIXTURES | Faucet (client-provided) | flat | **$0.00** | 1 |
| 17 | FIXTURES | Shower valve + head set (client-provided) | flat | **$0.00** | 1 |
| 18 | FIXTURES | Tub (client-provided) | flat | **$0.00** | includesTub ? 1 : 0 |
| 19 | FIXTURES | Floor tile (client-provided) | sqft | **$0.00** | floor_area_sqft |
| 20 | FIXTURES | Wall tile (client-provided) | sqft | **$0.00** | wall_tile_area_sqft |
| 21 | FIXTURES | Lighting fixtures (client-provided) | flat | **$0.00** | 1 |
| 22 | EXTRAS | Permit, haul-away, dumpster, setup | flat | **$950.00** | 1 |

## Worked example — 6 × 8 ft full bath, 9 ft ceiling, 6 ft tile, includes tub

```
floor_area       = 6 × 8       = 48 sqft
perimeter        = 2×(6+8)     = 28 ft
wall_area_total  = 28 × 9      = 252 sqft
wall_tile_area   = 28 × 6      = 168 sqft
non_tile_wall    = 252 - 168   = 84 sqft
shower_zone      = 50 (tub)
```

Per-line totals (placeholder):

| Line | Qty | Rate | Line total |
|------|-----|------|------------|
| Gut existing bathroom | 1 | $1,200 | **$1,200.00** |
| Plumbing rough-in | 1 | $1,800 | **$1,800.00** |
| Electrical rough-in | 1 | $650 | **$650.00** |
| Cement board + membrane | 50 sqft | $6.00 | **$300.00** |
| Subfloor leveling | 48 sqft | $2.50 | **$120.00** |
| Floor tile install | 48 sqft | $8.00 | **$384.00** |
| Wall tile install | 168 sqft | $9.00 | **$1,512.00** |
| Vanity set + plumb | 1 | $450 | **$450.00** |
| Toilet set | 1 | $250 | **$250.00** |
| Shower valve trim-out | 1 | $300 | **$300.00** |
| Tub set | 1 | $400 | **$400.00** |
| Mirror + accessories | 1 | $180 | **$180.00** |
| Paint above tile + ceiling | 132 sqft | $3.50 | **$462.00** |
| Permit, haul-away, setup | 1 | $950 | **$950.00** |
| | | **Contractor subtotal** | **$8,958.00** |
| Fixtures (all client-provided) | — | $0.00 | **$0.00** |
| | | **Grand total** | **$8,958.00** |

## UI proposal for the REVIEW step

Two visually distinct sections so the split is unambiguous:

1. **CONTRACTOR SCOPE** — grouped DEMO/ROUGH-IN/SUBSTRATE/TILE/INSTALL/FINISH/EXTRAS, each line shows `<label> — <qty> <unit> × $<rate>/<unit> (placeholder rate) = $<total>` (same row shape as remodel).
2. **FIXTURES (client-provided)** — separate card with muted styling, info-callout banner *"You supply these. Bring them on install day, or have them delivered to the project address."*, every line shows `$0.00` with `(client-provided)` subscript instead of the placeholder-rate label.

Estimated total = contractor subtotal only (fixtures don't roll up).

## Files to touch (build phase — DO NOT TOUCH yet)

| Type | Path | Change |
|------|------|--------|
| New | `src/lib/bathroom-pricing.ts` | Rate table + geometry + compute (mirror `remodel-pricing.ts`) |
| New | `src/features/homeowner/components/bathroom-configurator.tsx` | 4-step wizard (mirror `remodel-configurator.tsx`) |
| Edit | `src/lib/constants.ts` | Flip `bathroom` to `status:'live'`, drop "Coming Soon" badge, update tagline/features |
| Edit | `src/lib/price-line-item-presets.ts` | Change `bathroom` from flat 4-line preset to `[]` (per-measurement compute path) |
| Edit | `src/lib/satellite-measure/types.ts` | Set `bathroom: 0` (no satellite fallback) |
| Edit | `src/stores/cart-store.ts` | Add `bathroomMeasurements?: { length, width, ceilingHeight, tileCoverageHeight, includesTub }` to CartItem |
| Edit | `src/features/homeowner/pages/service-detail.tsx` | Early-return → `<BathroomConfigurator />` (mirror remodel pattern) |
| Edit | `src/features/homeowner/pages/cart.tsx` | `serviceAbbrev: bathroom: 'Bathroom Remodel'` already present? verify |
| Edit | `src/features/homeowner/pages/booking-confirmation.tsx` | Dispatch to `computeBathroomLineItems` at snapshot time for `serviceId === 'bathroom'` |
| Edit | `src/lib/qa-personas.ts` line 294 | Migrate QA persona off flat preset → real measurements + computeBathroomLineItems (or accept the existing flat preset stays only for legacy QA fixtures — pick at build time) |

## Open questions for kratos/Rod before build

1. **Tile coverage height input** — accept as a free-form number (3-9 ft) OR present 3 buttons (Wainscot 4ft / Mid 6ft / Full to ceiling)? Buttons are more contractor-friendly; free-form is more remodel-shape-aligned.
2. **Master bathroom multiplier** — auto-apply double-vanity install (+$300) when floor_area > 60 sqft? Or expose a separate "Double vanity?" toggle?
3. **Fixture line ordering in $0 section** — list every fixture (toilet/vanity/faucet/shower/tub/tile/lighting) OR collapse to a single "Fixtures (client-provided): $0.00" with an expandable detail? Detailed list reads stronger but doubles the visual length.
4. **No-tub walk-in shower** — does shower_zone=60 sqft cover typical glass enclosure + curb + niche? Or do we need an extra `glass_enclosure_lf` input?

## What's intentionally NOT in this proposal

- No vendor-side rate editing — rates live in static `BATHROOM_RATES` like remodel.
- No chip-style optionGroups (defeats the dimensions-once UX).
- No satellite fallback.
- English only (per `feedback_app_ui_english_only_chat_spanglish`).
- No promote until Rod confirms shape + sets real $ values.

## Suggested next handshake

Send this doc to kratos → kratos forwards to Rod → Rod answers the 4 open
questions + signs off on the line list → I build the 1-week ship in one shot
following the remodel template exactly.
