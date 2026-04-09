import { supabase } from '@/lib/supabase'
import type { Transaction, AppSettings, Bug } from '@/types'

export async function getTransactions() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return data as Transaction[]
}

export async function getSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .single()
  if (error) throw error
  return data as AppSettings
}

export async function updateSettings(updates: Partial<AppSettings>) {
  const { data, error } = await supabase
    .from('app_settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single()
  if (error) throw error
  return data as AppSettings
}

export async function getBugs() {
  const { data, error } = await supabase
    .from('bugs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Bug[]
}

export async function createBug(bug: Omit<Bug, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('bugs')
    .insert(bug)
    .select()
    .single()
  if (error) throw error
  return data as Bug
}

export async function updateBugStatus(id: string, status: Bug['status']) {
  const { data, error } = await supabase
    .from('bugs')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Bug
}
