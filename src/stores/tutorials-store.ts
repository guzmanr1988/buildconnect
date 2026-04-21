import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TUTORIALS, type Tutorial } from '@/lib/tutorials'

/*
 * Tutorials store — admin-managed video catalog (Rodolfo-direct pivot
 * #24). Replaces the #170 static MVP with a live store so /admin/tutorials
 * CRUD propagates to /home/tutorials immediately (shared-state two-
 * surfaces pattern — architecture-invariant-at-layer-boundary class,
 * same as #21 bankEnabledByVendor and #22 vendor-payments).
 *
 * Seeded from the static TUTORIALS catalog in src/lib/tutorials.ts —
 * on first hydrate the 13 MVP entries are live. Admin additions append;
 * admin edits patch by id; visibility toggle gates homeowner render
 * without deleting data (same widen-visibility-narrow-schema pattern
 * as the #204 payroll-integration toggle).
 *
 * Persist key 'buildconnect-tutorials'. Per-browser LS pre-launch per
 * mock-closes-loop directive; Tranche-2 will move to a Supabase
 * `tutorials` table with RLS (admin-write, anon-read).
 */

// Transform static TUTORIALS seed into records with admin-metadata
// defaults. Staggered createdAt so the admin list has a sortable
// chronology on first load. All seeded entries default to visible.
const SEED_BASE_TIME = new Date('2026-01-01T00:00:00Z').getTime()
const SEEDED_TUTORIALS: Tutorial[] = TUTORIALS.map((t, i) => ({
  ...t,
  visible: true,
  createdAt: new Date(SEED_BASE_TIME + i * 86400_000).toISOString(),
  updatedAt: new Date(SEED_BASE_TIME + i * 86400_000).toISOString(),
}))

export interface TutorialInput {
  title: string
  description: string
  duration: string
  serviceId: string
  topics: string[]
  transcript: string
  videoUrl?: string
  thumbnailUrl?: string
  visible?: boolean
}

interface TutorialsState {
  tutorials: Tutorial[]
  addTutorial: (input: TutorialInput) => void
  updateTutorial: (id: string, patch: Partial<TutorialInput>) => void
  setVisibility: (id: string, visible: boolean) => void
  removeTutorial: (id: string) => void
}

export const useTutorialsStore = create<TutorialsState>()(
  persist(
    (set) => ({
      tutorials: SEEDED_TUTORIALS,

      addTutorial: (input) =>
        set((state) => {
          const now = new Date().toISOString()
          const next: Tutorial = {
            ...input,
            id: crypto.randomUUID(),
            visible: input.visible ?? true,
            createdAt: now,
            updatedAt: now,
          }
          return { tutorials: [next, ...state.tutorials] }
        }),

      updateTutorial: (id, patch) =>
        set((state) => ({
          tutorials: state.tutorials.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
          ),
        })),

      setVisibility: (id, visible) =>
        set((state) => ({
          tutorials: state.tutorials.map((t) =>
            t.id === id ? { ...t, visible, updatedAt: new Date().toISOString() } : t,
          ),
        })),

      removeTutorial: (id) =>
        set((state) => ({
          tutorials: state.tutorials.filter((t) => t.id !== id),
        })),
    }),
    { name: 'buildconnect-tutorials' },
  ),
)
