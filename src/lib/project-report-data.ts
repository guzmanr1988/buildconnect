// Project Report data resolver — maps a SentProject (+ admin platform_settings)
// to the iris-spec input contract consumed by generate-project-report-pdf.ts.
//
// Generic across all ServiceCategory values. The resolver flattens the
// per-project variance (roofing has roofMeasurement, pool has poolSurvey,
// windows_doors has window/door selections, bathroom/remodel have
// measurement-driven line items, etc.) into a small uniform shape:
// summary / scope / materials / measurements / permits / pricing.
//
// MARGIN-GATE (hard requirement, kratos msg 1781646935391-kratos-sguwg):
// `marginCents` is computed ONLY when showMargin === true. When showMargin is
// false (the customer-facing default), the resolver does NOT compute the
// field — the output's `pricing.marginCents` stays undefined and the
// generator skips the row entirely. Two-layer gate prevents Rod's profit
// from ever leaking into a customer-default copy.
//
// Field-coverage decisions (kratos msg 1781646742021 / 1781646935391):
//   - hoaName dropped — no intake field exists; render shows
//     "HOA / Association required: Yes/No" boolean only.
//   - poolSurvey kept under PERMITS (iris call); resolver populates only
//     when sp.poolSurvey !== undefined so non-pool services hide cleanly.

import type { SentProject, ServiceCategory, PriceLineItem } from '@/types'

export interface ProjectReportPermitWaiver {
  acknowledged: boolean
  signedName: string
  signedAt: string
}

export interface ProjectReportMeasurement {
  label: string
  value: string
}

export interface ProjectReportScopeItem {
  label: string
  detail?: string
}

export interface ProjectReportPricingLine {
  label: string
  amountCents: number
  // Phase-B vendor-edit arrows (#344) — when amount differs from
  // originalAmount the PDF can render a ▲/▼ marker. originalAmountCents
  // is omitted on auto_sold_adjustment lines (delta-only).
  originalAmountCents?: number
  source?: PriceLineItem['source']
}

export interface ProjectReportInput {
  // ── HEADER ──
  generatedAt: string
  recordId: string

  // ── PROJECT SUMMARY ──
  summary: {
    serviceName: string
    serviceCategory: ServiceCategory
    contractorCompany: string
    contractorName: string
    bookingDate: string
    bookingTime: string
    homeownerName: string
    homeownerAddress: string
  }

  // ── SCOPE OF WORK ──
  // Flattened selection list (option_id → human label). Generator renders
  // as a bulleted list; empty array → section omitted.
  scope: ProjectReportScopeItem[]

  // ── MATERIALS ──
  // Material/product picks (shingle color, tile type, frame finishes, etc).
  // Empty → section renders "Standard package — see contractor for details"
  // fallback per iris spec (so the section never feels sparse).
  materials: string[]

  // ── MEASUREMENTS ──
  // Measurement rows (roofMeasurement, areaSqft, perimeterFt, structure
  // breakdown, remodel/bathroom measurements). Empty → section omitted.
  measurements: ProjectReportMeasurement[]

  // ── PERMITS & ASSOCIATION ──
  permits: {
    projectPermit: 'yes' | 'no' | null
    permitWaiver: ProjectReportPermitWaiver | null
    associationRequired: 'yes' | 'no' | null
    // Pool-only — undefined for non-pool services so the row is omitted.
    poolSurveyRequired?: 'yes' | 'no'
  }

  // ── PRICING ──
  pricing: {
    lines: ProjectReportPricingLine[]
    totalCents: number
    // ONLY populated when showMargin=true. Customer-default copy
    // (showMargin=false) leaves this undefined. PDF generator skips the
    // entire margin row when undefined.
    marginCents?: number
  }
}

function formatCartItemMaterials(item: SentProject['item']): string[] {
  const out: string[] = []
  if (item.shingleSelection) {
    out.push(`Shingle — ${item.shingleSelection.color}`)
  } else if (item.shingleColor) {
    out.push(`Shingle — ${item.shingleColor}`)
  }
  if (item.tileSelection) {
    out.push(`${capitalize(item.tileSelection.tileType)} tile — ${item.tileSelection.tileColor}`)
  } else if (item.tileType && item.tileColor) {
    out.push(`${capitalize(item.tileType)} tile — ${item.tileColor}`)
  }
  if (item.metalRoofSelection) {
    out.push(`Metal roof — ${item.metalRoofSelection.color}`)
  }
  if (item.aluminumSelection) {
    out.push(`Aluminum roof — ${item.aluminumSelection.color}`)
  }
  if (item.flatRoofSelection) {
    out.push(`Flat roof — ${formatMembrane(item.flatRoofSelection.membraneType)}`)
  }
  if (item.garageDoorSelection) {
    const g = item.garageDoorSelection
    out.push(`Garage door — ${g.type}, ${g.size}, ${g.color}${g.glass ? `, ${g.glass}` : ''}`)
  }
  for (const w of item.windowSelections ?? []) {
    out.push(`Window × ${w.quantity} — ${w.type}, ${w.size}, ${w.frameColor} frame, ${w.glassColor} ${w.glassType}`)
  }
  for (const d of item.doorSelections ?? []) {
    out.push(`Door × ${d.quantity} — ${d.type}, ${d.size}, ${d.frameColor} frame, ${d.glassColor} ${d.glassType}`)
  }
  for (const s of item.stormFrontSelections ?? []) {
    out.push(`Storm front × ${s.quantity} — ${s.type}, ${s.size}, ${s.frameColor} frame, ${s.glassColor} ${s.glassType}`)
  }
  return out
}

function formatMembrane(m: 'tpo' | 'epdm' | 'modified_bitumen'): string {
  if (m === 'tpo') return 'TPO membrane'
  if (m === 'epdm') return 'EPDM membrane'
  return 'Modified Bitumen membrane'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatCartItemMeasurements(item: SentProject['item']): ProjectReportMeasurement[] {
  const out: ProjectReportMeasurement[] = []
  if (item.roofMeasurement) {
    const r = item.roofMeasurement
    out.push({ label: 'Roof area', value: `${r.areaSqft.toLocaleString()} sq ft` })
    out.push({ label: 'Roof pitch', value: r.pitch })
    if (r.pitchedAreaSqft) {
      out.push({ label: 'Pitched area (waste-incl.)', value: `${r.pitchedAreaSqft.toLocaleString()} sq ft` })
    }
    if (r.flatAreaSqft) {
      out.push({ label: 'Flat area', value: `${r.flatAreaSqft.toLocaleString()} sq ft` })
    }
    if (r.perimeterFt) {
      out.push({ label: 'Roof perimeter', value: `${r.perimeterFt.toLocaleString()} lin ft` })
    }
  }
  if (item.areaSqft && !item.roofMeasurement) {
    out.push({ label: 'Project area', value: `${item.areaSqft.toLocaleString()} sq ft` })
  }
  if (item.perimeterFt && !item.roofMeasurement) {
    out.push({ label: 'Project perimeter', value: `${item.perimeterFt.toLocaleString()} lin ft` })
  }
  if (item.structureMeasurements) {
    for (const [key, m] of Object.entries(item.structureMeasurements)) {
      out.push({
        label: humanizeOptionId(key),
        value: `${m.sqft.toLocaleString()} sq ft`,
      })
    }
  }
  if (item.remodelMeasurements) {
    const r = item.remodelMeasurements
    out.push({ label: 'Room dimensions', value: `${r.length} ft × ${r.width} ft` })
    out.push({ label: 'Ceiling height', value: `${r.ceilingHeight} ft` })
    out.push({ label: 'Walls included', value: `${r.numWalls}` })
  }
  if (item.bathroomMeasurements) {
    const b = item.bathroomMeasurements
    out.push({ label: 'Bathroom dimensions', value: `${b.length} ft × ${b.width} ft` })
    out.push({ label: 'Ceiling height', value: `${b.ceilingHeight} ft` })
    out.push({ label: 'Tile coverage height', value: `${b.tileCoverageHeight} ft` })
    if (b.includesTub) out.push({ label: 'Includes tub', value: 'Yes' })
  }
  return out
}

function buildScopeItems(item: SentProject['item']): ProjectReportScopeItem[] {
  const out: ProjectReportScopeItem[] = []
  const qtyMap = item.selectionQuantities ?? {}
  for (const [groupId, selections] of Object.entries(item.selections ?? {})) {
    for (const optId of selections) {
      const qty = qtyMap[optId]
      const label = humanizeOptionId(optId)
      const detail = qty ? `Qty: ${qty} (in ${humanizeOptionId(groupId)})` : humanizeOptionId(groupId)
      out.push({ label, detail })
    }
  }
  return out
}

function humanizeOptionId(id: string): string {
  return id
    .split(/[_-]/)
    .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join(' ')
}

export interface ResolveProjectReportInput {
  sp: SentProject
  showMargin: boolean
  // Override generatedAt for deterministic sample-PDF byte output (testing).
  generatedAtOverride?: string
  // Override recordId for deterministic sample-PDF byte output (testing).
  recordIdOverride?: string
}

export function resolveProjectReport(input: ResolveProjectReportInput): ProjectReportInput {
  const { sp, showMargin, generatedAtOverride, recordIdOverride } = input

  const lines: ProjectReportPricingLine[] = (sp.priceLineItems ?? []).map((p) => ({
    label: p.label,
    amountCents: Math.round(p.amount * 100),
    originalAmountCents:
      p.originalAmount !== undefined ? Math.round(p.originalAmount * 100) : undefined,
    source: p.source,
  }))

  const totalCents = sp.saleAmount
    ? Math.round(sp.saleAmount * 100)
    : lines.reduce((sum, l) => sum + l.amountCents, 0)

  // MARGIN-GATE: only compute when showMargin=true. The customer-default
  // copy (showMargin=false) never even sees this number — undefined here
  // means the generator structurally cannot render it.
  let marginCents: number | undefined
  if (showMargin) {
    const presetSum = lines.reduce(
      (sum, l) => sum + (l.originalAmountCents ?? l.amountCents),
      0,
    )
    marginCents = totalCents - presetSum
  }

  const projectPermit = sp.projectPermit ?? sp.item.roofPermit ?? null
  const permitWaiver = sp.projectPermitWaiver ?? sp.item.permitWaiver ?? null

  return {
    generatedAt:
      generatedAtOverride ??
      new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    recordId: recordIdOverride ?? `BC-${Date.now()}`,
    summary: {
      serviceName: sp.item.serviceName,
      serviceCategory: sp.item.serviceId as ServiceCategory,
      contractorCompany: sp.contractor.company,
      contractorName: sp.contractor.name,
      bookingDate: sp.booking.date,
      bookingTime: sp.booking.time,
      homeownerName: sp.homeowner?.name ?? '',
      homeownerAddress: sp.homeowner?.address ?? sp.item.address?.full ?? '',
    },
    scope: buildScopeItems(sp.item),
    materials: formatCartItemMaterials(sp.item),
    measurements: formatCartItemMeasurements(sp.item),
    permits: {
      projectPermit,
      permitWaiver: permitWaiver
        ? {
            acknowledged: permitWaiver.acknowledged,
            signedName: permitWaiver.signedName,
            signedAt: permitWaiver.signedAt,
          }
        : null,
      associationRequired: sp.projectAssociation ?? null,
      poolSurveyRequired: sp.poolSurvey,
    },
    pricing: {
      lines,
      totalCents,
      marginCents,
    },
  }
}
