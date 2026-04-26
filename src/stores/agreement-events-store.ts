import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Ship #276 — cross-role visibility shared store for non-circumvention
// agreement signings. Vendor SignMode handleSubmit pushes via
// recordSign on sign-success; admin-layout reads + filters by 48h
// recency window for the notification rail.
//
// Mirrors the rescheduleRequestsByLead persisted-cross-role-store
// pattern. Mock-mode bridge: in real Supabase deployment, this
// becomes a server-side audit-log table that admin queries directly;
// this in-memory ledger is the demo equivalent.

export interface AgreementEvent {
  vendorId: string
  vendorName: string
  vendorEmail: string
  version: string
  signedAt: string // ISO timestamp
}

interface AgreementEventsState {
  events: AgreementEvent[]
  recordSign: (event: AgreementEvent) => void
}

export const useAgreementEventsStore = create<AgreementEventsState>()(
  persist(
    (set) => ({
      events: [],
      recordSign: (event) =>
        set((state) => ({
          events: [...state.events, event],
        })),
    }),
    { name: 'buildconnect-agreement-events' },
  ),
)
