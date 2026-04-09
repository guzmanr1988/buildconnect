import { supabase } from '@/lib/supabase'
import type { Lead, LeadStatus } from '@/types'

export async function getLeads(role: 'homeowner' | 'vendor', userId: string) {
  const column = role === 'homeowner' ? 'homeowner_id' : 'vendor_id'
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq(column, userId)
    .order('received_at', { ascending: false })
  if (error) throw error
  return data as Lead[]
}

export async function getLead(id: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Lead
}

export async function createLead(lead: Omit<Lead, 'id' | 'received_at'>) {
  const { data, error } = await supabase
    .from('leads')
    .insert(lead)
    .select()
    .single()
  if (error) throw error
  return data as Lead
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  const { data, error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Lead
}

export async function rescheduleLead(id: string, newSlot: string) {
  const { data, error } = await supabase
    .from('leads')
    .update({ status: 'rescheduled' as LeadStatus, slot: newSlot })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Lead
}
