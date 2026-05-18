import { useQuery } from '@tanstack/react-query'
import { getActiveAdapter } from '@/lib/financing/adapters'
import { getFinancingApplicationByProject } from '@/lib/api/financing'
import type { ApprovalStatusResult } from '@/lib/financing/adapters/_contract'

// Reads a financing application's current status via the active adapter.
// Shared hook for both customer-side (helios surfaces) and vendor-side
// (lead-workflow detail) — the adapter abstracts whether status comes
// from a partner API poll or a Supabase row read.
//
// Flag-gating is pass-through: caller supplies the resolved boolean from
// their own useFeatureFlag / useFeatureFlagOnce call. Entry-class callers
// (badges) pass useFeatureFlag so the query re-runs on flag-flip; in-flight
// callers pass useFeatureFlagOnce so the query is locked at mount.
export function useFinancingApplication(
  bcApplicationId: string | null | undefined,
  financingEnabled: boolean | undefined,
) {
  return useQuery<ApprovalStatusResult | null>({
    queryKey: ['financing-application', bcApplicationId],
    enabled: financingEnabled === true && !!bcApplicationId,
    queryFn: async () => {
      if (!bcApplicationId) return null
      const adapter = getActiveAdapter()
      return adapter.getApprovalStatus({ partnerApplicationId: bcApplicationId })
    },
  })
}

// Vendor-side lookup: vendor sees their assigned project, not the
// homeowner's bcApplicationId. Vendor RLS allows SELECT on
// financing_applications where vendor_id matches AND status in
// (approved, terms_accepted) — pre-approval rows are invisible to vendor
// per project_buildconnect_vendor_compensation_private.
export function useFinancingApplicationByProject(
  projectId: string | null | undefined,
  financingEnabled: boolean | undefined,
) {
  return useQuery({
    queryKey: ['financing-application-by-project', projectId],
    enabled: financingEnabled === true && !!projectId,
    queryFn: async () => {
      if (!projectId) return null
      return getFinancingApplicationByProject(projectId)
    },
  })
}
