import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

async function makePlaceholder(dir, filename, title, subtitle) {
  mkdirSync(dir, { recursive: true })
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([612, 792])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: rgb(0.93, 0.96, 1) })
  page.drawText(title, { x: 40, y: 762, size: 14, font: bold, color: rgb(0.1, 0.2, 0.5) })
  page.drawText(subtitle, { x: 40, y: 748, size: 10, font, color: rgb(0.3, 0.3, 0.3) })

  page.drawText('PLACEHOLDER - Replace with official form PDF', {
    x: 40, y: 700, size: 11, font: bold, color: rgb(0.8, 0.4, 0),
  })
  page.drawText('Drop the real PDF from the building department into:', {
    x: 40, y: 680, size: 10, font, color: rgb(0.4, 0.4, 0.4),
  })
  page.drawText(join(dir, filename).replace('public/', 'public/'), {
    x: 40, y: 662, size: 10, font, color: rgb(0.2, 0.4, 0.8),
  })

  // Signature line
  page.drawLine({ start: { x: 40, y: 120 }, end: { x: 280, y: 120 }, thickness: 1, color: rgb(0.2, 0.2, 0.2) })
  page.drawText('Applicant Signature', { x: 40, y: 105, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
  page.drawLine({ start: { x: 340, y: 120 }, end: { x: 560, y: 120 }, thickness: 1, color: rgb(0.2, 0.2, 0.2) })
  page.drawText('Date', { x: 340, y: 105, size: 9, font, color: rgb(0.4, 0.4, 0.4) })

  const bytes = await pdfDoc.save()
  writeFileSync(join(dir, filename), bytes)
  console.log(`  created ${join(dir, filename)}`)
}

// City permit placeholders
const cities = [
  { key: 'miami', label: 'City of Miami' },
  { key: 'miami-dade', label: 'Miami-Dade County' },
  { key: 'fort-lauderdale', label: 'Fort Lauderdale (Broward Uniform)' },
  { key: 'west-palm-beach', label: 'West Palm Beach' },
]
for (const { key, label } of cities) {
  await makePlaceholder(
    join('public', 'permits', 'city-permit'),
    `${key}.pdf`,
    label,
    'Building Permit Application',
  )
}

// Notice of Commencement
await makePlaceholder(
  join('public', 'permits'),
  'notice-of-commencement.pdf',
  'Notice of Commencement',
  'Florida Statute 713 — Required for all jobs over $5,000',
)

console.log('\nDone — 5 permit placeholders generated.')
