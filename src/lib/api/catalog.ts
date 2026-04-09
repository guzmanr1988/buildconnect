import { supabase } from '@/lib/supabase'
import type { CatalogItem } from '@/types'

export async function getCatalog(vendorId: string) {
  const { data, error } = await supabase
    .from('vendor_catalog_items')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('category')
    .order('name')
  if (error) throw error
  return data as CatalogItem[]
}

export async function addCatalogItem(item: Omit<CatalogItem, 'id'>) {
  const { data, error } = await supabase
    .from('vendor_catalog_items')
    .insert(item)
    .select()
    .single()
  if (error) throw error
  return data as CatalogItem
}

export async function updateCatalogItem(id: string, updates: Partial<CatalogItem>) {
  const { data, error } = await supabase
    .from('vendor_catalog_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as CatalogItem
}

export async function toggleCatalogItem(id: string, active: boolean) {
  return updateCatalogItem(id, { active })
}
