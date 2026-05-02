import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'

export interface SubmissionPdfInput {
  serviceName: string
  vendorCompany: string
  vendorName: string
  bookingDate: string
  bookingTime: string
  homeownerAddress?: string
  idDocDataUrl?: string
  permitWaiver?: { acknowledged: boolean; signedName: string; signedAt: string } | null
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

export async function generateSubmissionPdf(input: SubmissionPdfInput): Promise<string> {
  const {
    serviceName, vendorCompany, vendorName,
    bookingDate, bookingTime, homeownerAddress,
    idDocDataUrl, permitWaiver,
  } = input

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage(PageSizes.Letter)
  const { width, height } = page.getSize()

  const margin = 50
  const colWidth = width - margin * 2
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

  // ── Header ──
  text('BuildConnect', margin, y, { size: 20, f: bold, color: accent })
  y -= 22
  text('Project Submission Record', margin, y, { size: 12, f: bold, color: dark })
  y -= LINE
  text(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, margin, y, { size: 9, color: gray })
  y -= LINE * 0.5

  // divider
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= SECTION_GAP

  // ── Section A: Project Summary ──
  text('PROJECT SUMMARY', margin, y, { size: 8, f: bold, color: gray })
  y -= LINE
  const fields: [string, string][] = [
    ['Service', serviceName],
    ['Contractor', `${vendorCompany} (${vendorName})`],
    ['Scheduled', `${bookingDate} at ${bookingTime}`],
  ]
  if (homeownerAddress) fields.push(['Property', homeownerAddress])
  for (const [label, val] of fields) {
    text(`${label}:`, margin, y, { size: 9, f: bold })
    text(val, margin + 80, y, { size: 9 })
    y -= LINE
  }
  y -= SECTION_GAP * 0.5
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= SECTION_GAP

  // ── Section B: Homeowner ID ──
  text('HOMEOWNER IDENTIFICATION', margin, y, { size: 8, f: bold, color: gray })
  y -= LINE + 4

  if (idDocDataUrl) {
    const mime = idDocDataUrl.split(';')[0].replace('data:', '')
    const b64 = idDocDataUrl.split(',')[1]
    let embedded = false
    try {
      const bytes = base64ToUint8Array(b64)
      let img
      if (mime === 'image/jpeg' || mime === 'image/jpg') {
        img = await pdfDoc.embedJpg(bytes)
      } else if (mime === 'image/png') {
        img = await pdfDoc.embedPng(bytes)
      }
      if (img) {
        const maxW = colWidth
        const maxH = 160
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        const w = img.width * scale
        const h = img.height * scale
        page.drawImage(img, { x: margin, y: y - h, width: w, height: h })
        y -= h + 8
        text('Homeowner-provided government-issued ID.', margin, y, { size: 8, color: gray })
        y -= LINE
        embedded = true
      }
    } catch { /* fall through to fallback */ }
    if (!embedded) {
      text('ID document attached — format not embeddable; original on file.', margin, y, { size: 9, color: gray })
      y -= LINE
    }
  } else {
    text('No ID document provided at time of submission.', margin, y, { size: 9, color: gray })
    y -= LINE
  }

  // ── Section C: No-Permit Waiver (if present) ──
  if (permitWaiver?.acknowledged) {
    y -= SECTION_GAP * 0.5
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
    y -= SECTION_GAP
    text('NO-PERMIT LIABILITY WAIVER', margin, y, { size: 8, f: bold, color: rgb(0.7, 0.4, 0) })
    y -= LINE + 4

    const waiverLines = [
      'The homeowner acknowledged that proceeding without a building permit means they are personally',
      'responsible for any fines, penalties, or remediation costs imposed by the city or county if',
      'code-enforcement becomes involved. BuildConnect and the contractor are not liable for any',
      'penalties resulting from this decision.',
    ]
    for (const line of waiverLines) {
      text(line, margin, y, { size: 9, color: dark })
      y -= LINE
    }
    y -= 6

    text('Acknowledged by:', margin, y, { size: 9, f: bold })
    text(permitWaiver.signedName, margin + 100, y, { size: 9 })
    y -= LINE
    text('Signed at:', margin, y, { size: 9, f: bold })
    text(new Date(permitWaiver.signedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }), margin + 100, y, { size: 9 })
    y -= LINE
    text('Acknowledged: Yes', margin, y, { size: 9, f: bold })
    y -= LINE
  }

  // ── Footer ──
  const footerY = 30
  page.drawLine({ start: { x: margin, y: footerY + 14 }, end: { x: width - margin, y: footerY + 14 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  text('This document was auto-generated by BuildConnect and serves as a record of project submission.', margin, footerY + 4, { size: 7, color: gray })
  text(`Record ID: BC-${Date.now()}`, width - margin - 120, footerY + 4, { size: 7, color: gray })

  return pdfDoc.saveAsBase64({ dataUri: true })
}
