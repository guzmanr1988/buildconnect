import { useQuery } from '@tanstack/react-query'
import { getActiveAdapter } from '@/lib/financing/adapters'
import { getFinancingApplicationByProject } from '@/lib/api/financing'
import { isFinancingEnabled } from '@/lib/financing/feature-flag'
import type { ApprovalStatusResult } from '@/lib/financing/adapters/_contract'

// Reads a financing application's current status via the active adapter.
// Shared hook for both customer-side (helios surfaces) and vendor-side
// (lead-workflow detail) — the adapter abstracts whether status comes
// from a partner API poll or a Supabase row read.
export function useFinancingApplication(bcApplicationId: string | null | undefined) {
  return useQuery<ApprovalStatusResult | null>({
    queryKey: ['financing-application', bcApplicationId],
    enabled: isFinancingEnabled() && !!bcApplicationId,
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
export function useFinancingApplicationByProject(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['financing-application-by-project', projectId],
    enabled: isFinancingEnabled() && !!projectId,
    queryFn: async () => {
      if (!projectId) return null
      return getFinancingApplicationByProject(projectId)
    },
  })
}
