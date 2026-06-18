// One-off harness: render a sample admin Project Report PDF from the iris
// fixture (kratos msg 1781752244469) so Rod can review the new look.
// Dynamic-imports pdf-lib so we can call the same draw routines the SPA uses;
// duplicates the renderer body inline since project-report-data.ts depends on
// SentProject (zustand stores) which won't load under bare Node.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = `${here}/../tmp/project-report-sample.pdf`

const MARGIN = 50
const LINE = 16
const SECTION_GAP = 22
const FOOTER_RESERVE = 50
const FIELD_VALUE_OFFSET = 150

const dark = rgb(0.1, 0.1, 0.1)
const gray = rgb(0.4, 0.4, 0.4)
const accent = rgb(0.13, 0.47, 0.94)
const dividerColor = rgb(0.8, 0.8, 0.8)

function newPage(c) {
  c.page = c.doc.addPage(PageSizes.Letter)
  const { width, height } = c.page.getSize()
  c.width = width
  c.height = height
  c.y = height - MARGIN
}

function ensureRoom(c, needed) {
  if (c.y - needed < FOOTER_RESERVE) newPage(c)
}

function drawText(c, str, x, opts = {}) {
  c.page.drawText(str, {
    x,
    y: c.y,
    size: opts.size ?? 10,
    font: opts.f ?? c.font,
    color: opts.color ?? dark,
  })
}

function drawDivider(c) {
  c.page.drawLine({
    start: { x: MARGIN, y: c.y },
    end: { x: c.width - MARGIN, y: c.y },
    thickness: 0.5,
    color: dividerColor,
  })
}

function sectionHeader(c, label) {
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

function divLine(c) {
  ensureRoom(c, SECTION_GAP * 0.5)
  c.y -= SECTION_GAP * 0.5
  drawDivider(c)
  c.y -= SECTION_GAP
}

function fieldRow(c, label, value) {
  ensureRoom(c, LINE)
  drawText(c, `${label}:`, MARGIN, { size: 9, f: c.bold })
  drawText(c, value, MARGIN + FIELD_VALUE_OFFSET, { size: 9 })
  c.y -= LINE
}

function formatCents(cents) {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const minor = abs % 100
  return `${sign}$${dollars.toLocaleString('en-US')}.${minor.toString().padStart(2, '0')}`
}

function drawHeader(c, input) {
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

function drawSummary(c, input) {
  sectionHeader(c, 'PROJECT SUMMARY')
  fieldRow(c, 'Service', input.summary.serviceName)
  fieldRow(c, 'Contractor', `${input.summary.contractorCompany} (${input.summary.contractorName})`)
  if (input.summary.soldAt) fieldRow(c, 'Sold', input.summary.soldAt)
  fieldRow(c, 'Scheduled', `${input.summary.bookingDate} at ${input.summary.bookingTime}`)
  if (input.summary.homeownerName) fieldRow(c, 'Homeowner', input.summary.homeownerName)
  if (input.summary.homeownerAddress) fieldRow(c, 'Property', input.summary.homeownerAddress)
  divLine(c)
}

function drawScope(c, items) {
  if (items.length === 0) return
  sectionHeader(c, 'SCOPE OF WORK')
  const amountX = c.width - MARGIN - 80
  for (const it of items) {
    ensureRoom(c, LINE)
    drawText(c, `•  ${it.label}`, MARGIN, { size: 9 })
    if (it.detail) drawText(c, it.detail, amountX, { size: 8, color: gray })
    c.y -= LINE
  }
  divLine(c)
}

function drawMaterials(c, materials) {
  sectionHeader(c, 'MATERIALS')
  if (materials.length === 0) {
    ensureRoom(c, LINE)
    drawText(c, 'Standard package — see contractor for material details.', MARGIN, { size: 9, color: gray })
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

function drawMeasurements(c, m) {
  if (m.length === 0) return
  sectionHeader(c, 'MEASUREMENTS')
  for (const row of m) fieldRow(c, row.label, row.value)
  divLine(c)
}

function drawPermits(c, p) {
  sectionHeader(c, 'PERMITS & ASSOCIATION')
  fieldRow(c, 'Permit pulled', p.projectPermit === 'yes' ? 'Yes' : p.projectPermit === 'no' ? 'No' : '—')
  fieldRow(c, 'HOA / Association required', p.associationRequired === 'yes' ? 'Yes' : p.associationRequired === 'no' ? 'No' : '—')
  divLine(c)
}

function drawPricing(c, pricing) {
  sectionHeader(c, 'PRICING')
  const labelX = MARGIN
  const amountX = c.width - MARGIN - 80
  for (const line of pricing.lines) {
    ensureRoom(c, LINE)
    drawText(c, line.label, labelX, { size: 9 })
    if (line.amountCents !== undefined) drawText(c, formatCents(line.amountCents), amountX, { size: 9 })
    c.y -= LINE
  }
  ensureRoom(c, LINE + 10)
  c.y -= 10
  c.page.drawLine({
    start: { x: MARGIN, y: c.y + 14 },
    end: { x: c.width - MARGIN, y: c.y + 14 },
    thickness: 0.5,
    color: dividerColor,
  })
  drawText(c, 'Project Total', labelX, { size: 11, f: c.bold })
  drawText(c, formatCents(pricing.totalCents), amountX, { size: 11, f: c.bold, color: accent })
  c.y -= LINE
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
}

function drawFooter(c, input) {
  const footerY = 30
  c.page.drawLine({
    start: { x: MARGIN, y: footerY + 14 },
    end: { x: c.width - MARGIN, y: footerY + 14 },
    thickness: 0.5,
    color: dividerColor,
  })
  c.page.drawText('This document was auto-generated by BuildConnect as a summary of project scope.', {
    x: MARGIN, y: footerY + 4, size: 7, font: c.font, color: gray,
  })
  c.page.drawText(`Record ID: ${input.recordId}`, {
    x: c.width - MARGIN - 130, y: footerY + 4, size: 7, font: c.font, color: gray,
  })
}

const sample = {
  generatedAt: 'Jun 18, 2026, 12:30 AM',
  recordId: 'SAMPLE-0001',
  summary: {
    serviceName: 'Roofing',
    serviceCategory: 'roofing',
    contractorCompany: 'Apex Roofing & Solar',
    contractorName: 'Mike Apex',
    bookingDate: 'Jun 24, 2026',
    bookingTime: '9:00 AM',
    soldAt: 'Jun 18, 2026, 12:25 AM',
    homeownerName: 'Donald Trump',
    homeownerAddress: '10990 SW 225 Terrace Miami FL 33170',
  },
  scope: [
    { label: 'Tear-off existing roof', detail: 'metal' },
    { label: 'Install metal panels', detail: 'slate_gray' },
    { label: 'Underlayment & flashing', detail: 'standard' },
    { label: 'Ridge cap & vents', detail: 'matching' },
    { label: 'Drip edge replacement', detail: 'metal' },
  ],
  materials: [
    'Metal roof — slate_gray',
    'Synthetic underlayment — premium',
    'Galvanized flashing',
    'Ridge cap — slate_gray',
  ],
  measurements: [
    { label: 'Pitched area (waste-incl.)', value: '2,150 sqft' },
    { label: 'Roof slope', value: '5.5/12' },
    { label: 'Linear feet (eaves + ridges)', value: '214 ft' },
  ],
  permits: {
    projectPermit: 'yes',
    permitWaiver: null,
    associationRequired: 'no',
  },
  pricing: {
    lines: [
      { label: 'Base roofing package (2,150 sqft × $16.50)', amountCents: 3_547_500 },
      { label: 'Steeper-slope premium (5.5/12)', amountCents: 215_000 },
      { label: 'Linear-foot trim (214 ft × $11)', amountCents: 235_400 },
      { label: 'Permit pull + scheduling', amountCents: 250_000 },
      { label: 'Discount (loyalty)', amountCents: -247_900 },
    ],
    totalCents: 4_000_000,
    marginCents: 540_000,
    audience: 'admin',
  },
}

const doc = await PDFDocument.create()
const font = await doc.embedFont(StandardFonts.Helvetica)
const bold = await doc.embedFont(StandardFonts.HelveticaBold)
const page = doc.addPage(PageSizes.Letter)
const { width, height } = page.getSize()
const c = { doc, font, bold, page, y: height - MARGIN, width, height }

drawHeader(c, sample)
drawSummary(c, sample)
drawScope(c, sample.scope)
drawMaterials(c, sample.materials)
drawMeasurements(c, sample.measurements)
drawPermits(c, sample.permits)
drawPricing(c, sample.pricing)
drawFooter(c, sample)

const bytes = await doc.save()
mkdirSync(dirname(OUT_PATH), { recursive: true })
writeFileSync(OUT_PATH, bytes)
console.log(`Wrote ${OUT_PATH} (${bytes.length} bytes)`)
