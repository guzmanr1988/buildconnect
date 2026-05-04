import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

// Vendor-private per-homeowner document collection. Nested map shape
// preserved for in-memory/demo path; Supabase-backed for real-auth vendors.
// dataUrl stored as base64 text — Tranche-3 will migrate to Storage bucket.

export type VendorHomeownerDocCategory =
  | 'driver_license'
  | 'permit'
  | 'contract'
  | 'quote'
  | 'photo'
  | 'other'

export interface VendorHomeownerDoc {
  id: string
  vendor_id: string
  homeowner_email: string
  category: VendorHomeownerDocCategory
  customLabel?: string
  filename: string
  dataUrl: string
  uploadedAt: string
}

// Demo vendors stay in-memory — no Supabase row for mock IDs.
const DEMO_VENDOR_IDS = new Set(['v-1', 'v-2', 'v-3'])

function rowToDoc(row: Record<string, unknown>): VendorHomeownerDoc {
  return {
    id: row.id as string,
    vendor_id: row.vendor_id as string,
    homeowner_email: row.homeowner_email as string,
    category: row.category as VendorHomeownerDocCategory,
    customLabel: row.custom_label as string | undefined,
    filename: row.filename as string,
    dataUrl: row.data_url as string,
    uploadedAt: row.uploaded_at as string,
  }
}

interface VendorHomeownerDocsState {
  docsByVendorByHomeowner: Record<string, Record<string, VendorHomeownerDoc[]>>
  hydratedVendors: Set<string>
  hydrateVendor: (vendorId: string) => Promise<void>
  hydrateForHomeowner: (vendorId: string, homeownerEmail: string) => Promise<void>
  hydrateAdminForHomeowner: (homeownerEmail: string) => Promise<void>
  addDoc: (doc: Omit<VendorHomeownerDoc, 'id' | 'uploadedAt'>) => Promise<void>
  removeDoc: (vendorId: string, homeownerEmail: string, docId: string) => Promise<void>
  getDocsForHomeowner: (vendorId: string, homeownerEmail: string) => VendorHomeownerDoc[]
  getAllDocsForHomeowner: (homeownerEmail: string) => VendorHomeownerDoc[]
}

export const useVendorHomeownerDocsStore = create<VendorHomeownerDocsState>()((set, get) => ({
  docsByVendorByHomeowner: {},
  hydratedVendors: new Set(),

  hydrateVendor: async (vendorId) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) return
    if (get().hydratedVendors.has(vendorId)) return
    const { data } = await supabase
      .from('vendor_homeowner_documents')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('uploaded_at', { ascending: true })
    if (data) {
      const byHomeowner: Record<string, VendorHomeownerDoc[]> = {}
      data.forEach((row) => {
        const doc = rowToDoc(row)
        const bucket = byHomeowner[doc.homeowner_email] ?? []
        bucket.push(doc)
        byHomeowner[doc.homeowner_email] = bucket
      })
      set((state) => ({
        docsByVendorByHomeowner: { ...state.docsByVendorByHomeowner, [vendorId]: byHomeowner },
        hydratedVendors: new Set([...state.hydratedVendors, vendorId]),
      }))
    }
  },

  hydrateForHomeowner: async (vendorId, homeownerEmail) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) return
    // Skip if full vendor already hydrated
    if (get().hydratedVendors.has(vendorId)) return
    const { data } = await supabase
      .from('vendor_homeowner_documents')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('homeowner_email', homeownerEmail)
      .order('uploaded_at', { ascending: true })
    if (data) {
      set((state) => {
        const vendorMap = state.docsByVendorByHomeowner[vendorId] ?? {}
        return {
          docsByVendorByHomeowner: {
            ...state.docsByVendorByHomeowner,
            [vendorId]: { ...vendorMap, [homeownerEmail]: data.map(rowToDoc) },
          },
        }
      })
    }
  },

  hydrateAdminForHomeowner: async (homeownerEmail) => {
    const { data } = await supabase
      .from('vendor_homeowner_documents')
      .select('*')
      .eq('homeowner_email', homeownerEmail)
      .order('uploaded_at', { ascending: false })
    if (data) {
      set((state) => {
        const next = { ...state.docsByVendorByHomeowner }
        data.forEach((row) => {
          const doc = rowToDoc(row)
          const vendorMap = next[doc.vendor_id] ?? {}
          const bucket = vendorMap[doc.homeowner_email] ?? []
          // Avoid duplicates on re-hydrate
          if (!bucket.find((d) => d.id === doc.id)) bucket.push(doc)
          next[doc.vendor_id] = { ...vendorMap, [doc.homeowner_email]: bucket }
        })
        return { docsByVendorByHomeowner: next }
      })
    }
  },

  addDoc: async (doc) => {
    if (DEMO_VENDOR_IDS.has(doc.vendor_id)) {
      const next: VendorHomeownerDoc = {
        ...doc,
        id: crypto.randomUUID(),
        uploadedAt: new Date().toISOString(),
      }
      set((state) => {
        const vendorMap = state.docsByVendorByHomeowner[doc.vendor_id] ?? {}
        const prior = vendorMap[doc.homeowner_email] ?? []
        return {
          docsByVendorByHomeowner: {
            ...state.docsByVendorByHomeowner,
            [doc.vendor_id]: { ...vendorMap, [doc.homeowner_email]: [...prior, next] },
          },
        }
      })
      return
    }
    const { data, error } = await supabase
      .from('vendor_homeowner_documents')
      .insert({
        vendor_id: doc.vendor_id,
        homeowner_email: doc.homeowner_email,
        category: doc.category,
        custom_label: doc.customLabel ?? null,
        filename: doc.filename,
        data_url: doc.dataUrl,
      })
      .select()
      .single()
    if (error) throw error
    const inserted = rowToDoc(data)
    set((state) => {
      const vendorMap = state.docsByVendorByHomeowner[doc.vendor_id] ?? {}
      const prior = vendorMap[doc.homeowner_email] ?? []
      return {
        docsByVendorByHomeowner: {
          ...state.docsByVendorByHomeowner,
          [doc.vendor_id]: { ...vendorMap, [doc.homeowner_email]: [...prior, inserted] },
        },
      }
    })
  },

  removeDoc: async (vendorId, homeownerEmail, docId) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) {
      set((state) => {
        const vendorMap = state.docsByVendorByHomeowner[vendorId] ?? {}
        const prior = vendorMap[homeownerEmail] ?? []
        return {
          docsByVendorByHomeowner: {
            ...state.docsByVendorByHomeowner,
            [vendorId]: { ...vendorMap, [homeownerEmail]: prior.filter((d) => d.id !== docId) },
          },
        }
      })
      return
    }
    const { error } = await supabase.from('vendor_homeowner_documents').delete().eq('id', docId)
    if (error) throw error
    set((state) => {
      const vendorMap = state.docsByVendorByHomeowner[vendorId] ?? {}
      const prior = vendorMap[homeownerEmail] ?? []
      return {
        docsByVendorByHomeowner: {
          ...state.docsByVendorByHomeowner,
          [vendorId]: { ...vendorMap, [homeownerEmail]: prior.filter((d) => d.id !== docId) },
        },
      }
    })
  },

  getDocsForHomeowner: (vendorId, homeownerEmail) => {
    const vendorMap = get().docsByVendorByHomeowner[vendorId] ?? {}
    return vendorMap[homeownerEmail] ?? []
  },

  getAllDocsForHomeowner: (homeownerEmail) => {
    const all: VendorHomeownerDoc[] = []
    Object.values(get().docsByVendorByHomeowner).forEach((vendorMap) => {
      const docs = vendorMap[homeownerEmail]
      if (docs) all.push(...docs)
    })
    return all.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
  },
}))

export const VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS: Record<VendorHomeownerDocCategory, string> = {
  driver_license: 'Driver License',
  permit: 'Permit',
  contract: 'Contract',
  quote: 'Quote',
  photo: 'Photo',
  other: 'Other',
}
