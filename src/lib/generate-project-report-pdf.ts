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
  c.page.drawRectangle({
    x: MARGIN - 4,
    y: c.y - 3,
    width: c.width - MARGIN * 2 + 8,
    height: LINE + 4,
    color: rgb(0.96, 0.97, 0.98),
  })
  drawText(c, label, MARGIN, { size: 8, f: c.bold, color: gray })
  c.y -= LINE
}

function divLine(c: Cursor): void {
  ensureRoom(c, SECTION_GAP * 0.5)
  c.y -= SECTION_GAP * 0.5
  drawDivider(c)
  c.y -= SECTION_GAP
}

// iris GAP 3 — uniform 200pt absolute value-offset across all field rows
// (MARGIN + 150 = 200 from page edge). Replaces the prior +110 offset that
// caused "HOA / Association required:Yes" + "Pitched area (waste-incl.):"
// label-value collisions iris flagged.
const FIELD_VALUE_OFFSET = 150

function fieldRow(c: Cursor, label: string, value: string): void {
  ensureRoom(c, LINE)
  drawText(c, `${label}:`, MARGIN, { size: 9, f: c.bold })
  drawText(c, value, MARGIN + FIELD_VALUE_OFFSET, { size: 9 })
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
  c.page.drawRectangle({
    x: 0,
    y: c.y - 60,
    width: c.width,
    height: 70,
    color: rgb(0.93, 0.96, 1.0),
  })
  drawText(c, 'BuildConnect', MARGIN, { size: 20, f: c.bold, color: accent })
  c.y -= 22
  drawText(c, 'Project Report', MARGIN, { size: 12, f: c.bold, color: dark })
  const vendorName = input.summary.contractorCompany
  if (vendorName) {
    const vendorSize = 10
    const vendorWidth = c.font.widthOfTextAtSize(vendorName, vendorSize)
    drawText(c, vendorName, c.width - MARGIN - vendorWidth, { size: vendorSize, color: dark })
  }
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
  // iris GAP 4 — Sold row directly under Contractor when set; absent
  // pre-sale. Reads from the resolver-formatted summary.soldAt.
  if (input.summary.soldAt) {
    fieldRow(c, 'Sold', input.summary.soldAt)
  }
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
  const amountX = c.width - MARGIN - 80
  for (const it of items) {
    ensureRoom(c, LINE)
    drawText(c, `•  ${it.label}`, MARGIN, { size: 9 })
    if (it.detail) {
      drawText(c, it.detail, amountX, { size: 8, color: gray })
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
  // Customer copy (option B, kratos msg 1781647952503): pricing.lines is
  // empty — section renders ONLY the Project Total row. Admin copy: full
  // itemized lines + Upsale + Margin (when showMargin=true).
  for (const line of pricing.lines) {
    ensureRoom(c, LINE)
    drawText(c, line.label, labelX, { size: 9 })
    if (line.amountCents !== undefined) {
      drawText(c, formatCents(line.amountCents), amountX, { size: 9 })
    }
    c.y -= LINE
  }
  // Total — bold, enlarged, no divider above (Rod: "remove the line between the numbers").
  // Customer total = saleAmount = exactly what the customer signed for,
  // and the only dollar figure in PRICING on the customer copy.
  ensureRoom(c, 26)
  c.y -= 6
  drawText(c, 'Project Total', labelX, { size: 17, f: c.bold })
  drawText(c, formatCents(pricing.totalCents), amountX, { size: 17, f: c.bold, color: accent })
  c.y -= 20
  // MARGIN ROW — gated on marginCents being defined. Customer-default copy
  // (showMargin=false in resolver) leaves it undefined, so this branch is
  // structurally unreachable. Second of the two layers in the margin-gate.
  if (pricing.marginCents !== undefined) {
    ensureRoom(c, LINE + 6)
    c.y -= 6
    c.page.drawRectangle({
      x: MARGIN - 4,
      y: c.y - 3,
      width: c.width - MARGIN * 2 + 8,
      height: LINE + 4,
      color: rgb(1.0, 0.97, 0.93),
    })
    drawText(c, 'Margin (admin)', labelX, { size: 9, color: gray })
    drawText(c, formatCents(pricing.marginCents), amountX, { size: 9, color: gray })
    c.y -= LINE
  }
  // No trailing divLine — PRICING is the last content section, footer
  // pins at y=30 on the current page (iris GAP B: avoids orphan page 2
  // when divLine→ensureRoom→newPage at section tail).
}

function wrapText(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = trial
    }
  }
  if (cur) lines.push(cur)
  return lines
}

// Legal disclaimer — placed between PRICING and FOOTER. Subtle tinted box
// with a bold "NOTICE" label and word-wrapped body, kept light-touch so it
// reads as professional context, not as a warning banner.
function drawDisclaimer(c: Cursor): void {
  const text =
    'This Project Report is provided for informational and planning purposes only and does not constitute a contract, offer, or binding agreement. The official contract will be prepared by the licensed contractor awarded this project, and all figures and scope shown here are an estimate summary subject to the final contract terms.'
  const labelSize = 8
  const bodySize = 8
  const bodyLine = 11
  const padX = 10
  const padTop = 10
  const padBot = 9
  const labelGap = 5
  const innerWidth = c.width - MARGIN * 2 - padX * 2
  const lines = wrapText(c.font, text, bodySize, innerWidth)
  const blockHeight =
    padTop + labelSize + labelGap + bodySize + (lines.length - 1) * bodyLine + padBot
  ensureRoom(c, blockHeight + SECTION_GAP)
  c.y -= SECTION_GAP * 0.5
  const boxTop = c.y
  const boxBottom = boxTop - blockHeight
  c.page.drawRectangle({
    x: MARGIN,
    y: boxBottom,
    width: c.width - MARGIN * 2,
    height: blockHeight,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.87, 0.9),
    borderWidth: 0.5,
  })
  let cursorY = boxTop - padTop - labelSize
  c.page.drawText('NOTICE', {
    x: MARGIN + padX,
    y: cursorY,
    size: labelSize,
    font: c.bold,
    color: gray,
  })
  cursorY -= labelGap + bodySize
  for (const line of lines) {
    c.page.drawText(line, {
      x: MARGIN + padX,
      y: cursorY,
      size: bodySize,
      font: c.font,
      color: gray,
    })
    cursorY -= bodyLine
  }
  c.y = boxBottom - SECTION_GAP * 0.5
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
  drawDisclaimer(c)
  // Footer always on the LAST page (whichever the cursor ended on).
  drawFooter(c, input)

  const bytes = await doc.save()
  const dataUri = await doc.saveAsBase64({ dataUri: true })
  return { dataUri, bytes }
}
