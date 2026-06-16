// Project Report PDF generator — iris-spec faithful, pdf-lib client-side.
//
// Token spec (matches generate-submission-pdf.ts exactly, per iris):
//   margin=50, LINE=16, SECTION_GAP=22
//   font=Helvetica / HelveticaBold
//   accent=rgb(0.13,0.47,0.94)  dark=rgb(0.1,0.1,0.1)  gray=rgb(0.4,0.4,0.4)
//   divider rgb(0.8,0.8,0.8) 0.5pt
//   page Letter 612×792
//
// Section order:
//   HEADER → PROJECT SUMMARY → SCOPE OF WORK → MATERIALS → MEASUREMENTS
//   (omit if none) → PERMITS & ASSOCIATION → PRICING → FOOTER
//
// MARGIN-GATE (hard requirement): the margin row renders ONLY when
// pricing.marginCents is a number. The resolver only populates it when
// showMargin=true; customer-default copy leaves it undefined, so the
// renderer structurally cannot expose Rod's profit. Two-layer gate.
//
// Pagination: each section measures its block height pre-draw and inserts
// a fresh page when the cursor would fall below the footer reserve. Keeps
// the renderer linear-cursor-state without needing a full layout engine.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, PageSizes } from 'pdf-lib'
import type {
  ProjectReportInput,
  ProjectReportMeasurement,
  ProjectReportPricingLine,
  ProjectReportScopeItem,
} from './project-report-data'

const MARGIN = 50
const LINE = 16
const SECTION_GAP = 22
const FOOTER_RESERVE = 50 // bottom area kept clear for the footer band

const dark = rgb(0.1, 0.1, 0.1)
const gray = rgb(0.4, 0.4, 0.4)
const accent = rgb(0.13, 0.47, 0.94)
const dividerColor = rgb(0.8, 0.8, 0.8)

interface Cursor {
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  page: PDFPage
  y: number
  width: number
  height: number
}

function newPage(c: Cursor): void {
  c.page = c.doc.addPage(PageSizes.Letter)
  const { width, height } = c.page.getSize()
  c.width = width
  c.height = height
  c.y = height - MARGIN
}

function ensureRoom(c: Cursor, needed: number): void {
  if (c.y - needed < FOOTER_RESERVE) {
    newPage(c)
  }
}

function drawText(
  c: Cursor,
  str: string,
  x: number,
  opts: {
    size?: number
    color?: ReturnType<typeof rgb>
    f?: PDFFont
  } = {},
): void {
  c.page.drawText(str, {
    x,
    y: c.y,
    size: opts.size ?? 10,
    font: opts.f ?? c.font,
    color: opts.color ?? dark,
  })
}

function drawDivider(c: Cursor): void {
  c.page.drawLine({
    start: { x: MARGIN, y: c.y },
    end: { x: c.width - MARGIN, y: c.y },
    thickness: 0.5,
    color: dividerColor,
  })
}

function sectionHeader(c: Cursor, label: string): void {
  ensureRoom(c, LINE + SECTION_GAP)
  drawText(c, label, MARGIN, { size: 8, f: c.bold, color: gray })
  c.y -= LINE
}

function divLine(c: Cursor): void {
  ensureRoom(c, SECTION_GAP * 0.5)
  c.y -= SECTION_GAP * 0.5
  drawDivider(c)
  c.y -= SECTION_GAP
}

function fieldRow(c: Cursor, label: string, value: string): void {
  ensureRoom(c, LINE)
  drawText(c, `${label}:`, MARGIN, { size: 9, f: c.bold })
  drawText(c, value, MARGIN + 110, { size: 9 })
  c.y -= LINE
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const minor = abs % 100
  const dStr = dollars.toLocaleString('en-US')
  return `${sign}$${dStr}.${minor.toString().padStart(2, '0')}`
}

function drawHeader(c: Cursor, input: ProjectReportInput): void {
  drawText(c, 'BuildConnect', MARGIN, { size: 20, f: c.bold, color: accent })
  c.y -= 22
  drawText(c, 'Project Report', MARGIN, { size: 12, f: c.bold, color: dark })
  c.y -= LINE
  drawText(c, `Generated: ${input.generatedAt}`, MARGIN, { size: 9, color: gray })
  c.y -= LINE * 0.5
  drawDivider(c)
  c.y -= SECTION_GAP
}

function drawSummary(c: Cursor, input: ProjectReportInput): void {
  sectionHeader(c, 'PROJECT SUMMARY')
  fieldRow(c, 'Service', input.summary.serviceName)
  fieldRow(
    c,
    'Contractor',
    `${input.summary.contractorCompany} (${input.summary.contractorName})`,
  )
  fieldRow(c, 'Scheduled', `${input.summary.bookingDate} at ${input.summary.bookingTime}`)
  if (input.summary.homeownerName) {
    fieldRow(c, 'Homeowner', input.summary.homeownerName)
  }
  if (input.summary.homeownerAddress) {
    fieldRow(c, 'Property', input.summary.homeownerAddress)
  }
  divLine(c)
}

function drawScope(c: Cursor, items: ProjectReportScopeItem[]): void {
  if (items.length === 0) return
  sectionHeader(c, 'SCOPE OF WORK')
  for (const it of items) {
    ensureRoom(c, LINE)
    drawText(c, `•  ${it.label}`, MARGIN, { size: 9 })
    if (it.detail) {
      drawText(c, it.detail, MARGIN + 200, { size: 9, color: gray })
    }
    c.y -= LINE
  }
  divLine(c)
}

function drawMaterials(c: Cursor, materials: string[]): void {
  sectionHeader(c, 'MATERIALS')
  if (materials.length === 0) {
    ensureRoom(c, LINE)
    drawText(c, 'Standard package — see contractor for material details.', MARGIN, {
      size: 9,
      color: gray,
    })
    c.y -= LINE
  } else {
    for (const m of materials) {
      ensureRoom(c, LINE)
      drawText(c, `•  ${m}`, MARGIN, { size: 9 })
      c.y -= LINE
    }
  }
  divLine(c)
}

function drawMeasurements(c: Cursor, m: ProjectReportMeasurement[]): void {
  if (m.length === 0) return
  sectionHeader(c, 'MEASUREMENTS')
  for (const row of m) {
    fieldRow(c, row.label, row.value)
  }
  divLine(c)
}

function drawPermits(c: Cursor, p: ProjectReportInput['permits']): void {
  sectionHeader(c, 'PERMITS & ASSOCIATION')
  fieldRow(c, 'Permit pulled', p.projectPermit === 'yes' ? 'Yes' : p.projectPermit === 'no' ? 'No' : '—')
  fieldRow(
    c,
    'HOA / Association required',
    p.associationRequired === 'yes' ? 'Yes' : p.associationRequired === 'no' ? 'No' : '—',
  )
  if (p.poolSurveyRequired !== undefined) {
    fieldRow(c, 'Pool survey required', p.poolSurveyRequired === 'yes' ? 'Yes' : 'No')
  }
  if (p.permitWaiver?.acknowledged) {
    ensureRoom(c, LINE * 4 + 8)
    c.y -= 4
    drawText(c, 'No-permit liability waiver:', MARGIN, { size: 9, f: c.bold, color: rgb(0.7, 0.4, 0) })
    c.y -= LINE
    drawText(c, `Signed by ${p.permitWaiver.signedName}`, MARGIN, { size: 9 })
    c.y -= LINE
    drawText(
      c,
      `Acknowledged ${new Date(p.permitWaiver.signedAt).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}`,
      MARGIN,
      { size: 9, color: gray },
    )
    c.y -= LINE
  }
  divLine(c)
}

function drawPricing(c: Cursor, pricing: ProjectReportInput['pricing']): void {
  sectionHeader(c, 'PRICING')
  const labelX = MARGIN
  const amountX = c.width - MARGIN - 80
  for (const line of pricing.lines) {
    ensureRoom(c, LINE)
    drawText(c, line.label, labelX, { size: 9 })
    drawText(c, formatCents(line.amountCents), amountX, { size: 9 })
    c.y -= LINE
  }
  // Total — a divider above, then bold.
  ensureRoom(c, LINE + 6)
  c.y -= 4
  c.page.drawLine({
    start: { x: amountX, y: c.y + 6 },
    end: { x: c.width - MARGIN, y: c.y + 6 },
    thickness: 0.5,
    color: dividerColor,
  })
  drawText(c, 'Total', labelX, { size: 10, f: c.bold })
  drawText(c, formatCents(pricing.totalCents), amountX, { size: 10, f: c.bold })
  c.y -= LINE
  // MARGIN ROW — gated on marginCents being defined. Customer-default copy
  // (showMargin=false in resolver) leaves it undefined, so this branch is
  // structurally unreachable. Second of the two layers in the margin-gate.
  if (pricing.marginCents !== undefined) {
    ensureRoom(c, LINE)
    drawText(c, 'Margin (admin)', labelX, { size: 9, color: gray })
    drawText(c, formatCents(pricing.marginCents), amountX, { size: 9, color: gray })
    c.y -= LINE
  }
  divLine(c)
}

function drawFooter(c: Cursor, input: ProjectReportInput): void {
  const footerY = 30
  c.page.drawLine({
    start: { x: MARGIN, y: footerY + 14 },
    end: { x: c.width - MARGIN, y: footerY + 14 },
    thickness: 0.5,
    color: dividerColor,
  })
  c.page.drawText(
    'This document was auto-generated by BuildConnect as a summary of project scope.',
    { x: MARGIN, y: footerY + 4, size: 7, font: c.font, color: gray },
  )
  c.page.drawText(`Record ID: ${input.recordId}`, {
    x: c.width - MARGIN - 130,
    y: footerY + 4,
    size: 7,
    font: c.font,
    color: gray,
  })
}

export async function generateProjectReportPdf(
  input: ProjectReportInput,
): Promise<{ dataUri: string; bytes: Uint8Array }> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage(PageSizes.Letter)
  const { width, height } = page.getSize()
  const c: Cursor = { doc, font, bold, page, y: height - MARGIN, width, height }

  drawHeader(c, input)
  drawSummary(c, input)
  drawScope(c, input.scope)
  drawMaterials(c, input.materials)
  drawMeasurements(c, input.measurements)
  drawPermits(c, input.permits)
  drawPricing(c, input.pricing)
  // Footer always on the LAST page (whichever the cursor ended on).
  drawFooter(c, input)

  const bytes = await doc.save()
  const dataUri = await doc.saveAsBase64({ dataUri: true })
  return { dataUri, bytes }
}
