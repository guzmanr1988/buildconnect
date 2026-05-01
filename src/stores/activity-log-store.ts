import { create } from 'zustand'

export type ActivityEventType =
  | 'submitted'
  | 'confirmed'
  | 'rep_assigned'
  | 'reschedule_requested'
  | 'reschedule_resolved'
  | 'cancellation_requested'
  | 'cancellation_approved'
  | 'cancellation_denied'
  | 'sold'
  | 'completed'
  | 'review_set'
  | 'review_reset'

export interface ActivityLogEntry {
  id: string
  timestamp: string
  eventType: ActivityEventType
  leadId?: string
  projectId?: string
  meta?: Record<string, unknown>
}

interface ActivityLogState {
  events: ActivityLogEntry[]
  logEvent: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => void
  clearLog: () => void
}

// In-memory only — not persisted. Grows for the session lifetime then
// resets on reload. Consumers (admin activity page) currently derive
// events from store state directly; this log is the foundation for the
// follow-up migration to a single-SoT event feed.
export const useActivityLogStore = create<ActivityLogState>()((set) => ({
  events: [],

  logEvent: (entry) =>
    set((state) => ({
      events: [
        ...state.events,
        {
          id: `${entry.eventType}-${entry.leadId ?? entry.projectId ?? 'sys'}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          ...entry,
        },
      ],
    })),

  clearLog: () => set({ events: [] }),
}))
