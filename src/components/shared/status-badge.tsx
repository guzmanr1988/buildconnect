import { cn } from '@/lib/utils'
import { LEAD_STATUS_CONFIG } from '@/lib/constants'
import type { LeadStatus } from '@/types'

interface StatusBadgeProps {
  status: LeadStatus
  className?: string
  // Optional label override — lets a caller render the same visual shape
  // (color + icon) with role-specific vocabulary. Homeowner appointment-
  // status overrides 'confirmed' to "Scheduled - Pending Approval"; vendor
  // side keeps the shared "Scheduled" label.
  label?: string
}

export function StatusBadge({ status, className, label }: StatusBadgeProps) {
  const config = LEAD_STATUS_CONFIG[status]
  if (!config) return null

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', config.color, className)}>
      <span>{config.icon}</span>
      {label ?? config.label}
    </span>
  )
}
