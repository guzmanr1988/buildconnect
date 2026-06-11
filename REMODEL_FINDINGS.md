# Interior Remodel — Configurator Build Notes

**Ship #475+1 — Rod-direct 1-week launch (task_1780640326369_434).**
Preview-only build. **No promote** — rates are placeholders.

## What got built

A measurement-driven configurator for interior room remodels (walls + ceilings).
Homeowner enters Length, Width, Ceiling Height, Wall Count *once*; every
itemized line auto-computes from a single rate table.

Route: `/home/service/remodel`
Surface: Interior Remodel tile on `/home`
Flow: Measurements → Permit → Address → Review → Add to Project

## Files touched

| Type | Path | Purpose |
|------|------|---------|
| New | `src/lib/remodel-pricing.ts` | Rate table + geometry + line-item compute |
| New | `src/features/homeowner/components/remodel-configurator.tsx` | 4-step wizard UI |
| Edit | `src/types/index.ts` | Added `'remodel'` to ServiceCategory union |
| Edit | `src/lib/constants.ts` | SERVICE_CATALOG `remodel` entry, status:live, no chip optionGroups |
| Edit | `src/lib/price-line-item-presets.ts` | `remodel: []` (per-measurement compute path) |
| Edit | `src/lib/satellite-measure/types.ts` | `remodel: 0` (no satellite fallback) |
| Edit | `src/stores/cart-store.ts` | CartItem.remodelMeasurements field |
| Edit | `src/features/homeowner/pages/service-detail.tsx` | Early return → `<RemodelConfigurator />` |
| Edit | `src/features/homeowner/pages/cart.tsx` | serviceAbbrev: `remodel: 'Interior Remodel'` |
| Edit | `src/features/homeowner/pages/booking-confirmation.tsx` | Dispatches to `computeRemodelLineItems` at snapshot time |

## Rate table (PLACEHOLDERS — Rod to set real $ before promote)

Order matches contractor-scope work order (DEMO → STRUCTURE → SURFACES → FINISH → EXTRAS).

| # | Group | Line | Unit | Placeholder Rate | Quantity formula |
|---|-------|------|------|------------------|------------------|
| 1 | DEMO | Remove popcorn ceiling texture | sqft | **$2.50/sqft** | ceiling_area |
| 2 | DEMO | Remove old ceiling plywood | sqft | **$2.00/sqft** | ceiling_area |
| 3 | STRUCTURE | New stud-framed wood walls / framing | linear ft | **$12.00/lf** | framing_lf |
| 4 | SURFACES | New drywall on walls | sqft | **$4.00/sqft** | walls_area |
| 5 | SURFACES | New ceiling drywall / plywood | sqft | **$4.50/sqft** | ceiling_area |
| 6 | FINISH | Paint and texture | sqft | **$3.50/sqft** | walls_area + ceiling_area |
| 7 | EXTRAS | Permit, haul-away, setup | flat | **$850.00** | 1 |

Each rate is independent — Rod can change any one line without re-deriving the others.
File: `src/lib/remodel-pricing.ts` → `REMODEL_RATES`.

## Geometry derivations (rectangular room assumption)

```
avgWallWidth   = (length + width) / 2
wallsAreaSqft  = numWalls × avgWallWidth × ceilingHeight
ceilingAreaSqft = length × width
framingLf      = numWalls × avgWallWidth
```

For a standard 4-wall rectangular room, walls_area collapses to the canonical
`perimeter × ceilingHeight = 2 × (length + width) × ceilingHeight`. The
`numWalls × avgWallWidth × ceilingHeight` form lets a homeowner price a
single accent wall (numWalls=1) or an L-shaped room (numWalls=6) without
geometry changes.

## Worked example — 12 × 14 ft room, 9 ft ceiling, 4 walls

```
avgWallWidth = (12 + 14) / 2     = 13 ft
wallsArea    = 4 × 13 × 9        = 468 sqft
ceilingArea  = 12 × 14           = 168 sqft
framingLf    = 4 × 13            =  52 lf
```

Per-line breakdown:

| Line | Qty | Rate | Line total |
|------|-----|------|------------|
| Remove popcorn ceiling texture | 168 sqft | $2.50/sqft | **$420.00** |
| Remove old ceiling plywood | 168 sqft | $2.00/sqft | **$336.00** |
| New stud-framed wood walls / framing | 52 lf | $12.00/lf | **$624.00** |
| New drywall on walls | 468 sqft | $4.00/sqft | **$1,872.00** |
| New ceiling drywall / plywood | 168 sqft | $4.50/sqft | **$756.00** |
| Paint and texture | 636 sqft | $3.50/sqft | **$2,226.00** |
| Permit, haul-away, setup | 1 flat | $850.00 | **$850.00** |
| | | **Grand total** | **$7,084.00** |

## Integration semantics

* **Cart write**: `CartItem.remodelMeasurements = { length, width, ceilingHeight, numWalls }`.
* **Booking-confirmation snapshot**: when `pendingItem.serviceId === 'remodel'`,
  `booking-confirmation.tsx` calls `computeRemodelLineItems(measurements)` and
  passes the result as `computedLineItems` to `sendProject` — same path roofing
  uses. Lines are stamped `source: 'preset_calculated'` with `unitRate`,
  `unitQuantity`, and `priceUnit` so the price-detail breakdown carries the
  per-unit derivation (immutable-ledger-freeze-at-write).
* **Edit-roundtrip**: Cart "Edit" reuses the same component via
  `location.state.editItem`; updates the existing item rather than appending.

## What's intentionally NOT in this build

* No vendor-side per-rate editing — rates live in the static `REMODEL_RATES`
  table. When Rod sets real $, replace the `ratePlaceholder` values in
  `src/lib/remodel-pricing.ts` and ship; no DB write needed.
* No chip-style optionGroups (mixing in chips defeats the whole "enter dimensions once" UX).
* No satellite measure fallback (`SERVICE_DEFAULT_AREAS.remodel = 0`).
* English only — no Spanish strings anywhere (kratos hard rule).
