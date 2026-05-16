import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { getFinancingApprovalByApplicationId } from '@/lib/api/financing'
import { isFinancingEnabled } from '@/lib/financing/feature-flag'
import {
  useFinancingApplication,
  useFinancingApplicationByProject,
} from '@/lib/financing/hooks/use-financing-application'

function formatCentsAsUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  applied: 'Applied',
  approved: 'Approved',
  denied: 'Denied',
  expired: 'Expired',
  terms_accepted: 'Terms Accepted',
  cancelled: 'Cancelled',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  applied: 'secondary',
  approved: 'default',
  denied: 'destructive',
  expired: 'outline',
  terms_accepted: 'default',
  cancelled: 'outline',
}

interface ProjectScopedProps {
  projectId: string | null | undefined
  fallback?: React.ReactNode
}

// Vendor-scoped badge: looks up financing_application by project_id (vendor
// RLS allows SELECT on rows where vendor_id matches AND status in
// (approved, terms_accepted) per migration 047). When no row visible OR
// flag off, renders the fallback (preserves pre-Phase-2 'Requested/Not
// needed' badge UX).
export function ProjectFinancingBadge({ projectId, fallback }: ProjectScopedProps) {
  const { data: app } = useFinancingApplicationByProject(projectId)
  const { data: approval } = useQuery({
    queryKey: ['financing-approval', app?.id],
    enabled: isFinancingEnabled() && !!app?.id,
    queryFn: () => (app?.id ? getFinancingApprovalByApplicationId(app.id) : null),
  })

  if (!isFinancingEnabled() || !app) return <>{fallback ?? null}</>

  const amountSuffix = approval?.envelope_amount_cents != null
    ? ` ${formatCentsAsUsd(approval.envelope_amount_cents)}`
    : ''

  return (
    <Badge variant={STATUS_VARIANT[app.status] ?? 'secondary'} className="text-xs">
      Financing: {STATUS_LABEL[app.status] ?? app.status}{amountSuffix}
    </Badge>
  )
}

interface ApplicationScopedProps {
  bcApplicationId: string | null | undefined
}

// Customer-scoped badge: looks up by bcApplicationId via the active
// adapter. Used by helios's /financing/status/:id and home page card.
export function ApplicationFinancingBadge({ bcApplicationId }: ApplicationScopedProps) {
  const { data } = useFinancingApplication(bcApplicationId)

  if (!isFinancingEnabled() || !data) return null

  const amountSuffix = data.approvedAmountCents != null
    ? ` ${formatCentsAsUsd(data.approvedAmountCents)}`
    : ''

  return (
    <Badge variant={STATUS_VARIANT[data.status] ?? 'secondary'} className="text-xs">
      Financing: {STATUS_LABEL[data.status] ?? data.status}{amountSuffix}
    </Badge>
  )
}
