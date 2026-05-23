import { supabase } from '@/lib/supabase'
import type {
  HomeownerDoc,
  HomeownerDocCategory,
  HomeownerDocType,
  HomeownerDocUploadedBy,
} from '@/stores/homeowner-documents-store'

// PR-331 — direct-DB helpers for the unified homeowner_documents table.
// Vendor-side surfaces (src/features/vendor/pages/homeowner-detail.tsx)
// write through here instead of the deprecated vendor-homeowner-documents
// zustand store; reads pivot to the same table filtered by vendor_id +
// homeowner_id resolved via the sent_project the upload is scoped to.

const BUCKET = 'homeowner-documents'

interface DbRow {
  id: string
  homeowner_id: string
  category: HomeownerDocCategory
  filename: string
  storage_path: string
  project_id: string | null
  sent_project_id: string | null
  doc_type: HomeownerDocType | null
  address: string | null
  uploaded_by: HomeownerDocUploadedBy
  vendor_id: string | null
  size_bytes: number | null
  mime_type: string | null
  created_at: string
}

function rowToDoc(row: DbRow): HomeownerDoc {
  return {
    id: row.id,
    homeownerId: row.homeowner_id,
    category: row.category,
    filename: row.filename,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    project_id: row.project_id,
    sentProjectId: row.sent_project_id,
    docType: row.doc_type,
    address: row.address,
    uploadedBy: row.uploaded_by,
    vendorId: row.vendor_id,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
  }
}

export interface VendorUploadInput {
  vendorId: string
  homeownerId: string
  sentProjectId: string | null
  docType: HomeownerDocType
  file: File
}

export async function uploadDocAsVendor(input: VendorUploadInput): Promise<HomeownerDoc | null> {
  const docId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const mimeType = input.file.type || 'application/pdf'
  const ext =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/jpeg' || mimeType === 'image/jpg'
        ? 'jpg'
        : 'pdf'
  const sentProjectSeg = input.sentProjectId ?? 'root'
  const docTypeSeg = input.docType
  const storagePath = `${input.homeownerId}/${sentProjectSeg}/${docTypeSeg}/${docId}.${ext}`

  const uploadRes = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.file, {
      contentType: mimeType,
      upsert: false,
    })
  if (uploadRes.error) {
    console.error('[homeowner-docs/vendor] storage upload failed:', uploadRes.error.message)
    return null
  }

  const { data, error } = await supabase
    .from('homeowner_documents')
    .insert({
      id: docId,
      homeowner_id: input.homeownerId,
      category: 'other',
      filename: input.file.name,
      storage_path: storagePath,
      sent_project_id: input.sentProjectId,
      doc_type: input.docType,
      uploaded_by: 'vendor',
      vendor_id: input.vendorId,
      size_bytes: input.file.size,
      mime_type: mimeType,
    })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[homeowner-docs/vendor] insert row failed:', error?.message)
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
    return null
  }
  return rowToDoc(data as DbRow)
}

export async function listDocsForVendorHomeowner(params: {
  vendorId: string
  homeownerId: string
}): Promise<HomeownerDoc[]> {
  // Vendor RLS (per hermes substrate): SELECT permitted when
  //   vendor_id = auth.uid() (vendor uploaded the row themselves)
  //   OR
  //   sent_project_id IN (SELECT id FROM sent_projects WHERE vendor_id = auth.uid())
  // The PostgREST query below filters to the specific homeowner; the row-
  // level visibility is enforced by RLS, so we don't OR-construct here.
  const { data, error } = await supabase
    .from('homeowner_documents')
    .select('*')
    .eq('homeowner_id', params.homeownerId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[homeowner-docs/vendor] list failed:', error.message)
    return []
  }
  return (data ?? []).map((r) => rowToDoc(r as DbRow))
}

export async function deleteDoc(id: string, storagePath: string): Promise<boolean> {
  try {
    await supabase.storage.from(BUCKET).remove([storagePath])
  } catch (err) {
    console.error('[homeowner-docs] storage remove failed:', err)
  }
  const { error } = await supabase.from('homeowner_documents').delete().eq('id', id)
  if (error) {
    console.error('[homeowner-docs] row delete failed:', error.message)
    return false
  }
  return true
}

export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 5)
  if (error || !data) {
    console.error('[homeowner-docs] signed URL failed:', error?.message)
    return null
  }
  return data.signedUrl
}
