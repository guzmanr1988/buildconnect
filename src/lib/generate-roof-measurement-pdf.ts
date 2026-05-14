import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'
import { computeRoofTotal } from '@/lib/roof-area-math'

export interface RoofMeasurementPdfInput {
  address: string
  pitch: string
  perimeterFt?: number
  pitchedAreaSqft?: number
  flatAreaSqft?: number
  includeMaterialOrder?: boolean
  includePerimeter?: boolean
  includeFlatArea?: boolean
}

export async function generateRoofMeasurementPdf(
  input: RoofMeasurementPdfInput,
): Promise<Uint8Array> {
  const {
    address,
    pitch,
    perimeterFt = 0,
    pitchedAreaSqft = 0,
    flatAreaSqft = 0,
    includeMaterialOrder = true,
    includePerimeter = true,
    includeFlatArea = true,
  } = input

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage(PageSizes.Letter)
  const { width, height } = page.getSize()

  const margin = 50
  let y = height - margin

  const LINE = 16
  const SECTION_GAP = 22
  const gray = rgb(0.4, 0.4, 0.4)
  const dark = rgb(0.1, 0.1, 0.1)
  const accent = rgb(0.13, 0.47, 0.94)

  const text = (str: string, x: number, yPos: number, opts: {
    size?: number; color?: ReturnType<typeof rgb>; f?: typeof font
  } = {}) => {
    page.drawText(str, {
      x, y: yPos,
      size: opts.size ?? 10,
      font: opts.f ?? font,
      color: opts.color ?? dark,
    })
  }

  text('BuildConnect', margin, y, { size: 20, f: bold, color: accent })
  y -= 22
  text('Roof Measurement Record', margin, y, { size: 12, f: bold, color: dark })
  y -= LINE
  text(
    `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
    margin, y, { size: 9, color: gray },
  )
  y -= LINE * 0.5

  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= SECTION_GAP

  text('PROPERTY', margin, y, { size: 8, f: bold, color: gray })
  y -= LINE
  text('Address:', margin, y, { size: 9, f: bold })
  text(address || '—', margin + 80, y, { size: 9 })
  y -= LINE
  y -= SECTION_GAP * 0.5

  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= SECTION_GAP

  const hasFlat = flatAreaSqft > 0
  const flatInOrder = includeMaterialOrder && includeFlatArea && hasFlat
  const { pitchedWaste, flatWaste, totalSqft, totalSquares } = computeRoofTotal({
    pitchedAreaSqft: Math.round(pitchedAreaSqft),
    flatAreaSqft: Math.round(flatAreaSqft),
    includeMaterialOrder,
    includeFlatArea,
  })

  text('MAIN ROOF', margin, y, { size: 8, f: bold, color: gray })
  y -= LINE
  if (includeMaterialOrder) {
    const orderSquares = Math.ceil(totalSqft / 100)
    text(`${totalSqft.toLocaleString()} sqft (${orderSquares} squares)`, margin, y, { size: 11, f: bold })
    y -= LINE
    const sublabelParts: string[] = []
    if (pitchedWaste > 0) sublabelParts.push(`Pitched ${Math.round(pitchedAreaSqft).toLocaleString()}`)
    if (flatWaste > 0) sublabelParts.push(`Flat ${Math.round(flatAreaSqft).toLocaleString()}`)
    if (sublabelParts.length > 0) {
      text(`${sublabelParts.join(' + ')} sqft + 2% waste`, margin, y, { size: 9, color: gray })
      y -= LINE
    }
  } else {
    text('Material Order: Excluded', margin, y, { size: 11, f: bold })
    y -= LINE
  }
  y -= SECTION_GAP * 0.5

  text('ROOF PITCH', margin, y, { size: 8, f: bold, color: gray })
  y -= LINE
  text(pitch || '—', margin, y, { size: 11, f: bold })
  y -= LINE
  y -= SECTION_GAP * 0.5

  text('ROOF PERIMETER', margin, y, { size: 8, f: bold, color: gray })
  y -= LINE
  if (includePerimeter) {
    text(`~${Math.round(perimeterFt).toLocaleString()} lin ft`, margin, y, { size: 11, f: bold })
    y -= LINE
    text('Used for gutter, fascia, and soffit estimates', margin, y, { size: 9, color: gray })
    y -= LINE
  } else {
    text('Excluded', margin, y, { size: 11, f: bold })
    y -= LINE
  }
  y -= SECTION_GAP * 0.5

  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= SECTION_GAP

  text('AREA BREAKDOWN', margin, y, { size: 8, f: bold, color: gray })
  y -= LINE
  text('Pitched:', margin, y, { size: 9, f: bold })
  text(`${Math.round(pitchedAreaSqft).toLocaleString()} sqft`, margin + 80, y, { size: 9 })
  y -= LINE
  if (hasFlat) {
    text('Flat:', margin, y, { size: 9, f: bold })
    const flatLine = includeFlatArea
      ? `${Math.round(flatAreaSqft).toLocaleString()} sqft + 2% waste`
      : `${Math.round(flatAreaSqft).toLocaleString()} sqft — Excluded`
    text(flatLine, margin + 80, y, { size: 9 })
    y -= LINE
  }
  y -= SECTION_GAP * 0.5

  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= SECTION_GAP

  text('MAIN ROOF TOTAL', margin, y, { size: 8, f: bold, color: gray })
  y -= LINE
  text(
    `${totalSqft.toLocaleString()} sqft (${totalSquares} squares)`,
    margin, y, { size: 11, f: bold, color: accent },
  )
  y -= LINE
  text('Used for pricing', margin, y, { size: 9, color: gray })
  y -= LINE
  y -= SECTION_GAP * 0.5

  if (hasFlat) {
    text('FLAT TOTAL', margin, y, { size: 8, f: bold, color: gray })
    y -= LINE
    if (flatInOrder) {
      const flatWithWaste = Math.round(flatAreaSqft * 1.02)
      const flatSquares = Math.ceil(flatWithWaste / 100)
      text(
        `${flatWithWaste.toLocaleString()} sqft (${flatSquares} squares)`,
        margin, y, { size: 11, f: bold },
      )
      y -= LINE
      text(`${Math.round(flatAreaSqft).toLocaleString()} sqft + 2% waste`, margin, y, { size: 9, color: gray })
      y -= LINE
    } else {
      text('Excluded', margin, y, { size: 11, f: bold })
      y -= LINE
    }
  }

  const footerY = 30
  page.drawLine({
    start: { x: margin, y: footerY + 14 },
    end: { x: width - margin, y: footerY + 14 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  })
  text(
    'This document was auto-generated by BuildConnect from the satellite roof measurement on file.',
    margin, footerY + 4, { size: 7, color: gray },
  )
  text(`Record ID: BC-${Date.now()}`, width - margin - 120, footerY + 4, { size: 7, color: gray })

  return pdfDoc.save()
}
