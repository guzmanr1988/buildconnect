import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Homeowner-side document store. Auto-generated project submission records
// (PDFs containing homeowner ID + no-permit waiver when applicable) land here
// after sendProject. LS-only for demo; Supabase Storage migration deferred to Tranche-2.

export type HomeownerDocCategory = 'project-submission' | 'other'

export interface HomeownerDoc {
  id: string
  homeownerId: string
  category: HomeownerDocCategory
  filename: string
  dataUrl: string
  createdAt: string
  // Optional metadata for display
  vendorCompany?: string
  serviceName?: string
  // Optional FK to projects-store SentProject.id; legacy docs without this
  // route to the "Other documents" bucket. Widen-reads-narrow-writes —
  // existing persisted docs without project_id remain valid.
  project_id?: string
}

interface HomeownerDocsState {
  docs: HomeownerDoc[]
  addDoc: (doc: Omit<HomeownerDoc, 'id' | 'createdAt'>) => void
  removeDoc: (id: string) => void
  getDocsForHomeowner: (homeownerId: string) => HomeownerDoc[]
}

export const useHomeownerDocsStore = create<HomeownerDocsState>()(
  persist(
    (set, get) => ({
      docs: [],
      addDoc: (doc) => {
        const newDoc: HomeownerDoc = {
          ...doc,
          id: `hdoc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ docs: [...s.docs, newDoc] }))
      },
      removeDoc: (id) => set((s) => ({ docs: s.docs.filter((d) => d.id !== id) })),
      getDocsForHomeowner: (homeownerId) => get().docs.filter((d) => d.homeownerId === homeownerId),
    }),
    { name: 'buildconnect-homeowner-docs' }
  )
)
