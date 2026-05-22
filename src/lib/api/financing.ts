import { supabase } from '@/lib/supabase'
import type { FinancingApplicationStatus } from '@/lib/financing/adapters/_contract'

// Row shapes mirror migration 047 financing_core_tables.sql exactly. All
// money fields are *_cents integer per the hermes/hephaestus coord-lock —
// no floating-point money. Display formatting happens at the consumer.

export interface FinancingApplicationRow {
  id: string
  homeowner_id: string
  lead_id: string | null
  project_id: string | null
  adapter: string
  adapter_application_id: string | null
  status: FinancingApplicationStatus
  ttl_days: number
  applied_at: string
  created_at: string
  updated_at: string
}

export interface FinancingApprovalRow {
  id: string
  financing_application_id: string
  status: 'approved' | 'denied'
  envelope_amount_cents: number | null
  dp_amount_cents: number | null
  term_months: number | null
  apr_bps: number | null
  expires_at: string | null
  letter_url: string | null
  denial_reason_code: string | null
  denial_reason_text: string | null
  created_at: string
}

export interface CustomerFinancingProfileRow {
  id: string
  customer_id: string
  has_financing: boolean
  last_known_status: FinancingApplicationStatus | null
  last_known_amount_cents: number | null
  source: 'self_attest' | 'adapter'
  approval_partner: string | null
  approval_expires_at: string | null
  created_at: string
  updated_at: string
}

export type DrawRequestStatus =
  | 'sms_pending'
  | 'approved'
  | 'disputed'
  | 'paid'
  | 'cancelled'
  | 'expired'

export interface DrawRequestRow {
  id: string
  financing_application_id: string
  sent_project_id: string
  vendor_id: string
  homeowner_id: string
  amount_cents: number
  commission_cents: number
  vendor_payout_cents: number
  status: DrawRequestStatus
  sms_token: string | null
  sms_sent_at: string | null
  sms_approved_at: string | null
  dispute_window_ends_at: string | null
  paid_at: string | null
  idempotency_key: string | null
  created_at: string
  updated_at: string
}

export interface CommissionLedgerRow {
  id: string
  financing_application_id: string
  sent_project_id: string | null
  milestone_id: string | null
  vendor_id: string | null
  state: 'reserved' | 'receivable' | 'realized' | 'frozen'
  envelope_amount_cents: number
  vendor_commission_pct: number
  reserved_commission_amount_cents: number
  final_commission_amount_cents: number | null
  net_to_vendor_cents: number | null
  created_at: string
}

export async function getFinancingApplicationById(id: string): Promise<FinancingApplicationRow | null> {
  const { data, error } = await supabase
    .from('financing_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as FinancingApplicationRow | null
}

export async function getFinancingApplicationByProject(projectId: string): Promise<FinancingApplicationRow | null> {
  const { data, error } = await supabase
    .from('financing_applications')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as FinancingApplicationRow | null
}

export async function getFinancingApprovalByApplicationId(applicationId: string): Promise<FinancingApprovalRow | null> {
  const { data, error } = await supabase
    .from('financing_approvals')
    .select('*')
    .eq('financing_application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as FinancingApprovalRow | null
}

export async function insertFinancingApplication(input: {
  id: string
  homeowner_id: string
  lead_id?: string | null
  project_id?: string | null
  adapter: string
  adapter_application_id?: string | null
}): Promise<FinancingApplicationRow> {
  const { data, error } = await supabase
    .from('financing_applications')
    .insert({
      id: input.id,
      homeowner_id: input.homeowner_id,
      lead_id: input.lead_id ?? null,
      project_id: input.project_id ?? null,
      adapter: input.adapter,
      adapter_application_id: input.adapter_application_id ?? null,
      status: 'applied',
    })
    .select()
    .single()
  if (error) throw error
  return data as FinancingApplicationRow
}

export async function listDrawRequestsBySentProject(sentProjectId: string): Promise<DrawRequestRow[]> {
  const { data, error } = await supabase
    .from('draw_requests')
    .select('*')
    .eq('sent_project_id', sentProjectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DrawRequestRow[]
}

export async function listDrawRequestsForHomeowner(homeownerId: string, status?: DrawRequestStatus): Promise<DrawRequestRow[]> {
  let q = supabase
    .from('draw_requests')
    .select('*')
    .eq('homeowner_id', homeownerId)
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DrawRequestRow[]
}

export async function getDrawRequestById(id: string): Promise<DrawRequestRow | null> {
  const { data, error } = await supabase
    .from('draw_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as DrawRequestRow | null
}

export interface DrawRequestCreateResponse {
  draw_request_id: string
  commission_cents: number
  vendor_payout_cents: number
  envelope_remaining_after_cents: number
  status: 'sms_pending'
  sms_status: 'stub_dispatched' | 'dispatched'
}

export interface DrawRequestApproveResponse {
  status: 'approved' | 'disputed'
  dispute_window_ends_at: string | null
}

export async function invokeDrawRequestCreate(input: {
  sent_project_id: string
  amount_cents: number
  idempotency_key: string
}): Promise<DrawRequestCreateResponse> {
  const { data, error } = await supabase.functions.invoke('draw-request-create', { body: input })
  if (error) {
    const ctx = (error as { context?: { error?: string; message?: string } }).context
    const code = ctx?.error ?? (error.message as string | undefined) ?? 'draw_request_create_failed'
    throw new Error(code)
  }
  return data as DrawRequestCreateResponse
}

export async function invokeDrawRequestApprove(input: {
  draw_request_id: string
  sms_token: string
  decision: 'approve' | 'dispute'
}): Promise<DrawRequestApproveResponse> {
  const { data, error } = await supabase.functions.invoke('draw-request-approve', { body: input })
  if (error) {
    const ctx = (error as { context?: { error?: string; message?: string } }).context
    const code = ctx?.error ?? (error.message as string | undefined) ?? 'draw_request_approve_failed'
    throw new Error(code)
  }
  return data as DrawRequestApproveResponse
}

export interface AdminFinancingStats {
  applicationsByStatus: Record<FinancingApplicationStatus, number>
  ledgerByState: Record<'reserved' | 'receivable' | 'realized' | 'frozen', { count: number; total_cents: number }>
  totalReservedCents: number
  totalReceivableCents: number
  totalRealizedCents: number
}

export async function getAdminFinancingStats(): Promise<AdminFinancingStats> {
  const [appsRes, ledgerRes] = await Promise.all([
    supabase.from('financing_applications').select('status'),
    supabase.from('commission_ledger').select('state, reserved_commission_amount_cents, final_commission_amount_cents'),
  ])
  if (appsRes.error) throw appsRes.error
  if (ledgerRes.error) throw ledgerRes.error

  const apps = (appsRes.data ?? []) as Array<{ status: FinancingApplicationStatus }>
  const applicationsByStatus: Record<FinancingApplicationStatus, number> = {
    pending: 0,
    applied: 0,
    approved: 0,
    denied: 0,
    expired: 0,
    terms_accepted: 0,
    cancelled: 0,
  }
  for (const row of apps) applicationsByStatus[row.status] = (applicationsByStatus[row.status] ?? 0) + 1

  const ledger = (ledgerRes.data ?? []) as Array<{
    state: 'reserved' | 'receivable' | 'realized' | 'frozen'
    reserved_commission_amount_cents: number
    final_commission_amount_cents: number | null
  }>
  const ledgerByState: AdminFinancingStats['ledgerByState'] = {
    reserved: { count: 0, total_cents: 0 },
    receivable: { count: 0, total_cents: 0 },
    realized: { count: 0, total_cents: 0 },
    frozen: { count: 0, total_cents: 0 },
  }
  for (const row of ledger) {
    const bucket = ledgerByState[row.state]
    if (!bucket) continue
    bucket.count += 1
    const amount = row.state === 'realized' && row.final_commission_amount_cents != null
      ? row.final_commission_amount_cents
      : row.reserved_commission_amount_cents
    bucket.total_cents += amount
  }

  return {
    applicationsByStatus,
    ledgerByState,
    totalReservedCents: ledgerByState.reserved.total_cents,
    totalReceivableCents: ledgerByState.receivable.total_cents,
    totalRealizedCents: ledgerByState.realized.total_cents,
  }
}
