import { create } from 'zustand'

// Homeowner-side document store. Auto-generated project submission records
// (PDFs containing homeowner ID + no-permit waiver when applicable) land here
// after sendProject. In-memory only (PR #194) — was LS-persisted, but each
// PDF carries the homeowner ID image (200-500KB base64) and the array
// accumulates unboundedly across sends, blowing the 5MB Safari LS quota
// after ~10 test submissions. PRs #191/#193 fixed projects-store; this
// store was the remaining bloat source on Rodolfo's apex device. Reload
// drops docs[] back to []; users can regenerate from sentProjects on
// demand. Tranche-2 Supabase Storage migration is the durable persistence.
// Boot-purge in main.tsx evicts the orphaned 'buildconnect-homeowner-docs'
// LS key once per device on first load after deploy.

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

export const useHomeownerDocsStore = create<HomeownerDocsState>()((set, get) => ({
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
}))
