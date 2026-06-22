import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

// Supabase-backed homeowner document store (PR-242). Replaces the in-memory
// zustand shape from PR #194 that dropped LS-persist due to 5MB quota — now
// docs live in public.homeowner_documents (row) + homeowner-documents bucket
// (Storage blob). Reload reads from Supabase; no LS quota concern.
//
// Folder convention: {homeowner_id}/{doc_id}.pdf — first segment MUST be
// auth.uid()::text or RLS denies (storage.foldername gates by first part).
//
// addDoc accepts a Blob (auto-save path passes Uint8Array→Blob; legacy
// project-submission path converts its base64 dataURL to a Blob inline).
// Returns the inserted HomeownerDoc on success or null on failure (silent
// fail keeps the surrounding flow non-blocking per never-block rule).

export type HomeownerDocCategory = 'project-submission' | 'roof-measurement' | 'other'
export type HomeownerDocUploadedBy = 'system' | 'homeowner' | 'vendor'
// PR-331 — user-facing classification, orthogonal to system-lane `category`.
// NULL on legacy rows pre-backfill; new uploads MUST set explicitly.
export type HomeownerDocType =
  | 'license'
  | 'permit'
  | 'association_permit'
  | 'sketch'
  | 'measurement'
  | 'agreement'
  | 'contract'
  | 'project_report'
  | 'quote'
  | 'photo'
  | 'other'

export interface HomeownerDoc {
  id: string
  homeownerId: string
  category: HomeownerDocCategory
  filename: string
  storagePath: string
  createdAt: string
  vendorCompany?: string
  serviceName?: string
  project_id?: string | null
  // PR-331 — explicit FK to sent_projects.id. NULLABLE: vendor-uploaded
  // homeowner-level docs (e.g. driver license copies) carry NULL and render
  // under the "Customer documents" cross-project box on /home/documents.
  sentProjectId?: string | null
  // PR-331 — user-facing doc-type chip on Documents page rows. NULLABLE on
  // legacy rows pre-backfill; new uploads pick one of HomeownerDocType.
  docType?: HomeownerDocType | null
  address?: string | null
  uploadedBy?: HomeownerDocUploadedBy
  vendorId?: string | null
  sizeBytes?: number | null
  mimeType?: string | null
}

interface AddDocInput {
  homeownerId: string
  category: HomeownerDocCategory
  filename: string
  blob: Blob
  vendorCompany?: string
  serviceName?: string
  project_id?: string | null
  sentProjectId?: string | null
  docType?: HomeownerDocType | null
  address?: string | null
  uploadedBy?: HomeownerDocUploadedBy
  vendorId?: string | null
}

interface HomeownerDocsState {
  docs: HomeownerDoc[]
  loading: boolean
  initializedFor: string | null
  loadDocs: (homeownerId: string) => Promise<void>
  addDoc: (input: AddDocInput) => Promise<HomeownerDoc | null>
  removeDoc: (id: string) => Promise<void>
  getDocsForHomeowner: (homeownerId: string) => HomeownerDoc[]
  getSignedUrl: (storagePath: string) => Promise<string | null>
  clear: () => void
}

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

export const useHomeownerDocsStore = create<HomeownerDocsState>()((set, get) => ({
  docs: [],
  loading: false,
  initializedFor: null,

  loadDocs: async (homeownerId) => {
    if (!homeownerId) return
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('homeowner_documents')
        .select('*')
        .eq('homeowner_id', homeownerId)
        .order('created_at', { ascending: false })
      if (error) {
        console.error('[homeowner-docs] loadDocs failed:', error.message)
        set({ loading: false, initializedFor: homeownerId })
        return
      }
      const docs = (data ?? []).map((r) => rowToDoc(r as DbRow))
      set({ docs, loading: false, initializedFor: homeownerId })
    } catch (err) {
      console.error('[homeowner-docs] loadDocs threw:', err)
      set({ loading: false })
    }
  },

  addDoc: async (input) => {
    if (!input.homeownerId) return null
    const docId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const mimeType = input.blob.type || 'application/pdf'
    const ext = mimeType === 'image/png' ? 'png'
      : (mimeType === 'image/jpeg' || mimeType === 'image/jpg') ? 'jpg'
      : 'pdf'
    // PR-331 — storage path discipline matches the 4 storage RLS policies
    // hermes installed: <homeowner_id>/<sent_project_id|root>/<doc_type|other>/<doc_id>.<ext>
    // First segment stays homeowner_id (RLS gate via storage.foldername[1]).
    const sentProjectSeg = input.sentProjectId ?? 'root'
    const docTypeSeg = input.docType ?? 'other'
    const storagePath = `${input.homeownerId}/${sentProjectSeg}/${docTypeSeg}/${docId}.${ext}`

    const uploadRes = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, input.blob, {
        contentType: mimeType,
        upsert: false,
      })
    if (uploadRes.error) {
      console.error('[homeowner-docs] storage upload failed:', uploadRes.error.message)
      return null
    }

    const { data, error } = await supabase
      .from('homeowner_documents')
      .insert({
        id: docId,
        homeowner_id: input.homeownerId,
        category: input.category,
        filename: input.filename,
        storage_path: storagePath,
        project_id: input.project_id ?? null,
        sent_project_id: input.sentProjectId ?? null,
        doc_type: input.docType ?? null,
        address: input.address ?? null,
        uploaded_by: input.uploadedBy ?? 'system',
        vendor_id: input.vendorId ?? null,
        size_bytes: input.blob.size,
        mime_type: mimeType,
      })
      .select('*')
      .single()
    if (error || !data) {
      console.error('[homeowner-docs] insert row failed:', error?.message)
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
      return null
    }
    const doc = rowToDoc(data as DbRow)
    set((s) => ({ docs: [doc, ...s.docs.filter((d) => d.id !== doc.id)] }))
    return doc
  },

  removeDoc: async (id) => {
    const target = get().docs.find((d) => d.id === id)
    set((s) => ({ docs: s.docs.filter((d) => d.id !== id) }))
    if (!target) return
    try {
      await supabase.storage.from(BUCKET).remove([target.storagePath])
    } catch (err) {
      console.error('[homeowner-docs] storage remove failed:', err)
    }
    const { error } = await supabase.from('homeowner_documents').delete().eq('id', id)
    if (error) {
      console.error('[homeowner-docs] row delete failed:', error.message)
    }
  },

  getDocsForHomeowner: (homeownerId) => {
    return get().docs.filter((d) => d.homeownerId === homeownerId)
  },

  getSignedUrl: async (storagePath) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 5)
    if (error || !data) {
      console.error('[homeowner-docs] signed URL failed:', error?.message)
      return null
    }
    return data.signedUrl
  },

  clear: () => set({ docs: [], initializedFor: null }),
}))

// Hydrate on auth-state-change. AuthBootstrap fires SIGNED_IN / TOKEN_REFRESHED
// after Supabase resolves the persisted session — that's the right hook for
// initial load + cross-tab sync. Subscribed once at module-eval; cleanup not
// required because the subscription lives for the app lifetime.
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id
    if (event === 'SIGNED_OUT') {
      useHomeownerDocsStore.getState().clear()
      return
    }
    if (uid && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
      const state = useHomeownerDocsStore.getState()
      if (state.initializedFor !== uid) {
        void state.loadDocs(uid)
      }
    }
  })
}
