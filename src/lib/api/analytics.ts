import { supabase } from '@/lib/supabase'
import type { Lead, ClosedSale, Transaction } from '@/types'

/*
 * Admin analytics API — Phase 5.
 *
 * Fetches aggregatable rows (leads, closed_sales, transactions) from
 * Supabase so admin dashboards can compute GMV, commission, pipeline
 * value, revenue-by-category, etc. against real data instead of the
 * MOCK_* arrays.
 *
 * Shape-compatible with the existing mock types — pages swap
 * `const leads = MOCK_LEADS` for `const leads = useAnalyticsLeads()`
 * with minimal downstream refactor. Aggregations stay client-side
 * (sum/filter/reduce) to keep the server-side surface simple and
 * matched to the mock-as-test-harness design.
 *
 * Seed data lives in scripts/seed-phase5-analytics.mjs and matches the
 * MOCK_LEADS / MOCK_CLOSED_SALES shape, so aggregated totals look
 * realistic pre-launch.
 */

/* ---------------------------------------------------------------- */
/* DB-row reshape helpers                                            */
/* ---------------------------------------------------------------- */

type DbLead = {
  id: string
  homeowner_id: string
  vendor_id: string
  project: string
  value: number | string
  status: Lead['status']
  slot: string | null
  permit_choice: boolean
  service_category: Lead['service_category']
  pack_items: Record<string, string[]>
  sq_ft: number
  financing: boolean
  address: string
  phone: string
  email: string
  homeowner_name: string
  received_at: string
}

type DbClosedSale = {
  id: string
  lead_id: string
  vendor_id: string
  homeowner_id: string
  sale_amount: number | string
  vendor_share: number | string
  commission: number | string
  commission_paid: boolean
  commission_paid_at: string | null
  closed_at: string
  homeowner_name: string
  project: string
}

type DbTransaction = {
  id: string
  type: Transaction['type']
  vendor_id: string
  company: string
  detail: string
  customer: string | null
  amount: number | string
  date: string
  status: Transaction['status']
}

const n = (v: number | string): number => (typeof v === 'number' ? v : parseFloat(v))

function leadFromRow(r: DbLead): Lead {
  return {
    id: r.id,
    homeowner_id: r.homeowner_id,
    vendor_id: r.vendor_id,
    project: r.project,
    value: n(r.value),
    status: r.status,
    slot: r.slot ?? '',
    permit_choice: r.permit_choice,
    service_category: r.service_category,
    pack_items: r.pack_items || {},
    sq_ft: r.sq_ft,
    financing: r.financing,
    address: r.address,
    phone: r.phone,
    email: r.email,
    homeowner_name: r.homeowner_name,
    received_at: r.received_at,
  }
}

function closedSaleFromRow(r: DbClosedSale): ClosedSale {
  return {
    id: r.id,
    lead_id: r.lead_id,
    vendor_id: r.vendor_id,
    homeowner_id: r.homeowner_id,
    sale_amount: n(r.sale_amount),
    vendor_share: n(r.vendor_share),
    commission: n(r.commission),
    commission_paid: r.commission_paid,
    commission_paid_at: r.commission_paid_at ?? undefined,
    closed_at: r.closed_at,
    homeowner_name: r.homeowner_name,
    project: r.project,
  }
}

function transactionFromRow(r: DbTransaction): Transaction {
  return {
    id: r.id,
    type: r.type,
    vendor_id: r.vendor_id,
    company: r.company,
    detail: r.detail,
    ...(r.customer ? { customer: r.customer } : {}),
    amount: n(r.amount),
    date: r.date,
    status: r.status,
  }
}

/* ---------------------------------------------------------------- */
/* Fetch functions                                                  */
/* ---------------------------------------------------------------- */

export async function fetchAllLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('received_at', { ascending: false })
  if (error) throw new Error(`fetchAllLeads: ${error.message}`)
  return (data ?? []).map(leadFromRow)
}

export async function fetchAllClosedSales(): Promise<ClosedSale[]> {
  const { data, error } = await supabase
    .from('closed_sales')
    .select('*')
    .order('closed_at', { ascending: false })
  if (error) throw new Error(`fetchAllClosedSales: ${error.message}`)
  return (data ?? []).map(closedSaleFromRow)
}

export async function fetchAllTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw new Error(`fetchAllTransactions: ${error.message}`)
  return (data ?? []).map(transactionFromRow)
}
