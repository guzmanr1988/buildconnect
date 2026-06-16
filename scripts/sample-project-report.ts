// Sample-PDF harness for iris fidelity review.
//
// Produces TWO byte outputs from a single fixture SentProject:
//   samples/project-report-customer.pdf  (showMargin=false — customer default)
//   samples/project-report-admin.pdf     (showMargin=true  — admin/Rod view)
//
// Fixture is a roofing project that exercises every section iris drew:
// scope items, materials (shingle + tile + frame combos kept off so it
// stays roofing-clean), measurements (roofMeasurement + perimeter +
// pitched area), permits + association + waiver-not-acknowledged path,
// pricing with one auto_sold_adjustment line so the EXTRA $ row shows.
//
// Run: cd buildconnect-bubble-cards && npx tsx scripts/sample-project-report.ts

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveProjectReport } from '../src/lib/project-report-data'
import { generateProjectReportPdf } from '../src/lib/generate-project-report-pdf'
import type { SentProject } from '../src/stores/projects-store'

const FIXTURE_SP: SentProject = {
  id: 'sample-sp-roofing-001',
  status: 'sold',
  item: {
    id: 'sample-cart-001',
    serviceId: 'roofing',
    serviceName: 'Roof Replacement',
    selections: {
      roof_material: ['shingle'],
      roof_addons: ['gutters', 'soffit_metal'],
      pitch_complexity: ['standard_pitch'],
    },
    selectionQuantities: {},
    shingleSelection: {
      color: 'Weathered Wood',
      roofSize: 'medium',
    },
    roofMeasurement: {
      areaSqft: 2400,
      pitch: '6/12',
      address: '1100 S Ocean Blvd, Palm Beach FL 33480',
      perimeterFt: 220,
      pitchedAreaSqft: 2580,
      flatAreaSqft: 0,
    },
    roofPermit: 'yes',
    permitWaiver: null,
    roofAddonLinearFt: {
      gutters: 220,
      soffit_metal: 220,
    },
    addedAt: '2026-06-10T14:32:00.000Z',
    address: {
      label: 'Primary',
      full: '1100 S Ocean Blvd, Palm Beach FL 33480',
    },
  },
  contractor: {
    vendor_id: '3e0821aa-89e7-4140-bff8-c4f7f985f561',
    name: 'Alex Rivera',
    company: 'Apex Roofing & Solar',
    rating: 4.9,
  },
  booking: {
    date: 'Jun 20, 2026',
    time: '10:00 AM',
  },
  homeowner: {
    name: 'Donald Trump',
    phone: '(561) 555-0100',
    email: 'homeowner@buildc.net',
    address: '1100 S Ocean Blvd, Palm Beach FL 33480',
  },
  homeowner_id: 'f33d7255-1485-4936-9daf-b005899f214a',
  vendor_id: '3e0821aa-89e7-4140-bff8-c4f7f985f561',
  sentAt: '2026-06-10T14:32:00.000Z',
  soldAt: '2026-06-16T18:00:00.000Z',
  saleAmount: 16800,
  projectPermit: 'yes',
  projectPermitWaiver: null,
  projectAssociation: 'yes',
  priceLineItems: [
    {
      id: 'roofing-material',
      label: 'Material Price',
      amount: 14500,
      originalAmount: 14500,
      source: 'preset',
    },
    {
      id: 'roofing-permit',
      label: 'Permit Price',
      amount: 450,
      originalAmount: 450,
      source: 'preset',
    },
    {
      id: 'auto-sold-adj-001',
      label: 'Additional services',
      amount: 1850,
      originalAmount: 0,
      source: 'auto_sold_adjustment',
    },
  ],
}

async function main() {
  const samplesDir = resolve(import.meta.dirname ?? '.', '..', 'samples')
  if (!existsSync(samplesDir)) {
    mkdirSync(samplesDir, { recursive: true })
  }

  const customer = resolveProjectReport({
    sp: FIXTURE_SP,
    showMargin: false,
    generatedAtOverride: 'Jun 16, 2026 at 6:00 PM',
    recordIdOverride: 'BC-SAMPLE-CUSTOMER',
  })
  const admin = resolveProjectReport({
    sp: FIXTURE_SP,
    showMargin: true,
    generatedAtOverride: 'Jun 16, 2026 at 6:00 PM',
    recordIdOverride: 'BC-SAMPLE-ADMIN',
  })

  // Sanity check the margin-gate
  if (customer.pricing.marginCents !== undefined) {
    throw new Error('MARGIN-GATE BREACH: customer copy computed marginCents — must be undefined')
  }
  if (admin.pricing.marginCents === undefined) {
    throw new Error('Admin copy missing marginCents — resolver did not compute when showMargin=true')
  }

  const customerOut = await generateProjectReportPdf(customer)
  const adminOut = await generateProjectReportPdf(admin)

  const customerPath = resolve(samplesDir, 'project-report-customer.pdf')
  const adminPath = resolve(samplesDir, 'project-report-admin.pdf')
  writeFileSync(customerPath, customerOut.bytes)
  writeFileSync(adminPath, adminOut.bytes)

  console.log('Customer PDF (showMargin=false):', customerPath, `(${customerOut.bytes.length} bytes)`)
  console.log('Admin PDF (showMargin=true):    ', adminPath, `(${adminOut.bytes.length} bytes)`)
  console.log()
  console.log('Customer pricing:')
  console.log('  total:', customer.pricing.totalCents, 'cents')
  console.log('  margin:', customer.pricing.marginCents, '(must be undefined)')
  console.log('Admin pricing:')
  console.log('  total:', admin.pricing.totalCents, 'cents')
  console.log('  margin:', admin.pricing.marginCents, 'cents')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
