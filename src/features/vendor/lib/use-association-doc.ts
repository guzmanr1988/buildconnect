import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Migration 066 / task_066 — vendor-side selector for "is the
// association_permit doc on file for this sent_project_id?". Drives the
// Start-Work gate + status pill in lead-workflow.tsx Sold/Active branch.
// Reads homeowner_documents directly (vendor RLS leg added in migration
// 065 grants SELECT on rows tied to assigned sent_projects).
//
// Self-contained fetch + state — vendor side doesn't share a docs store
// with the homeowner side, and the existing VendorProjectDocumentsPanel
// owns its own per-mount state. This hook stays slim: one row probe per
// sent_project_id, no global cache, refetch() exposed for post-upload /
// post-nudge invalidation.

interface AssociationDocState {
  loading: boolean
  docId: string | null
  filename: string | null
  storagePath: string | null
  createdAt: string | null
  refetch: () => Promise<void>
}

export function useAssociationDocForProject(
  sentProjectId: string | null,
): AssociationDocState {
  const [docId, setDocId] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchDoc = useCallback(async () => {
    if (!sentProjectId) {
      setDocId(null)
      setFilename(null)
      setStoragePath(null)
      setCreatedAt(null)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('homeowner_documents')
        .select('id, filename, storage_path, created_at')
        .eq('sent_project_id', sentProjectId)
        .eq('doc_type', 'association_permit')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('[association-doc] fetch failed:', error.message)
        }
        setDocId(null)
        setFilename(null)
        setStoragePath(null)
        setCreatedAt(null)
        return
      }
      setDocId(data?.id ?? null)
      setFilename(data?.filename ?? null)
      setStoragePath(data?.storage_path ?? null)
      setCreatedAt(data?.created_at ?? null)
    } finally {
      setLoading(false)
    }
  }, [sentProjectId])

  useEffect(() => {
    void fetchDoc()
  }, [fetchDoc])

  return { loading, docId, filename, storagePath, createdAt, refetch: fetchDoc }
}
