// Mark-as-Sold project-report trigger (kratos msg 1781648279904-kratos-ymse1).
//
// Generates the customer-facing project report PDF (showMargin=false — the
// only copy ever stored on homeowner_documents; Rod's margin view is
// regenerated on demand from sp data at view time, never persisted) and
// uploads it as a homeowner_documents row with doc_type=project_report.
//
// Idempotent guard: queries homeowner_documents for an existing
// project_report row scoped to sp.id. If present, returns silently — re-
// Mark-as-Sold (e.g. after undo + re-mark or contract revision) must
// never duplicate the doc. Query source-of-truth (DB) rather than the
// zustand store cache, which may be stale at trigger-fire time.
//
// Fire-and-forget from the caller — errors are logged but never block
// the sale flow (never-block rule from homeowner-documents-store).

import { supabase } from '@/lib/supabase'
import { resolveProjectReport } from './project-report-data'
import { generateProjectReportPdf } from './generate-project-report-pdf'
import { useHomeownerDocsStore } from '@/stores/homeowner-documents-store'
import type { SentProject } from '@/types'

export async function maybeGenerateProjectReportOnSold(sp: SentProject): Promise<void> {
  if (!sp.homeowner_id || sp.status !== 'sold' || !sp.saleAmount) {
    return
  }

  try {
    const { data: existing, error: guardErr } = await supabase
      .from('homeowner_documents')
      .select('id')
      .eq('sent_project_id', sp.id)
      .eq('doc_type', 'project_report')
      .limit(1)
      .maybeSingle()
    if (guardErr) {
      console.error('[project-report-on-sold] idempotent guard failed:', guardErr.message)
      return
    }
    if (existing) return
  } catch (err) {
    console.error('[project-report-on-sold] idempotent guard threw:', err)
    return
  }

  try {
    const input = resolveProjectReport({ sp, showMargin: false })
    const { bytes } = await generateProjectReportPdf(input)
    const blob = new Blob([bytes], { type: 'application/pdf' })

    const stamp = new Date().toISOString().slice(0, 10)
    const filename = `project-report-${sp.id.slice(0, 8)}-${stamp}.pdf`

    const vendorId = sp.vendor_id ?? sp.contractor?.vendor_id ?? null
    const address = sp.item?.address?.full ?? sp.homeowner?.address ?? null

    await useHomeownerDocsStore.getState().addDoc({
      homeownerId: sp.homeowner_id,
      category: 'other',
      filename,
      blob,
      sentProjectId: sp.id,
      docType: 'project_report',
      uploadedBy: 'system',
      vendorId,
      vendorCompany: sp.contractor?.company,
      serviceName: sp.item?.serviceName,
      address,
    })
  } catch (err) {
    console.error('[project-report-on-sold] generation/upload failed:', err)
  }
}
