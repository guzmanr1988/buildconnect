# Blinds — Configurator Deep-Read

**Launch-leg 4 deep-read for task_1780648310573_278.**
READ-ONLY proposal — parked off apex HEAD, awaiting kratos/Rod sign-off
on shape before any build.

## Brief recap

> "Same job you nailed on Bathroom — produce a deep-read doc with existing
> state, measurement inputs + geometry, proposed line items, worked example,
> REVIEW UI, files-to-touch, open Qs for Rod. English-only. NO build."

Goal: by morning brief, every launch leg (Remodel / Bathroom / Blinds) has a
build-ready deep-read so Rod answers every Q in one batch and we execute the
chain fast against the 1-week deadline.

## Existing state — IMPORTANT divergence from Remodel/Bathroom

Blinds is **already shipped live** (ship #260, `status:'live'`) with a
**chip-driven** configurator — not measurement-driven. Existing
`SERVICE_CATALOG['blinds']` in `src/lib/constants.ts:840-913` defines 5 chip
`optionGroups`:

| Group | Type | Options |
|-------|------|---------|
| `type` | multi | roller / venetian / roman / cellular / vertical / blackout / motorized |
| `material` | single | fabric / vinyl / faux_wood / real_wood / aluminum / bamboo |
| `control` | single | cordless / traditional_cord / wand / motorized |
| `mount` | single | inside_mount / outside_mount |
| `light_control` | single | blackout / room_darkening / light_filtering / sheer |

`PRICE_LINE_ITEM_PRESETS.blinds` (`src/lib/price-line-item-presets.ts:99-102`)
is the flat 2-line `bld-product $950 / bld-install $450` preset. Satellite
fallback `SERVICE_DEFAULT_AREAS.blinds = 50` (sqft).

**The big framing Q** (Q1 below): Blinds is live and working today — touching
it at all is a deliberate choice, not a given. Options Rod sees:

- **(A) Leave Blinds untouched** — explicit anchor. Don't-touch-working-surfaces
  is the safe default.
- **(B) Hybrid** — keep chips for style + layer measurement-driven pricing on top.
- **(C) Full replacement** — drop chips, go pure measurement-driven like Remodel/Bathroom.

**My lean IF Rod wants change:** (B) Hybrid. Keep the chips (taste/style is
real to the customer) but add per-window count + dimensions as quantity
multipliers that drive per-line pricing. Chips pick *what*; measurements pick
*how many / how big*. Gets Remodel/Bathroom itemized-line transparency
without losing the catalog feel.

**My lean IF Rod is unsure:** (A). Don't touch what's working.

## Proposed measurement inputs (5 fields, layered on top of existing chips)

| Field | Unit | Hint | Used by |
|-------|------|------|---------|
| Number of windows | count | How many windows you want covered (whole house or specific rooms — pick a count) | quantity multiplier |
| Avg window width | inches | Most home windows are 24-48in; default 36in | per-window sqft |
| Avg window height | inches | Most home windows are 48-72in; default 60in | per-window sqft |
| Haul-away old blinds | yes/no | Remove what's currently on the windows | flat upgrade line |
| Includes professional measurement visit | yes/no | Pro comes out to measure exact for custom-fit | flat upgrade line |

Style chips (type / material / control / mount / light_control) stay exactly
as today — they drive the per-window product rate, not quantity.

**Defer to v2:** per-window dimensions (each window's own W × H instead of
average). Adds significant UI complexity for marginal pricing accuracy on
v1; "avg × count" is good enough for placeholder-rate stage where Rod cares
about ledger shape not penny-perfect totals.

## Geometry derivations

```
per_window_sqin   = avgW × avgH
per_window_sqft   = per_window_sqin / 144
total_sqft        = numWindows × per_window_sqft
total_lf_headrail = numWindows × (avgW / 12)    // for outside-mount bracket lf if needed
```

## Proposed line items (rate-table shape — Rod fills $ before promote)

Grouped: MEASURE → PRODUCT → INSTALL → UPGRADES → HAUL-AWAY → EXTRAS

Product rate VARIES BY `blindType` chip pick — Rod sets one rate per type.

| # | Group | Line | Unit | PLACEHOLDER Rate | Quantity formula |
|---|-------|------|------|------------------|------------------|
| 1 | MEASURE | Professional measurement visit | flat | **$99.00** | includesMeasureVisit ? 1 : 0 |
| 2 | PRODUCT | Blinds — `<typeLabel>` | sqft | **$X/sqft** (per-type, see below) | total_sqft |
| 3 | INSTALL | Per-window install labor | per window | **$35.00/window** | numWindows |
| 4 | UPGRADES | Cordless lift upgrade | per window | **$20.00/window** | control === 'cordless' ? numWindows : 0 |
| 5 | UPGRADES | Motorization (motor + remote, per window) | per window | **$250.00/window** | control === 'motorized' ? numWindows : 0 |
| 6 | UPGRADES | Inside-mount precision adjustment | per window | **$15.00/window** | mount === 'inside_mount' ? numWindows : 0 |
| 7 | HAUL-AWAY | Remove + dispose of existing blinds | flat | **$50.00** | haulAwayOld ? 1 : 0 |
| 8 | EXTRAS | Order processing, fabrication setup | flat | **$75.00** | 1 |

**Per-type product rates (Rod fills):**

| `blindType` chip | PLACEHOLDER $/sqft |
|------------------|--------------------|
| roller | **$12.00/sqft** |
| venetian | **$10.00/sqft** |
| cellular | **$18.00/sqft** |
| faux_wood | **$14.00/sqft** |
| real_wood | **$24.00/sqft** |
| roman | **$22.00/sqft** |
| vertical | **$10.00/sqft** |
| blackout | **$16.00/sqft** |
| motorized | (folded into UPGRADES #5 — type chip still affects fabric/material rate via material chip) |

NOTE: `material` and `light_control` chips don't drive their own line in v1
(folded into type rate). v2 could split material-upcharge as separate line
if Rod wants finer breakdown.

## Worked example — 8 windows, 36×60in avg, roller type, cordless, inside-mount, haul-away yes, measure visit yes

```
per_window_sqft = (36 × 60) / 144 = 15 sqft
total_sqft      = 8 × 15           = 120 sqft
total_lf        = 8 × 3            = 24 ft
```

Per-line totals (placeholder):

| Line | Qty | Rate | Line total |
|------|-----|------|------------|
| Professional measurement visit | 1 flat | $99 | **$99.00** |
| Blinds — Roller Shades | 120 sqft | $12.00/sqft | **$1,440.00** |
| Per-window install labor | 8 windows | $35/window | **$280.00** |
| Cordless lift upgrade | 8 windows | $20/window | **$160.00** |
| Inside-mount precision adjustment | 8 windows | $15/window | **$120.00** |
| Remove + dispose of existing blinds | 1 flat | $50 | **$50.00** |
| Order processing, fabrication setup | 1 flat | $75 | **$75.00** |
| | | **Grand total** | **$2,224.00** |

For comparison: same 8-window job with **motorized** (no cordless, +motorization)
real_wood swap →

| Line | Qty | Rate | Line total |
|------|-----|------|------------|
| Measurement visit | 1 | $99 | $99.00 |
| Blinds — Real Wood | 120 sqft | $24.00/sqft | **$2,880.00** |
| Install labor | 8 | $35 | $280.00 |
| Motorization | 8 | $250 | **$2,000.00** |
| Inside-mount adjust | 8 | $15 | $120.00 |
| Haul-away | 1 | $50 | $50.00 |
| Setup | 1 | $75 | $75.00 |
| | | **Grand total** | **$5,504.00** |

## UI proposal for the REVIEW step

Same grouped-card layout as Remodel/Bathroom: one card per group
(MEASURE / PRODUCT / INSTALL / UPGRADES / HAUL-AWAY / EXTRAS), each row
shows `<label> — <qty> <unit> × $<rate>/<unit> (placeholder rate) = $<total>`.
Estimated total at bottom. Above the line list, a recap card shows the
chip picks chosen ("Roller Shades · Cordless · Inside Mount · Light
Filtering") so Rod-the-reviewer can sanity-check both axes — style ✓ and
pricing ✓ — on one screen.

Zero-qty UPGRADE rows hidden (don't render motorization line when control !==
motorized).

## Wizard step proposal

Same 4-step shell as Remodel/Bathroom:

1. **Style** — render existing 5 chip optionGroups exactly as today
2. **Measurements** — 5 inputs from §"Proposed measurement inputs" above
3. **Permit / Address** — Permit step gated like other configurators? Blinds
   doesn't typically require permits — skip Permit, just collect Address.
   So actually **3 steps** total: Style → Measurements → Address → Review.
   (OR 4 if Rod wants Permit consistency across all configurators — open Q3 below.)
4. **Review** — itemized breakdown per §"UI proposal" above

## Files to touch (build phase — DO NOT TOUCH yet)

| Type | Path | Change |
|------|------|--------|
| New | `src/lib/blinds-pricing.ts` | Rate table + per-type rates + geometry + compute (mirror `remodel-pricing.ts`) |
| New | `src/features/homeowner/components/blinds-configurator.tsx` | 3-or-4 step wizard, dispatches to existing chip UI for Style step + new MeasurementsStep |
| Edit | `src/lib/constants.ts` | Keep `blinds` entry as-is (chip optionGroups stay) — no change |
| Edit | `src/lib/price-line-item-presets.ts` | Change `blinds` from flat 2-line preset to `[]` (per-measurement compute path); preserve legacy preset behind a feature flag for QA personas? open Q5 |
| Edit | `src/lib/satellite-measure/types.ts` | Set `blinds: 0` (no satellite fallback — windows aren't satellite-measurable) |
| Edit | `src/stores/cart-store.ts` | Add `blindsMeasurements?: { numWindows, avgWindowWidthInches, avgWindowHeightInches, haulAwayOld, includesMeasureVisit }` to CartItem |
| Edit | `src/features/homeowner/pages/service-detail.tsx` | Early-return → `<BlindsConfigurator />` (mirror remodel/bathroom pattern). Existing chip flow goes through new component, NOT through generic service-detail chip rendering. |
| Edit | `src/features/homeowner/pages/booking-confirmation.tsx` | Dispatch to `computeBlindsLineItems(measurements, chipSelections)` at snapshot time for `serviceId === 'blinds'`. Signature differs from remodel/bathroom because chip picks are inputs too. |
| Edit | `src/lib/qa-personas.ts` (if needed) | Migrate any blinds QA persona off flat preset → real measurements + chip-selection input |

## Open questions for kratos/Rod before build

1. **Touch vs leave-as-is (THE big one).** Blinds is already shipped live with a chip-driven flow. Don't-touch-working-surfaces is the safe default. Options:
   - **(A) Leave live Blinds untouched** — explicit anchor. Today's chip flow keeps shipping. Skip this leg, focus on Remodel + Bathroom only.
   - **(B) Hybrid (my lean IF Rod wants change)** — keep chips for style + add measurement-driven pricing layer. Existing chip data structures preserved; just adds a second step.
   - **(C) Full replacement** — drop chips, go pure measurement-driven like Remodel/Bathroom. Loses taste-based style selection that's appropriate for window treatments.

   The change itself is Rod's call. My (B) lean is a recommendation FOR a change, not a recommendation TO change.
2. **Number-of-windows input shape** — single integer with average dims (1-week ship, fast) OR per-window dim entry (more accurate, more friction)? My lean: integer + average for v1.
3. **Permit step** — Blinds doesn't typically require permits in any FL county. Skip Permit step entirely (Blinds wizard = 3 steps Style → Measurements → Address → Review) OR keep Permit for cross-configurator consistency (4 steps, Permit choice purely cosmetic for Blinds)? My lean: skip.
4. **Per-type product rate granularity** — 8 rates (one per blind type) OR 3 tiers (Standard / Mid / Premium)? 8 gives Rod fine control; 3 reduces decisions. My lean: 8 — Rod can set them equal if he wants tiered behavior.
5. **Legacy chip-flow preset** — `PRICE_LINE_ITEM_PRESETS.blinds` is a 2-line flat preset used in QA personas. Drop entirely (single source of truth = computeBlindsLineItems) OR keep behind a flag for legacy QA fixtures? My lean: drop, migrate QA personas to use measurement-driven compute.
6. **Material + light_control chips** — currently 2 separate chip groups (material × light_control = 6 × 4 = 24 combos). v1 folds material into the per-type rate (real_wood costs more than vinyl etc), light_control purely cosmetic (no price impact). Acceptable simplification OR Rod wants material/light_control as separate price modifiers? My lean: fold for v1, surface as v2 enhancement.

## What's intentionally NOT in this proposal

- No per-window dim entry (defer to v2).
- No vendor-side rate editing — rates live in static `BLINDS_RATES` like Remodel.
- No fixtures-as-$0 split (Blinds = platform-priced product, NOT homeowner-supplied like Bathroom fixtures). If Rod wants $0 client-provided alternative path that's a separate ship.
- No satellite fallback.
- English only (per `feedback_app_ui_english_only_chat_spanglish`).
- No promote until Rod confirms shape + sets real $ values.

## Suggested next handshake

This doc + REMODEL_FINDINGS.md + BATHROOM_FINDINGS.md → kratos surfaces all
open Qs at 12:03Z brief → Rod answers in one batch → all 3 launch legs
execute one-shot:

- **Remodel** patch REMODEL_RATES → promote-verified-bytes
- **Bathroom** full build from scratch (mirror Remodel template)
- **Blinds** layer measurement-driven compute on existing chip flow

Parking. Ping kratos when this doc is ready.
