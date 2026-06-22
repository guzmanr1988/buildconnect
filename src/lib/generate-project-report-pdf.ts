// Project Report PDF generator — contract-style restyle (iris, 2026-06-22).
//
// Layout adapts the MH Home Solutions contract aesthetic to BuildConnect:
//   HEADER (BuildConnect wordmark left / PROJECT REPORT + contractor right) → thick rule
//   INFO BAND (generated date | record #, two centered columns)
//   TWO CARDS side-by-side (customer info | property address)
//   SCOPE OF WORK → PRODUCTS & SERVICES table (gray header row)
//   MATERIALS → MEASUREMENTS → PERMITS & ASSOCIATION
//   INVESTMENT SUMMARY (right-aligned: lines + Total Investment large bold blue)
//   NOTICE disclaimer → FOOTER
//
// Token spec:
//   MARGIN=50, LINE=16, SECTION_GAP=22
//   Helvetica / HelveticaBold, Letter 612×792
//   accent=rgb(0.13,0.47,0.94) dark=rgb(0.1,0.1,0.1) gray=rgb(0.4,0.4,0.4)
//
// MARGIN-GATE preserved: marginCents rendered only when defined (admin copy).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, PageSizes } from 'pdf-lib'
import type {
  ProjectReportInput,
  ProjectReportMeasurement,
  ProjectReportScopeItem,
} from './project-report-data'

const MARGIN = 50
const LINE = 16
const SECTION_GAP = 22
const FOOTER_RESERVE = 50

const dark = rgb(0.1, 0.1, 0.1)
const gray = rgb(0.4, 0.4, 0.4)
const lightGray = rgb(0.6, 0.6, 0.6)
const accent = rgb(0.13, 0.47, 0.94)
const tableHeaderBg = rgb(0.93, 0.93, 0.93)
const infoBandBg = rgb(0.95, 0.96, 0.97)
const cardBorderColor = rgb(0.82, 0.84, 0.88)
const ruleColor = rgb(0.15, 0.15, 0.15)

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
  if (c.y - needed < FOOTER_RESERVE) newPage(c)
}

function drawText(
  c: Cursor,
  str: string,
  x: number,
  opts: { size?: number; color?: ReturnType<typeof rgb>; f?: PDFFont } = {},
): void {
  c.page.drawText(str, {
    x,
    y: c.y,
    size: opts.size ?? 10,
    font: opts.f ?? c.font,
    color: opts.color ?? dark,
  })
}

function drawTextAt(
  c: Cursor,
  str: string,
  x: number,
  y: number,
  opts: { size?: number; color?: ReturnType<typeof rgb>; f?: PDFFont } = {},
): void {
  c.page.drawText(str, {
    x,
    y,
    size: opts.size ?? 10,
    font: opts.f ?? c.font,
    color: opts.color ?? dark,
  })
}

function drawTextRight(
  c: Cursor,
  str: string,
  rightX: number,
  opts: { size?: number; color?: ReturnType<typeof rgb>; f?: PDFFont } = {},
): void {
  const size = opts.size ?? 10
  const f = opts.f ?? c.font
  const w = f.widthOfTextAtSize(str, size)
  c.page.drawText(str, { x: rightX - w, y: c.y, size, font: f, color: opts.color ?? dark })
}

function thickRule(c: Cursor, thickness = 1.5): void {
  c.page.drawLine({
    start: { x: MARGIN, y: c.y },
    end: { x: c.width - MARGIN, y: c.y },
    thickness,
    color: ruleColor,
  })
}

function thinRule(c: Cursor): void {
  c.page.drawLine({
    start: { x: MARGIN, y: c.y },
    end: { x: c.width - MARGIN, y: c.y },
    thickness: 0.5,
    color: cardBorderColor,
  })
}

// Bold uppercase label + thick underline rule (contract section header style).
function sectionHeader(c: Cursor, label: string): void {
  ensureRoom(c, LINE + 8 + SECTION_GAP)
  drawText(c, label, MARGIN, { size: 11, f: c.bold, color: dark })
  c.y -= 5
  thickRule(c, 1.2)
  c.y -= SECTION_GAP
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const minor = abs % 100
  return `${sign}$${dollars.toLocaleString('en-US')}.${minor.toString().padStart(2, '0')}`
}

// ── HEADER ───────────────────────────────────────────────────────────────────

function drawHeader(c: Cursor, input: ProjectReportInput): void {
  const rightEdge = c.width - MARGIN
  const topY = c.y

  // Left: "BuildConnect" wordmark
  drawText(c, 'BuildConnect', MARGIN, { size: 22, f: c.bold, color: accent })

  // Right: "PROJECT REPORT" large bold
  const titleStr = 'PROJECT REPORT'
  const titleSize = 22
  const titleW = c.bold.widthOfTextAtSize(titleStr, titleSize)
  drawTextAt(c, titleStr, rightEdge - titleW, topY, { size: titleSize, f: c.bold, color: dark })

  c.y -= LINE + 4

  // Right: service as division subtitle (small caps style — uppercase, light gray)
  const sub = input.summary.serviceName.toUpperCase()
  const subSize = 8
  const subW = c.font.widthOfTextAtSize(sub, subSize)
  drawTextAt(c, sub, rightEdge - subW, c.y, { size: subSize, color: lightGray })

  c.y -= LINE

  // Right: contractor company bold
  const company = input.summary.contractorCompany
  if (company) {
    const cSize = 9
    const cW = c.bold.widthOfTextAtSize(company, cSize)
    drawTextAt(c, company, rightEdge - cW, c.y, { size: cSize, f: c.bold, color: dark })
  }
  c.y -= LINE - 2

  // Right: contractor name (lighter, if different from company)
  const person = input.summary.contractorName
  if (person && person !== company) {
    const pSize = 8
    const pW = c.font.widthOfTextAtSize(person, pSize)
    drawTextAt(c, person, rightEdge - pW, c.y, { size: pSize, color: gray })
    c.y -= LINE - 2
  }

  // Guarantee minimum header height of ~66pt from top
  const minY = topY - 68
  if (c.y > minY) c.y = minY

  c.y -= 10
  thickRule(c, 1.5)
  c.y -= SECTION_GAP
}

// ── INFO BAND ─────────────────────────────────────────────────────────────────
// Light-gray band, two centered columns: GENERATED | RECORD #

function drawInfoBand(c: Cursor, input: ProjectReportInput): void {
  const bandH = 52
  ensureRoom(c, bandH + SECTION_GAP)

  const bandY = c.y - bandH
  c.page.drawRectangle({
    x: MARGIN,
    y: bandY,
    width: c.width - MARGIN * 2,
    height: bandH,
    color: infoBandBg,
    borderColor: cardBorderColor,
    borderWidth: 0.5,
  })

  const mid = c.width / 2
  const labelSize = 7
  const valSize = 10
  const labelY = c.y - 13
  const valY = labelY - labelSize - 5

  const lCX = MARGIN + (mid - MARGIN) / 2
  const rCX = mid + (c.width - MARGIN - mid) / 2

  // Left: GENERATED
  const lLabel = 'GENERATED'
  const lVal = input.generatedAt
  drawTextAt(c, lLabel, lCX - c.font.widthOfTextAtSize(lLabel, labelSize) / 2, labelY, { size: labelSize, color: lightGray })
  drawTextAt(c, lVal, lCX - c.bold.widthOfTextAtSize(lVal, valSize) / 2, valY, { size: valSize, f: c.bold, color: dark })

  // Right: RECORD #
  const rLabel = 'RECORD #'
  const rVal = input.recordId
  drawTextAt(c, rLabel, rCX - c.font.widthOfTextAtSize(rLabel, labelSize) / 2, labelY, { size: labelSize, color: lightGray })
  drawTextAt(c, rVal, rCX - c.bold.widthOfTextAtSize(rVal, valSize) / 2, valY, { size: valSize, f: c.bold, color: dark })

  // Vertical separator
  c.page.drawLine({
    start: { x: mid, y: bandY + 8 },
    end: { x: mid, y: bandY + bandH - 8 },
    thickness: 0.5,
    color: cardBorderColor,
  })

  c.y = bandY - SECTION_GAP
}

// ── TWO CARDS ─────────────────────────────────────────────────────────────────
// CUSTOMER INFORMATION (left) | PROPERTY ADDRESS (right)

function drawCards(c: Cursor, input: ProjectReportInput): void {
  const gap = 14
  const cardW = (c.width - MARGIN * 2 - gap) / 2
  const cardH = 76
  ensureRoom(c, cardH + SECTION_GAP)

  const leftX = MARGIN
  const rightX = MARGIN + cardW + gap
  const cardY = c.y - cardH
  const pad = 12

  for (const cx of [leftX, rightX]) {
    c.page.drawRectangle({
      x: cx,
      y: cardY,
      width: cardW,
      height: cardH,
      color: rgb(1, 1, 1),
      borderColor: cardBorderColor,
      borderWidth: 0.75,
    })
  }

  const catSize = 7
  const nameSize = 11
  const detailSize = 8

  // Left card: CUSTOMER INFORMATION
  let ly = c.y - pad - catSize
  drawTextAt(c, 'CUSTOMER INFORMATION', leftX + pad, ly, { size: catSize, color: lightGray })
  ly -= nameSize + 5
  drawTextAt(c, input.summary.homeownerName || '—', leftX + pad, ly, { size: nameSize, f: c.bold, color: dark })
  // Show scheduled date below name since we have no email/phone in data
  const sched = `Scheduled: ${input.summary.bookingDate} at ${input.summary.bookingTime}`
  ly -= detailSize + 5
  drawTextAt(c, sched, leftX + pad, ly, { size: detailSize, color: gray })
  if (input.summary.soldAt) {
    ly -= detailSize + 3
    drawTextAt(c, `Sold: ${input.summary.soldAt}`, leftX + pad, ly, { size: detailSize, color: gray })
  }

  // Right card: PROPERTY ADDRESS
  const addr = input.summary.homeownerAddress || ''
  const commaIdx = addr.indexOf(',')
  const street = commaIdx > -1 ? addr.slice(0, commaIdx).trim() : addr
  const cityLine = commaIdx > -1 ? addr.slice(commaIdx + 1).trim() : ''

  let ry = c.y - pad - catSize
  drawTextAt(c, 'PROPERTY ADDRESS', rightX + pad, ry, { size: catSize, color: lightGray })
  ry -= nameSize + 5
  drawTextAt(c, street || '—', rightX + pad, ry, { size: nameSize, f: c.bold, color: dark })
  if (cityLine) {
    ry -= detailSize + 5
    drawTextAt(c, cityLine, rightX + pad, ry, { size: detailSize, color: gray })
  }

  c.y = cardY - SECTION_GAP
}

// ── SCOPE OF WORK ─────────────────────────────────────────────────────────────

function drawScope(c: Cursor, items: ProjectReportScopeItem[]): void {
  if (items.length === 0) return
  sectionHeader(c, 'SCOPE OF WORK')

  const detailX = c.width - MARGIN - 110
  const tableHeaderH = LINE + 4

  ensureRoom(c, tableHeaderH + Math.min(items.length, 5) * LINE + SECTION_GAP)

  // PRODUCTS & SERVICES gray header row
  c.page.drawRectangle({
    x: MARGIN,
    y: c.y - tableHeaderH + 4,
    width: c.width - MARGIN * 2,
    height: tableHeaderH,
    color: tableHeaderBg,
  })
  drawText(c, 'PRODUCTS & SERVICES', MARGIN + 4, { size: 8, f: c.bold, color: gray })
  c.y -= LINE + 2

  // Column labels
  drawText(c, 'Description', MARGIN, { size: 8, color: lightGray })
  drawText(c, 'Detail', detailX, { size: 8, color: lightGray })
  c.y -= LINE

  for (const it of items) {
    ensureRoom(c, LINE)
    drawText(c, `• ${it.label}`, MARGIN + 4, { size: 9, f: c.bold })
    if (it.detail) drawText(c, it.detail, detailX, { size: 8, color: gray })
    c.y -= LINE
  }

  c.y -= SECTION_GAP * 0.4
  thinRule(c)
  c.y -= SECTION_GAP
}

// ── MATERIALS ─────────────────────────────────────────────────────────────────

function drawMaterials(c: Cursor, materials: string[]): void {
  sectionHeader(c, 'MATERIALS')
  if (materials.length === 0) {
    ensureRoom(c, LINE)
    drawText(c, 'Standard package — see contractor for material details.', MARGIN, { size: 9, color: gray })
    c.y -= LINE
  } else {
    for (const m of materials) {
      ensureRoom(c, LINE)
      drawText(c, `• ${m}`, MARGIN + 4, { size: 9 })
      c.y -= LINE
    }
  }
  c.y -= SECTION_GAP * 0.4
  thinRule(c)
  c.y -= SECTION_GAP
}

// ── MEASUREMENTS ──────────────────────────────────────────────────────────────

function drawMeasurements(c: Cursor, rows: ProjectReportMeasurement[]): void {
  if (rows.length === 0) return
  sectionHeader(c, 'MEASUREMENTS')
  const VALUE_X = MARGIN + 180
  for (const row of rows) {
    ensureRoom(c, LINE)
    drawText(c, `${row.label}:`, MARGIN, { size: 9, f: c.bold })
    drawText(c, row.value, VALUE_X, { size: 9 })
    c.y -= LINE
  }
  c.y -= SECTION_GAP * 0.4
  thinRule(c)
  c.y -= SECTION_GAP
}

// ── PERMITS & ASSOCIATION ─────────────────────────────────────────────────────

function drawPermits(c: Cursor, p: ProjectReportInput['permits']): void {
  sectionHeader(c, 'PERMITS & ASSOCIATION')
  const VALUE_X = MARGIN + 180
  const yn = (v: 'yes' | 'no' | null | undefined): string =>
    v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '—'

  ensureRoom(c, LINE)
  drawText(c, 'Permit pulled:', MARGIN, { size: 9, f: c.bold })
  drawText(c, yn(p.projectPermit), VALUE_X, { size: 9 })
  c.y -= LINE

  ensureRoom(c, LINE)
  drawText(c, 'HOA / Association required:', MARGIN, { size: 9, f: c.bold })
  drawText(c, yn(p.associationRequired), VALUE_X, { size: 9 })
  c.y -= LINE

  if (p.poolSurveyRequired !== undefined) {
    ensureRoom(c, LINE)
    drawText(c, 'Pool survey required:', MARGIN, { size: 9, f: c.bold })
    drawText(c, yn(p.poolSurveyRequired), VALUE_X, { size: 9 })
    c.y -= LINE
  }

  if (p.permitWaiver?.acknowledged) {
    ensureRoom(c, LINE * 3 + 8)
    c.y -= 4
    drawText(c, 'No-permit liability waiver signed by:', MARGIN, { size: 9, f: c.bold, color: rgb(0.7, 0.4, 0) })
    c.y -= LINE
    drawText(c, p.permitWaiver.signedName, MARGIN, { size: 9 })
    c.y -= LINE
    drawText(
      c,
      `Acknowledged ${new Date(p.permitWaiver.signedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
      MARGIN,
      { size: 8, color: gray },
    )
    c.y -= LINE
  }

  c.y -= SECTION_GAP * 0.4
  thinRule(c)
  c.y -= SECTION_GAP
}

// ── INVESTMENT SUMMARY ────────────────────────────────────────────────────────
// Right-aligned block. Customer copy: only Total Investment.
// Admin copy: itemized lines + thin divider + Total Investment + Margin row.

function drawInvestmentSummary(c: Cursor, pricing: ProjectReportInput['pricing']): void {
  sectionHeader(c, 'INVESTMENT SUMMARY')

  const rightEdge = c.width - MARGIN
  const labelX = c.width - MARGIN - 220

  // Admin-only itemized lines
  for (const line of pricing.lines) {
    ensureRoom(c, LINE)
    drawText(c, line.label, labelX, { size: 9, color: dark })
    if (line.amountCents !== undefined) {
      drawTextRight(c, formatCents(line.amountCents), rightEdge, { size: 9 })
    }
    c.y -= LINE
  }

  // Thin separator above total when itemized lines exist
  if (pricing.lines.length > 0) {
    ensureRoom(c, 12)
    c.y -= 4
    c.page.drawLine({
      start: { x: labelX, y: c.y },
      end: { x: rightEdge, y: c.y },
      thickness: 0.5,
      color: cardBorderColor,
    })
    c.y -= 8
  }

  // Total Investment — large bold accent blue, right-aligned
  ensureRoom(c, 28)
  c.y -= 4
  drawText(c, 'Total Investment', labelX, { size: 14, f: c.bold, color: dark })
  drawTextRight(c, formatCents(pricing.totalCents), rightEdge, { size: 14, f: c.bold, color: accent })
  c.y -= 22

  // Margin row — admin only, structurally gated on marginCents defined
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
    drawTextRight(c, formatCents(pricing.marginCents), rightEdge, { size: 9, color: gray })
    c.y -= LINE
  }
}

// ── NOTICE DISCLAIMER ─────────────────────────────────────────────────────────

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
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
  const blockHeight = padTop + labelSize + labelGap + bodySize + (lines.length - 1) * bodyLine + padBot
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
  let curY = boxTop - padTop - labelSize
  c.page.drawText('NOTICE', { x: MARGIN + padX, y: curY, size: labelSize, font: c.bold, color: gray })
  curY -= labelGap + bodySize
  for (const line of lines) {
    c.page.drawText(line, { x: MARGIN + padX, y: curY, size: bodySize, font: c.font, color: gray })
    curY -= bodyLine
  }
  c.y = boxBottom - SECTION_GAP * 0.5
}

// ── FOOTER ────────────────────────────────────────────────────────────────────

function drawFooter(c: Cursor, input: ProjectReportInput): void {
  const footerY = 30
  c.page.drawLine({
    start: { x: MARGIN, y: footerY + 14 },
    end: { x: c.width - MARGIN, y: footerY + 14 },
    thickness: 0.5,
    color: cardBorderColor,
  })
  c.page.drawText('This document was auto-generated by BuildConnect as a summary of project scope.', {
    x: MARGIN,
    y: footerY + 4,
    size: 7,
    font: c.font,
    color: gray,
  })
  c.page.drawText(`Record ID: ${input.recordId}`, {
    x: c.width - MARGIN - 130,
    y: footerY + 4,
    size: 7,
    font: c.font,
    color: gray,
  })
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────

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
  drawInfoBand(c, input)
  drawCards(c, input)
  drawScope(c, input.scope)
  drawMaterials(c, input.materials)
  drawMeasurements(c, input.measurements)
  drawPermits(c, input.permits)
  drawInvestmentSummary(c, input.pricing)
  drawDisclaimer(c)
  drawFooter(c, input)

  const bytes = await doc.save()
  const dataUri = await doc.saveAsBase64({ dataUri: true })
  return { dataUri, bytes }
}
