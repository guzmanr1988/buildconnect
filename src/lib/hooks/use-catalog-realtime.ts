import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Subscribe to Supabase Realtime for the 5 catalog tables. Whenever an admin
 * edits a service / option_group / option / sub_group / sub_option, every
 * mounted listener (vendor catalog + other admin tabs) refetches its store.
 *
 * Substrate (hephaestus 2026-05-24): the 5 tables were added to the
 * supabase_realtime publication with REPLICA IDENTITY = default(pk), so the
 * WAL payload carries only the PK + changed columns. We don't try to apply
 * deltas — we just refetch on any change. The catalog is low-write enough
 * that the refetch cost is negligible.
 */
const CATALOG_TABLES = [
  'services',
  'option_groups',
  'options',
  'sub_groups',
  'sub_options',
] as const

export function useCatalogRealtime(refetchCatalog: () => void) {
  useEffect(() => {
    const channel = supabase.channel('catalog-changes')
    for (const table of CATALOG_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => refetchCatalog()
      )
    }
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetchCatalog])
}
