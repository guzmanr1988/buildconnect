import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Ship #278 — vendor-side per-homeowner document collection.
// Vendor uploads (permits, contracts, quotes, photos, etc.) keyed
// by vendor_id × homeowner_email. Homeowner-uploaded ID stays on
// the existing cart-store + sentProjects.idDocument flow (#267/#268)
// — that's cross-role visible. This store is vendor-private:
// admin god-view can audit but homeowner doesn't see vendor's
// permit copies / internal records.
//
// TODO Tranche-2: replace zustand persist with Supabase Storage
// bucket + RLS (vendor-only read, admin god-read). Data-URL
// persistence balloons localStorage fast — fine for demo, breaks
// at scale. Storage migration tracked in the existing Tranche-2
// task (Supabase Storage bucket + image moderation for avatars)
// or filed as a sibling task once first vendor uploads multiple
// docs in real mock testing.

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
  // Free-text label populated when category === 'other'; lets vendor
  // name the doc-type (e.g. "Inspection report", "HOA approval").
  customLabel?: string
  filename: string
  // Base64 data URL of the uploaded file. Includes MIME type prefix
  // so download anchor uses correct extension.
  dataUrl: string
  uploadedAt: string
}

interface VendorHomeownerDocsState {
  // Nested map: vendor_id → homeowner_email → docs[]. Allows vendor
  // tab-switch between homeowners without re-querying / dedupe at
  // read time.
  docsByVendorByHomeowner: Record<string, Record<string, VendorHomeownerDoc[]>>
  addDoc: (doc: Omit<VendorHomeownerDoc, 'id' | 'uploadedAt'>) => void
  removeDoc: (vendorId: string, homeownerEmail: string, docId: string) => void
  getDocsForHomeowner: (vendorId: string, homeownerEmail: string) => VendorHomeownerDoc[]
}

export const useVendorHomeownerDocsStore = create<VendorHomeownerDocsState>()(
  persist(
    (set, get) => ({
      docsByVendorByHomeowner: {},

      addDoc: (doc) =>
        set((state) => {
          const next: VendorHomeownerDoc = {
            ...doc,
            id: crypto.randomUUID(),
            uploadedAt: new Date().toISOString(),
          }
          const vendorMap = state.docsByVendorByHomeowner[doc.vendor_id] ?? {}
          const priorDocs = vendorMap[doc.homeowner_email] ?? []
          return {
            docsByVendorByHomeowner: {
              ...state.docsByVendorByHomeowner,
              [doc.vendor_id]: {
                ...vendorMap,
                [doc.homeowner_email]: [...priorDocs, next],
              },
            },
          }
        }),

      removeDoc: (vendorId, homeownerEmail, docId) =>
        set((state) => {
          const vendorMap = state.docsByVendorByHomeowner[vendorId] ?? {}
          const priorDocs = vendorMap[homeownerEmail] ?? []
          const filtered = priorDocs.filter((d) => d.id !== docId)
          return {
            docsByVendorByHomeowner: {
              ...state.docsByVendorByHomeowner,
              [vendorId]: {
                ...vendorMap,
                [homeownerEmail]: filtered,
              },
            },
          }
        }),

      getDocsForHomeowner: (vendorId, homeownerEmail) => {
        const vendorMap = get().docsByVendorByHomeowner[vendorId] ?? {}
        return vendorMap[homeownerEmail] ?? []
      },
    }),
    { name: 'buildconnect-vendor-homeowner-docs' },
  ),
)

export const VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS: Record<VendorHomeownerDocCategory, string> = {
  driver_license: 'Driver License',
  permit: 'Permit',
  contract: 'Contract',
  quote: 'Quote',
  photo: 'Photo',
  other: 'Other',
}
