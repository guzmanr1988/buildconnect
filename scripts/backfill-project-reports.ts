// One-time backfill: generate project_report PDFs for existing sold projects.
//
// Rod-direct via kratos msg 1781648823777-kratos-hccbo: he wants to click
// an EXISTING sold project today and see its report immediately, not just
// future sales. This script enumerates sent_projects WHERE status='sold'
// AND saleAmount truthy AND homeowner_id set, and for each one reuses the
// EXACT resolver + generator from src/lib/project-report-on-sold.ts.
//
// SAFETY POSTURE
//   - Customer copy ONLY (showMargin=false) — the customer-default copy
//     is structurally margin-safe (pricing.lines=[], single Project Total
//     = saleAmount). The persisted artifact never carries Rod's margin.
//   - Idempotent guard mirrors the trigger: skip any sp that already has
//     doc_type=project_report in homeowner_documents. Re-runs are no-ops.
//   - uploaded_by='system' — same provenance as the live trigger writes
//     so they're indistinguishable on the homeowner Documents page.
//   - These are Rod's REAL sold projects = wanted production artifacts,
//     NOT test junk. NO teardown.
//
// GATE (kratos directive): do NOT run this script until (1) apollo
// verify GREEN on the preview, (2) PR merged to main, (3) kratos go.
//
// Usage:
//   set -a && source /Users/rodolfoguzman/Sage/orgs/buildconnect/secrets.env && set +a
//   cd buildconnect-bubble-cards
//   npx tsx scripts/backfill-project-reports.ts            # apply (writes)
//   npx tsx scripts/backfill-project-reports.ts --dry-run  # count only
//
// Output: per-sp log of (sp.id, action, row_id, storage_path) + final
// summary {targeted, generated, skipped_existing, failed}.

import { createClient } from '@supabase/supabase-js'
import { resolveProjectReport } from '../src/lib/project-report-data'
import { generateProjectReportPdf } from '../src/lib/generate-project-report-pdf'
import type { SentProject } from '../src/stores/projects-store'
import type {
  CartItem,
  PriceLineItem,
  VendorRep,
} from '../src/types'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('FATAL: need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const BUCKET = 'homeowner-documents'

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false },
})

interface DbRow {
  id: string
  item: unknown
  status: string
  contractor: unknown
  booking_date: string | null
  booking_time: string | null
  homeowner_name: string | null
  homeowner_phone: string | null
  homeowner_email: string | null
  homeowner_address: string | null
  homeowner_id: string | null
  vendor_id: string | null
  sent_at: string
  sold_at: string | null
  completed_at: string | null
  sale_amount: number | null
  assigned_rep: unknown
  confirmed_at: string | null
  rep_assigned_at: string | null
  review_status: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  review_note: string | null
  price_line_items: unknown
  quoted_price_cents: number | null
  applied_financing_amount_cents: number | null
  applied_financing_application_id: string | null
  project_permit: string | null
  project_permit_waiver: unknown
  project_association: string | null
  pool_survey: string | null
  work_started_at: string | null
}

function rowToSentProject(row: DbRow): SentProject {
  return {
    id: row.id,
    item: row.item as CartItem,
    status: row.status as SentProject['status'],
    contractor: row.contractor as SentProject['contractor'],
    booking: { date: row.booking_date ?? '', time: row.booking_time ?? '' },
    homeowner: (row.homeowner_name || row.homeowner_email) ? {
      name: row.homeowner_name ?? '',
      phone: row.homeowner_phone ?? '',
      email: row.homeowner_email ?? '',
      address: row.homeowner_address ?? '',
    } : undefined,
    homeowner_id: row.homeowner_id ?? undefined,
    vendor_id: row.vendor_id ?? undefined,
    sentAt: row.sent_at,
    soldAt: row.sold_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    saleAmount: row.sale_amount != null ? Number(row.sale_amount) : undefined,
    assignedRep: row.assigned_rep as VendorRep | undefined,
    confirmedAt: row.confirmed_at ?? undefined,
    repAssignedAt: row.rep_assigned_at ?? undefined,
    reviewStatus: row.review_status as SentProject['reviewStatus'],
    reviewedAt: row.reviewed_at ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewNote: row.review_note ?? undefined,
    priceLineItems: row.price_line_items as PriceLineItem[] | undefined,
    quotedPriceCents: row.quoted_price_cents ?? undefined,
    applied_financing_amount_cents: row.applied_financing_amount_cents ?? null,
    applied_financing_application_id: row.applied_financing_application_id ?? null,
    projectPermit: row.project_permit as SentProject['projectPermit'],
    projectPermitWaiver: row.project_permit_waiver as SentProject['projectPermitWaiver'],
    projectAssociation: row.project_association as SentProject['projectAssociation'],
    poolSurvey: row.pool_survey as SentProject['poolSurvey'],
    workStartedAt: row.work_started_at ?? undefined,
  }
}

async function main() {
  console.log(DRY_RUN ? '── DRY RUN (no writes) ──' : '── BACKFILL (writes enabled) ──')

  const { data: rows, error: loadErr } = await supabase
    .from('sent_projects')
    .select(
      'id, item, status, contractor, booking_date, booking_time, ' +
        'homeowner_name, homeowner_phone, homeowner_email, homeowner_address, ' +
        'homeowner_id, vendor_id, sent_at, sold_at, completed_at, sale_amount, ' +
        'assigned_rep, confirmed_at, rep_assigned_at, review_status, reviewed_at, ' +
        'reviewed_by, review_note, price_line_items, quoted_price_cents, ' +
        'applied_financing_amount_cents, applied_financing_application_id, ' +
        'project_permit, project_permit_waiver, project_association, pool_survey, ' +
        'work_started_at'
    )
    .eq('status', 'sold')
  if (loadErr) {
    console.error('FATAL: load sent_projects failed:', loadErr.message)
    process.exit(1)
  }

  const allSold = (rows ?? []) as unknown as DbRow[]
  const eligible = allSold.filter(
    (r) => r.homeowner_id && r.sale_amount != null && Number(r.sale_amount) > 0,
  )

  console.log(`sold rows: ${allSold.length}`)
  console.log(`eligible (homeowner_id + saleAmount>0): ${eligible.length}`)

  let generated = 0
  let skipped = 0
  let failed = 0

  for (const row of eligible) {
    const spId = row.id

    const { data: existing, error: guardErr } = await supabase
      .from('homeowner_documents')
      .select('id')
      .eq('sent_project_id', spId)
      .eq('doc_type', 'project_report')
      .limit(1)
      .maybeSingle()
    if (guardErr) {
      console.error(`[${spId}] guard failed: ${guardErr.message}`)
      failed++
      continue
    }
    if (existing) {
      console.log(`[${spId}] SKIP — already has project_report (row ${existing.id})`)
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`[${spId}] WOULD GENERATE — sale=$${row.sale_amount}`)
      generated++
      continue
    }

    try {
      const sp = rowToSentProject(row)
      const input = resolveProjectReport({ sp, showMargin: false })
      const { bytes } = await generateProjectReportPdf(input)

      const buf = new Uint8Array(bytes.byteLength)
      buf.set(bytes)
      const blob = new Blob([buf], { type: 'application/pdf' })

      const docId = crypto.randomUUID()
      const storagePath = `${sp.homeowner_id}/${sp.id}/project_report/${docId}.pdf`

      const uploadRes = await supabase.storage.from(BUCKET).upload(storagePath, blob, {
        contentType: 'application/pdf',
        upsert: false,
      })
      if (uploadRes.error) {
        console.error(`[${spId}] storage upload failed: ${uploadRes.error.message}`)
        failed++
        continue
      }

      const stamp = new Date().toISOString().slice(0, 10)
      const filename = `project-report-${sp.id.slice(0, 8)}-${stamp}.pdf`

      const vendorId = sp.vendor_id ?? sp.contractor?.vendor_id ?? null
      const address = sp.item?.address?.full ?? sp.homeowner?.address ?? null

      const { data: inserted, error: insertErr } = await supabase
        .from('homeowner_documents')
        .insert({
          id: docId,
          homeowner_id: sp.homeowner_id,
          category: 'other',
          filename,
          storage_path: storagePath,
          project_id: null,
          sent_project_id: sp.id,
          doc_type: 'project_report',
          address,
          uploaded_by: 'system',
          vendor_id: vendorId,
          size_bytes: blob.size,
          mime_type: 'application/pdf',
        })
        .select('id')
        .single()

      if (insertErr || !inserted) {
        console.error(`[${spId}] insert row failed: ${insertErr?.message}`)
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
        failed++
        continue
      }

      console.log(`[${spId}] OK — row ${inserted.id} path ${storagePath}`)
      generated++
    } catch (err) {
      console.error(`[${spId}] threw:`, err)
      failed++
    }
  }

  console.log('── SUMMARY ──')
  console.log({
    targeted: eligible.length,
    [DRY_RUN ? 'would_generate' : 'generated']: generated,
    skipped_existing: skipped,
    failed,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
