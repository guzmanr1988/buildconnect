import { supabase } from '@/lib/supabase'
import type { ClosedSale } from '@/types'

export async function getSales(vendorId?: string) {
  let query = supabase.from('closed_sales').select('*').order('closed_at', { ascending: false })
  if (vendorId) query = query.eq('vendor_id', vendorId)
  const { data, error } = await query
  if (error) throw error
  return data as ClosedSale[]
}

export async function createSale(leadId: string, saleAmount: number) {
  const { data, error } = await supabase.rpc('close_lead_sale', {
    p_lead_id: leadId,
    p_sale_amount: saleAmount,
  })
  if (error) throw error
  return data as string
}

export async function markCommissionPaid(saleId: string) {
  const { data, error } = await supabase
    .from('closed_sales')
    .update({ commission_paid: true })
    .eq('id', saleId)
    .select()
    .single()
  if (error) throw error
  return data as ClosedSale
}

export async function getDueCommissions(vendorId: string) {
  const { data, error } = await supabase
    .from('closed_sales')
    .select('*')
    .eq('vendor_id', vendorId)
    .eq('commission_paid', false)
  if (error) throw error
  return data as ClosedSale[]
}
