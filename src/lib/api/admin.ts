import { supabase } from '@/lib/supabase'
import type { Transaction, AppSettings, Bug, Profile, BankAccount } from '@/types'

export async function getHomeowners() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'homeowner')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Profile[]
}

export async function getAllBankAccounts() {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .order('linked_at', { ascending: false })
  if (error) throw error
  return data as BankAccount[]
}

export async function getTransactions() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return data as Transaction[]
}

const APP_SETTINGS_PUBLIC_COLS =
  'id, maintenance_mode, ar_mode, phase2_enabled, financing_enabled, updated_at'

export async function getSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select(APP_SETTINGS_PUBLIC_COLS)
    .single()
  if (error) throw error
  return data as AppSettings
}

export async function updateSettings(updates: Partial<AppSettings>) {
  const { data, error } = await supabase
    .from('app_settings')
    .update(updates)
    .eq('id', 1)
    .select(APP_SETTINGS_PUBLIC_COLS)
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
