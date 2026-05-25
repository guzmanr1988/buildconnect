import { Badge } from '@/components/ui/badge'
import { SERVICE_CATALOG } from '@/lib/constants'
import {
  windowCatalogUnitPrice,
  doorCatalogUnitPrice,
  stormFrontCatalogUnitPrice,
  garageDoorCatalogUnitPrice,
} from '@/lib/configurator-catalog-price'
import type { CartItem } from '@/stores/cart-store'

type ResolvedLineItem = { id: string; label?: string; amount: number }

// Arc-35 shared component — extracted from appointment-status.tsx Project
// Items card-grid (Arc-34b) plus cart.tsx Project Summary WD per-unit
// layout. Single canonical render for homeowner + vendor surfaces:
//   <ProjectItemsCardGrid item={cartItem} />
//   <ProjectItemsCardGrid item={cartItem} showPricing getPrice={fn} />
//
// Walker anchors preserved verbatim: data-project-items-card-grid,
// data-project-summary-section, data-project-summary-grid,
// data-project-summary-card-specs. Adding showPricing must not move the
// anchor positions.

type GetPriceFn = (serviceId: string, optionId: string) => number

type SummarySpec = { variant: 'outline' | 'secondary'; text: string }

type CardPricing = { unit: number; qty: number; total: number }

type SummaryCard = {
  topLabel: string
  primaryValue?: string
  pricing?: CardPricing
  specs?: SummarySpec[]
}

type SummarySection = {
  id: string
  title: string
  totalLabel?: string
  cards: SummaryCard[]
}

type BuildOpts = {
  showPricing?: boolean
  getPrice?: GetPriceFn
  resolvedLineItems?: ResolvedLineItem[]
}

function fmtPriceCents(cents: number): string {
  const dollars = Math.round(cents / 100)
  return `$${dollars.toLocaleString('en-US')}`
}

function humanizeId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function resolveOptionLabel(serviceId: string, groupId: string, optionId: string): string {
  const service = SERVICE_CATALOG.find((s) => s.id === serviceId)
  const group = service?.optionGroups.find((g) => g.id === groupId)
  const option = group?.options.find((o) => o.id === optionId)
  return option?.label ?? humanizeId(optionId)
}

function chipsForOption(item: CartItem, optionId: string): SummarySpec[] {
  const specs: SummarySpec[] = []
  const linearFt = item.roofAddonLinearFt?.[optionId] ?? item.addonLinearFt?.[optionId]
  if (linearFt !== undefined && linearFt > 0) {
    let text = `${linearFt.toLocaleString()} ft`
    if (optionId === 'gutters' && item.gutterDropsConfig) {
      const dc = item.gutterDropsConfig
      text += ` (+${dc.drops} drop${dc.drops === 1 ? '' : 's'} ${dc.floors}fl)`
    }
    specs.push({ variant: 'outline', text })
  }
  const sub = item.subGroupLinearFt?.[optionId]
  if (sub !== undefined && sub > 0) {
    specs.push({ variant: 'outline', text: `${sub.toLocaleString()} ft` })
  }
  const customSqft = item.customSizeSqft?.[optionId]
  if (customSqft !== undefined && customSqft > 0) {
    specs.push({ variant: 'outline', text: `${customSqft.toLocaleString()} sqft` })
  }
  const qty = item.selectionQuantities?.[optionId]
  if (qty !== undefined && qty > 0) {
    specs.push({ variant: 'outline', text: `Qty: ${qty}` })
  }
  return specs
}

// Per-group catalog $sum across selected options. Used for non-WD section
// totalLabel when showPricing=true.
function sectionTotalCents(
  item: CartItem,
  groupId: string,
  getPrice: GetPriceFn,
): number {
  const optionIds = item.selections?.[groupId] ?? []
  let sum = 0
  for (const optId of optionIds) {
    const base = getPrice(item.serviceId, optId)
    if (!base) continue
    const qty = item.selectionQuantities?.[optId] ?? 1
    sum += base * qty
  }
  return sum
}

function genericGroupSection(
  item: CartItem,
  groupId: string,
  sectionId: string,
  title: string,
  opts: BuildOpts,
): SummarySection | null {
  const optionIds = item.selections?.[groupId] ?? []
  if (optionIds.length === 0) return null
  const cards: SummaryCard[] = optionIds.map((optId) => ({
    topLabel: resolveOptionLabel(item.serviceId, groupId, optId),
    specs: chipsForOption(item, optId),
  }))
  const section: SummarySection = { id: sectionId, title, cards }
  if (opts.showPricing && opts.getPrice) {
    const total = sectionTotalCents(item, groupId, opts.getPrice)
    if (total > 0) section.totalLabel = fmtPriceCents(total)
  }
  return section
}

function buildWindowsDoorsSections(item: CartItem, opts: BuildOpts): SummarySection[] {
  const sections: SummarySection[] = []
  const pricing = opts.showPricing && opts.getPrice
  const getPrice = opts.getPrice

  // Arc-39 hard-lock: pure catalog. No wd-product / install-line fallback.
  // When catalogUnit == 0 in pricing mode, surface $0 so vendor sees they
  // haven't priced the item in their catalog yet.
  const totalWQty = item.windowSelections?.reduce((s, w) => s + w.quantity, 0) ?? 0
  const totalDQty = item.doorSelections?.reduce((s, d) => s + d.quantity, 0) ?? 0
  const totalSFQty = item.stormFrontSelections?.reduce((s, sf) => s + sf.quantity, 0) ?? 0

  // Windows
  if (item.windowSelections && item.windowSelections.length > 0) {
    let sectionTotal = 0
    const cards: SummaryCard[] = item.windowSelections.map((w) => {
      const card: SummaryCard = {
        topLabel: `${w.size.replace('x', '" × ')}"`,
        primaryValue: `×${w.quantity}`,
        specs: [
          { variant: 'secondary', text: w.type },
          { variant: 'outline', text: `Frame: ${w.frameColor}` },
          { variant: 'outline', text: `Glass: ${w.glassColor}` },
          { variant: 'outline', text: w.glassType },
        ],
      }
      if (pricing && getPrice) {
        const unit = windowCatalogUnitPrice(w, getPrice, item.serviceId)
        const total = unit * w.quantity
        card.primaryValue = fmtPriceCents(total)
        card.pricing = { unit, qty: w.quantity, total }
        sectionTotal += total
      }
      return card
    })
    sections.push({
      id: 'windows',
      title: 'Windows',
      totalLabel: pricing ? fmtPriceCents(sectionTotal) : `Total: ${totalWQty}`,
      cards,
    })
  }

  // Doors
  if (item.doorSelections && item.doorSelections.length > 0) {
    let sectionTotal = 0
    const cards: SummaryCard[] = item.doorSelections.map((d) => {
      const card: SummaryCard = {
        topLabel: `${d.size.replace('x', '" × ')}"`,
        primaryValue: `×${d.quantity}`,
        specs: [
          { variant: 'secondary', text: d.type },
          { variant: 'outline', text: `Frame: ${d.frameColor}` },
          { variant: 'outline', text: `Glass: ${d.glassColor}` },
          { variant: 'outline', text: d.glassType },
        ],
      }
      if (pricing && getPrice) {
        const unit = doorCatalogUnitPrice(d, getPrice, item.serviceId)
        const total = unit * d.quantity
        card.primaryValue = fmtPriceCents(total)
        card.pricing = { unit, qty: d.quantity, total }
        sectionTotal += total
      }
      return card
    })
    sections.push({
      id: 'doors',
      title: 'Doors',
      totalLabel: pricing ? fmtPriceCents(sectionTotal) : `Total: ${totalDQty}`,
      cards,
    })
  }

  // Storm Fronts
  if (item.stormFrontSelections && item.stormFrontSelections.length > 0) {
    let sectionTotal = 0
    const cards: SummaryCard[] = item.stormFrontSelections.map((sf) => {
      const card: SummaryCard = {
        topLabel: `${sf.size.replace('x', '" × ')}"`,
        primaryValue: `×${sf.quantity}`,
        specs: [
          { variant: 'secondary', text: sf.type },
          { variant: 'outline', text: `Frame: ${sf.frameColor}` },
          { variant: 'outline', text: `Glass: ${sf.glassColor}` },
          { variant: 'outline', text: sf.glassType },
        ],
      }
      if (pricing && getPrice) {
        const unit = stormFrontCatalogUnitPrice(sf, getPrice, item.serviceId)
        const total = unit * sf.quantity
        card.primaryValue = fmtPriceCents(total)
        card.pricing = { unit, qty: sf.quantity, total }
        sectionTotal += total
      }
      return card
    })
    sections.push({
      id: 'storm-fronts',
      title: 'Storm Fronts',
      totalLabel: pricing ? fmtPriceCents(sectionTotal) : `Total: ${totalSFQty}`,
      cards,
    })
  }

  // Garage Doors
  const gd = item.garageDoorSelection
  if (gd?.type) {
    const specs: SummarySpec[] = []
    if (gd.type === 'double_garage' && gd.size) {
      specs.push({
        variant: 'outline',
        text: gd.size === 'gd_4_panels' ? '4 Panels' : '5 Panels',
      })
    }
    if (gd.color) {
      specs.push({
        variant: 'outline',
        text: `Color: ${gd.color.charAt(0).toUpperCase() + gd.color.slice(1)}`,
      })
    }
    if (gd.glass) {
      specs.push({
        variant: 'outline',
        text: `Glass: ${gd.glass.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}`,
      })
    }
    const topLabel = gd.type === 'single_garage' ? 'Single Garage Door' : 'Double Garage Door'
    const card: SummaryCard = { topLabel, specs: specs.length > 0 ? specs : undefined }
    let gdTotal = 0
    if (pricing && getPrice) {
      const unit = garageDoorCatalogUnitPrice(gd, getPrice, item.serviceId)
      card.primaryValue = fmtPriceCents(unit)
      card.pricing = { unit, qty: 1, total: unit }
      gdTotal = unit
    }
    sections.push({
      id: 'garage-doors',
      title: 'Garage Door',
      totalLabel: pricing ? fmtPriceCents(gdTotal) : undefined,
      cards: [card],
    })
  }

  // Install / Permit lines — surfaced only when showPricing=true (vendor
  // surfaces) so the homeowner card-grid stays product-only.
  if (pricing && getPrice) {
    const installSpecs: SummaryCard[] = []
    if (totalWQty > 0) {
      const unit = getPrice(item.serviceId, 'install_windows')
      installSpecs.push({
        topLabel: 'Install Windows',
        primaryValue: fmtPriceCents(unit * totalWQty),
        pricing: { unit, qty: totalWQty, total: unit * totalWQty },
      })
    }
    if (totalDQty > 0) {
      const unit = getPrice(item.serviceId, 'install_doors')
      installSpecs.push({
        topLabel: 'Install Doors',
        primaryValue: fmtPriceCents(unit * totalDQty),
        pricing: { unit, qty: totalDQty, total: unit * totalDQty },
      })
    }
    if (totalSFQty > 0) {
      const unit = getPrice(item.serviceId, 'install_storm_front')
      installSpecs.push({
        topLabel: 'Install Storm Front',
        primaryValue: fmtPriceCents(unit * totalSFQty),
        pricing: { unit, qty: totalSFQty, total: unit * totalSFQty },
      })
    }
    if (installSpecs.length > 0) {
      const sectionTotal = installSpecs.reduce((s, c) => s + (c.pricing?.total ?? 0), 0)
      sections.push({
        id: 'install-labor',
        title: 'Installation',
        totalLabel: fmtPriceCents(sectionTotal),
        cards: installSpecs,
      })
    }
    const hasPermit = item.selections && Object.values(item.selections).flat().includes('permit')
    if (hasPermit) {
      const permitUnit = getPrice(item.serviceId, 'permit')
      sections.push({
        id: 'permit-fee',
        title: 'Permit',
        totalLabel: fmtPriceCents(permitUnit),
        cards: [{ topLabel: 'Permit Fee', primaryValue: fmtPriceCents(permitUnit) }],
      })
    }
  }

  return sections
}

function buildRoofingSections(item: CartItem, opts: BuildOpts): SummarySection[] {
  const sections: SummarySection[] = []
  const scope = genericGroupSection(item, 'service_type', 'roofing-scope', 'Scope', opts)
  if (scope) sections.push(scope)

  const matCards: SummaryCard[] = []
  if (item.metalRoofSelection?.color) {
    const mr = item.metalRoofSelection
    const specs: SummarySpec[] = [{ variant: 'outline', text: `Color: ${humanizeId(mr.color)}` }]
    if (mr.roofSize) {
      const n = Number(mr.roofSize)
      specs.push({
        variant: 'outline',
        text: Number.isFinite(n) && n > 0 ? `${n} sq${n === 1 ? '' : 's'}` : mr.roofSize,
      })
    }
    matCards.push({ topLabel: 'Standing Seam Metal', specs })
  }
  if (item.shingleSelection?.color) {
    const sh = item.shingleSelection
    const specs: SummarySpec[] = [{ variant: 'outline', text: `Color: ${humanizeId(sh.color)}` }]
    if (sh.roofSize) specs.push({ variant: 'outline', text: `${sh.roofSize} sqft` })
    matCards.push({ topLabel: 'Architectural Shingle', specs })
  } else if (item.shingleColor) {
    matCards.push({
      topLabel: 'Architectural Shingle',
      specs: [{ variant: 'outline', text: `Color: ${humanizeId(item.shingleColor)}` }],
    })
  }
  if (item.tileSelection?.tileType) {
    const t = item.tileSelection
    const specs: SummarySpec[] = [{ variant: 'outline', text: `Type: ${humanizeId(t.tileType)}` }]
    if (t.tileColor) specs.push({ variant: 'outline', text: `Color: ${humanizeId(t.tileColor)}` })
    if (t.roofSize) specs.push({ variant: 'outline', text: `${t.roofSize} sqft` })
    matCards.push({ topLabel: 'Barrel Tile', specs })
  }
  if (item.aluminumSelection?.color) {
    const a = item.aluminumSelection
    const specs: SummarySpec[] = [{ variant: 'outline', text: `Color: ${humanizeId(a.color)}` }]
    if (a.roofSize) specs.push({ variant: 'outline', text: `${a.roofSize} sqft` })
    matCards.push({ topLabel: 'Aluminum', specs })
  }
  if (item.flatRoofSelection?.membraneType) {
    const f = item.flatRoofSelection
    const specs: SummarySpec[] = [{ variant: 'outline', text: `Membrane: ${humanizeId(f.membraneType)}` }]
    if (f.roofSize) specs.push({ variant: 'outline', text: `${f.roofSize} sqft` })
    matCards.push({ topLabel: 'Flat Roof', specs })
  }
  if (matCards.length === 0) {
    const matSelections = item.selections?.material ?? []
    for (const optId of matSelections) {
      matCards.push({
        topLabel: resolveOptionLabel(item.serviceId, 'material', optId),
        specs: chipsForOption(item, optId),
      })
    }
  }
  if (matCards.length > 0) {
    const matSection: SummarySection = { id: 'roofing-materials', title: 'Materials', cards: matCards }
    if (opts.showPricing && opts.getPrice) {
      const total = sectionTotalCents(item, 'material', opts.getPrice)
      if (total > 0) matSection.totalLabel = fmtPriceCents(total)
    }
    sections.push(matSection)
  }

  if (item.roofMeasurement && item.roofMeasurement.areaSqft > 0) {
    const m = item.roofMeasurement
    const specs: SummarySpec[] = [{ variant: 'outline', text: `Pitch: ${m.pitch}` }]
    if (m.perimeterFt && m.perimeterFt > 0) {
      specs.push({ variant: 'outline', text: `Perimeter: ${m.perimeterFt.toLocaleString()} ft` })
    }
    sections.push({
      id: 'roofing-measurement',
      title: 'Roof Measurement',
      cards: [
        {
          topLabel: 'Roof',
          primaryValue: `${m.areaSqft.toLocaleString()} sqft`,
          specs,
        },
      ],
    })
  }

  const repair = genericGroupSection(item, 'repair_materials', 'roofing-repair', 'Repair Materials', opts)
  if (repair) sections.push(repair)

  const addons = genericGroupSection(item, 'addons', 'roofing-addons', 'Add-Ons', opts)
  if (addons) sections.push(addons)
  return sections
}

function buildPoolSections(item: CartItem, opts: BuildOpts): SummarySection[] {
  const sections: SummarySection[] = []
  for (const [groupId, label] of [
    ['service_type', 'Scope'],
    ['products', 'Materials'],
    ['addons', 'Add-Ons'],
  ] as const) {
    const s = genericGroupSection(item, groupId, `pool-${groupId}`, label, opts)
    if (s) sections.push(s)
  }
  const aq = item.addonQuantities
  if (aq) {
    const namedCards: SummaryCard[] = []
    const named: Array<[keyof typeof aq, string]> = [
      ['ledCount', 'LED Lights'],
      ['bubblerCount', 'Bubblers'],
      ['laminarJets', 'Laminar Jets'],
      ['waterfalls', 'Waterfalls'],
    ]
    for (const [key, lbl] of named) {
      const n = aq[key]
      if (typeof n === 'number' && n > 0) {
        namedCards.push({ topLabel: lbl, primaryValue: `×${n}` })
      }
    }
    if (namedCards.length > 0) {
      sections.push({ id: 'pool-feature-counts', title: 'Pool Features', cards: namedCards })
    }
  }
  return sections
}

function buildGenericServiceSections(item: CartItem, opts: BuildOpts): SummarySection[] {
  const sections: SummarySection[] = []
  const groupOrder = ['service_type', 'material', 'products', 'addons', 'repair_materials']
  const groupTitles: Record<string, string> = {
    service_type: 'Scope',
    material: 'Materials',
    products: 'Materials',
    addons: 'Add-Ons',
    repair_materials: 'Repair Materials',
  }
  const allGroupIds = new Set<string>([
    ...groupOrder,
    ...Object.keys(item.selections ?? {}),
  ])
  const orderedGroups: string[] = [
    ...groupOrder.filter((g) => allGroupIds.has(g)),
    ...Array.from(allGroupIds).filter((g) => !groupOrder.includes(g)),
  ]
  for (const groupId of orderedGroups) {
    const title = groupTitles[groupId] ?? humanizeId(groupId)
    const s = genericGroupSection(item, groupId, `generic-${groupId}`, title, opts)
    if (s) sections.push(s)
  }
  const dimCards: SummaryCard[] = []
  if (item.areaSqft !== undefined && item.areaSqft > 0) {
    dimCards.push({ topLabel: 'Area', primaryValue: `${item.areaSqft.toLocaleString()} sqft` })
  }
  if (item.perimeterFt !== undefined && item.perimeterFt > 0) {
    dimCards.push({ topLabel: 'Perimeter', primaryValue: `${item.perimeterFt.toLocaleString()} ft` })
  }
  if (item.structureMeasurements) {
    for (const [optId, sm] of Object.entries(item.structureMeasurements)) {
      if (sm.sqft > 0) {
        dimCards.push({
          topLabel: resolveOptionLabel(item.serviceId, 'products', optId),
          primaryValue: `${sm.sqft.toLocaleString()} sqft`,
        })
      }
    }
  }
  if (dimCards.length > 0) {
    sections.push({ id: 'site-dimensions', title: 'Site Dimensions', cards: dimCards })
  }
  return sections
}

function buildServiceSections(item: CartItem, opts: BuildOpts): SummarySection[] {
  switch (item.serviceId) {
    case 'windows_doors':
      return buildWindowsDoorsSections(item, opts)
    case 'roofing':
      return buildRoofingSections(item, opts)
    case 'pool':
      return buildPoolSections(item, opts)
    default:
      return buildGenericServiceSections(item, opts)
  }
}

function SummarySectionView({ section }: { section: SummarySection }) {
  if (section.cards.length === 0) return null
  // Section wrapper col-span = min(cards.length, max-cols-at-breakpoint).
  // Outer grid is 1/2/3-col at sm/md/lg; clamp keeps a 2-card section from
  // wasting the 3rd col on lg, letting a trailing 1-card section slot in
  // beside it. Tailwind needs literal classes — enumerate the 3 cases.
  const spanClass =
    section.cards.length === 1
      ? ''
      : section.cards.length === 2
        ? 'md:col-span-2 lg:col-span-2'
        : 'md:col-span-2 lg:col-span-3'
  // Inner card grid columns match the same clamp so cards fill the wrapper
  // without leaving an empty inner column.
  const innerGridClass =
    section.cards.length === 1
      ? 'grid grid-cols-1 gap-3'
      : section.cards.length === 2
        ? 'grid grid-cols-2 gap-3'
        : 'grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4'
  return (
    <div
      className={`rounded-xl border bg-muted/30 p-4 space-y-3${spanClass ? ' ' + spanClass : ''}`}
      data-project-summary-section={section.id}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{section.title}</p>
        {section.totalLabel && (
          <span className="text-sm font-bold text-primary">{section.totalLabel}</span>
        )}
      </div>
      <div
        className={innerGridClass}
        data-project-summary-grid
      >
        {section.cards.map((c, i) => (
          <div
            key={`${c.topLabel}-${i}`}
            className="rounded-lg bg-background border p-3 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-bold">{c.topLabel}</span>
              {c.primaryValue && (
                <span className="text-base font-bold text-primary">{c.primaryValue}</span>
              )}
            </div>
            {c.pricing && c.pricing.qty > 1 && (
              <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                <span>{c.pricing.qty}</span>
                <span>×</span>
                <span>{fmtPriceCents(c.pricing.unit)}</span>
              </div>
            )}
            {c.specs && c.specs.length > 0 && (
              <div
                className="flex flex-wrap gap-1.5 border-t border-border pt-2"
                data-project-summary-card-specs
              >
                {c.specs.map((s, j) => (
                  <Badge key={j} variant={s.variant} className="text-xs">
                    {s.text}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export interface ProjectItemsCardGridProps {
  item: CartItem
  projectPermit?: 'yes' | 'no'
  showPricing?: boolean
  getPrice?: GetPriceFn
  resolvedLineItems?: ResolvedLineItem[]
}

export function ProjectItemsCardGrid({
  item,
  projectPermit,
  showPricing,
  getPrice,
  resolvedLineItems,
}: ProjectItemsCardGridProps) {
  const opts: BuildOpts = { showPricing, getPrice, resolvedLineItems }
  const sections = buildServiceSections(item, opts)

  // Permits — universal (project-level snapshot or legacy per-item).
  const permitChoice = projectPermit ?? item.roofPermit
  if (permitChoice) {
    sections.push({
      id: 'permits',
      title: 'Permits',
      cards: [
        {
          topLabel: 'Permit pulled (vendor)',
          specs: [
            {
              variant: permitChoice === 'yes' ? 'secondary' : 'outline',
              text: permitChoice === 'yes' ? 'Yes' : 'No',
            },
          ],
        },
      ],
    })
  }

  // Attachments — photos + notes.
  const attachCards: SummaryCard[] = []
  const photoCount = item.itemPhotos?.length ?? 0
  if (photoCount > 0) {
    attachCards.push({ topLabel: 'Photos', primaryValue: `×${photoCount}` })
  }
  if (item.itemNotes && item.itemNotes.trim().length > 0) {
    const trimmed = item.itemNotes.trim()
    const trunc = trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed
    attachCards.push({ topLabel: 'Notes', specs: [{ variant: 'outline', text: trunc }] })
  }
  if (attachCards.length > 0) {
    sections.push({ id: 'attachments', title: 'Attachments', cards: attachCards })
  }

  if (sections.length === 0) return null

  return (
    <div
      className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-3"
      data-project-items-card-grid
    >
      {sections.map((s) => (
        <SummarySectionView key={s.id} section={s} />
      ))}
    </div>
  )
}
