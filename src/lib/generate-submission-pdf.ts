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

  const MARGIN = 50
  const LINE = 16
  const SECTION_GAP = 26
  // Uniform label→value offset — matches project-report spec to keep both PDFs consistent.
  const FIELD_OFFSET = 150

  const dark = rgb(0.1, 0.1, 0.1)
  const gray = rgb(0.4, 0.4, 0.4)
  const accent = rgb(0.13, 0.47, 0.94)
  const dividerColor = rgb(0.8, 0.8, 0.8)
  const bandBlue = rgb(0.93, 0.96, 1.0)
  const chipAmber = rgb(1.0, 0.96, 0.88)

  let y = height - MARGIN

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

  const drawDivider = (yPos: number) => {
    page.drawLine({
      start: { x: MARGIN, y: yPos },
      end: { x: width - MARGIN, y: yPos },
      thickness: 0.5,
      color: dividerColor,
    })
  }

  // Chip: rounded rect behind section label — blue for standard sections, amber for waiver.
  const sectionChip = (
    label: string, yPos: number,
    chipFill: ReturnType<typeof rgb>,
    labelColor: ReturnType<typeof rgb>,
  ) => {
    const chipPadX = 8
    const chipH = 14
    const textW = bold.widthOfTextAtSize(label, 8)
    page.drawRectangle({
      x: MARGIN,
      y: yPos - 2,
      width: textW + chipPadX * 2,
      height: chipH,
      color: chipFill,
    })
    text(label, MARGIN + chipPadX, yPos + 3, { size: 8, f: bold, color: labelColor })
  }

  const fieldRow = (label: string, val: string, yPos: number) => {
    text(`${label}:`, MARGIN, yPos, { size: 9, f: bold })
    text(val, MARGIN + FIELD_OFFSET, yPos, { size: 9 })
  }

  // ── Header band (light blue tint) ──
  const bandH = 70
  page.drawRectangle({ x: 0, y: height - bandH, width, height: bandH, color: bandBlue })
  text('BuildConnect', MARGIN, y, { size: 20, f: bold, color: accent })
  y -= 24
  text('Project Submission Record', MARGIN, y, { size: 12, f: bold, color: dark })
  y -= LINE
  text(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, MARGIN, y, { size: 9, color: gray })
  y -= LINE * 0.5
  drawDivider(y)
  y -= SECTION_GAP

  // ── Section A: Project Summary ──
  sectionChip('PROJECT SUMMARY', y, bandBlue, accent)
  y -= LINE + 6

  const fields: [string, string][] = [
    ['Service', serviceName],
    ['Contractor', `${vendorCompany} (${vendorName})`],
    ['Scheduled', `${bookingDate} at ${bookingTime}`],
  ]
  if (homeownerAddress) fields.push(['Property', homeownerAddress])
  for (const [label, val] of fields) {
    fieldRow(label, val, y)
    y -= LINE
  }
  y -= SECTION_GAP * 0.5
  drawDivider(y)
  y -= SECTION_GAP

  // ── Section B: Homeowner ID ──
  sectionChip('HOMEOWNER IDENTIFICATION', y, bandBlue, accent)
  y -= LINE + 8

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
        const cardPad = 12
        const maxW = width - MARGIN * 2 - cardPad * 2
        const maxH = 160
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        const imgW = img.width * scale
        const imgH = img.height * scale
        // Card: caption row (LINE) + image + padding on all sides
        const cardW = imgW + cardPad * 2
        const cardH = imgH + cardPad * 2 + LINE
        const cardX = MARGIN
        const cardY = y - cardH

        page.drawRectangle({
          x: cardX, y: cardY,
          width: cardW, height: cardH,
          color: rgb(0.98, 0.99, 1.0),
          borderColor: rgb(0.82, 0.88, 0.96),
          borderWidth: 1,
        })
        // Caption inside card top-left
        text('Government-issued ID', cardX + cardPad, y - cardPad - 1, { size: 7.5, f: bold, color: gray })
        // Image below caption
        page.drawImage(img, { x: cardX + cardPad, y: cardY + cardPad, width: imgW, height: imgH })
        y = cardY - 8
        text('Homeowner-provided government-issued ID.', MARGIN, y, { size: 8, color: gray })
        y -= LINE
        embedded = true
      }
    } catch { /* fall through */ }
    if (!embedded) {
      text('ID document attached — format not embeddable; original on file.', MARGIN, y, { size: 9, color: gray })
      y -= LINE
    }
  } else {
    text('No ID document provided at time of submission.', MARGIN, y, { size: 9, color: gray })
    y -= LINE
  }

  // ── Section C: No-Permit Waiver ──
  if (permitWaiver?.acknowledged) {
    y -= SECTION_GAP * 0.5
    drawDivider(y)
    y -= SECTION_GAP
    sectionChip('NO-PERMIT LIABILITY WAIVER', y, chipAmber, rgb(0.65, 0.38, 0.0))
    y -= LINE + 8

    const waiverLines = [
      'The homeowner acknowledged that proceeding without a building permit means they are personally',
      'responsible for any fines, penalties, or remediation costs imposed by the city or county if',
      'code-enforcement becomes involved. BuildConnect and the contractor are not liable for any',
      'penalties resulting from this decision.',
    ]
    for (const line of waiverLines) {
      text(line, MARGIN, y, { size: 9, color: dark })
      y -= LINE
    }
    y -= 6

    fieldRow('Acknowledged by', permitWaiver.signedName, y)
    y -= LINE
    fieldRow('Signed at', new Date(permitWaiver.signedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }), y)
    y -= LINE
    text('Acknowledged: Yes', MARGIN, y, { size: 9, f: bold })
    y -= LINE
  }

  // ── Footer ──
  const footerY = 30
  drawDivider(footerY + 14)
  text('This document was auto-generated by BuildConnect and serves as a record of project submission.', MARGIN, footerY + 4, { size: 7, color: gray })
  text(`Record ID: BC-${Date.now()}`, width - MARGIN - 120, footerY + 4, { size: 7, color: gray })

  return pdfDoc.saveAsBase64({ dataUri: true })
}
