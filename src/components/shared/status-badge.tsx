import { cn } from '@/lib/utils'
import { LEAD_STATUS_CONFIG } from '@/lib/constants'
import type { LeadStatus } from '@/types'

interface StatusBadgeProps {
  status: LeadStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = LEAD_STATUS_CONFIG[status]
  if (!config) return null

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', config.color, className)}>
      <span>{config.icon}</span>
      {config.label}
    </span>
  )
}
