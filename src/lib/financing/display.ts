import type { FinancingApplicationStatus } from './adapters/_contract'

export const ADAPTER_DISPLAY_NAMES: Record<string, string> = {
  manual_referral: 'BuildConnect referral (manual)',
  admin_manual: 'BuildConnect (manual)',
  goodleap: 'GoodLeap',
  momnt: 'Momnt',
  upgrade: 'Upgrade',
}

export function adapterDisplayName(key: string): string {
  return ADAPTER_DISPLAY_NAMES[key] ?? key
}

export const STATUS_LABEL: Record<FinancingApplicationStatus, string> = {
  pending: 'Pending',
  applied: 'Submitted',
  approved: 'Approved',
  denied: 'Denied',
  expired: 'Expired',
  terms_accepted: 'Terms accepted',
  cancelled: 'Cancelled',
}

export const STATUS_TONE: Record<FinancingApplicationStatus, 'neutral' | 'progress' | 'success' | 'warning' | 'destructive'> = {
  pending: 'neutral',
  applied: 'progress',
  approved: 'success',
  terms_accepted: 'success',
  denied: 'destructive',
  expired: 'warning',
  cancelled: 'neutral',
}

export function statusLabel(status: FinancingApplicationStatus): string {
  return STATUS_LABEL[status] ?? status
}

export function statusTone(status: FinancingApplicationStatus): 'neutral' | 'progress' | 'success' | 'warning' | 'destructive' {
  return STATUS_TONE[status] ?? 'neutral'
}
