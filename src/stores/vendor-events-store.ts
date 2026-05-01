import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Ship #339 Phase A — vendor-side calendar events store. Per Rodolfo
// "allow vendor to add calendar events to block day or add event".
// Two event types:
//   - block_day: vendor unavailable that day (PTO / shutdown / holiday).
//     Calendar grid cell dims; selectedDate detail panel shows "Blocked"
//     label.
//   - custom: scheduled non-lead event (label + time + notes). Renders
//     as distinct-color/icon card alongside lead-cards in selectedLeads
//     list per banked feedback_label_as_contract_indicator_semantics
//     ("Event" vs "Lead" labeling).
//
// Per banked CHAIN IS GOD discrimination axis: parallel-data-layer to
// the existing chain (vendor-lead-stages.ts), NOT chain-modification.
// Calendar consumes both leads (from chain) AND events (from this store)
// at render-time. Chain primitives untouched.
//
// mock-data-as-test-harness: store seeds with sample fixtures (PTO +
// custom event) on first load per per-vendor map; cleared on Clear Demo
// Data via demoDataHidden flag if Rodolfo wants strict-empty-state
// (current Phase A: seeds on every fresh demo init; Tranche-2 wires to
// real Supabase vendor_events table).

export type VendorEventType = 'block_day' | 'custom'

export interface VendorEvent {
  id: string
  vendor_id: string
  type: VendorEventType
  // ISO 'YYYY-MM-DD' date for the event. block_day events use this as
  // the unavailable-day; custom events use this + time for the
  // scheduled-time.
  date: string
  // 24h 'HH:MM' time. Optional for block_day events; required for
  // custom events at write-time (UI form should validate).
  time?: string
  duration?: number
  label: string
  notes?: string
  createdAt: string
}

interface VendorEventsState {
  // Per-vendor keyed map. Same shape as vendor-employees-store /
  // admin-moderation-store conventions.
  eventsByVendor: Record<string, VendorEvent[]>
  addEvent: (event: Omit<VendorEvent, 'id' | 'createdAt'>) => void
  removeEvent: (vendorId: string, eventId: string) => void
  getEventsForVendor: (vendorId: string) => VendorEvent[]
  // Per-day lookup for calendar grid rendering. Returns events for the
  // given vendor on the given date (ISO 'YYYY-MM-DD').
  getEventsForVendorOnDate: (vendorId: string, date: string) => VendorEvent[]
}

// Ship #339 — sample seed for demo-visibility per Rodolfo "demo must
// work as real" worldview. Seeds 2 sample events under v-1 (Apex; the
// Vendor demo button alias-target per #222/#334) so calendar shows
// meaningful content out-of-the-box without requiring vendor-add
// interactions to verify the feature works.
const SAMPLE_SEED: Record<string, VendorEvent[]> = {
  'v-1': [
    {
      id: 'evt-sample-1',
      vendor_id: 'v-1',
      type: 'block_day',
      date: '2026-04-30',
      label: 'Out of office',
      notes: 'Quarterly team off-site',
      createdAt: '2026-04-20T10:00:00.000Z',
    },
    {
      id: 'evt-sample-2',
      vendor_id: 'v-1',
      type: 'custom',
      date: '2026-05-02',
      time: '09:00',
      label: 'Crew training',
      notes: 'New roof-tile installation method walkthrough',
      createdAt: '2026-04-22T14:00:00.000Z',
    },
  ],
}

export const useVendorEventsStore = create<VendorEventsState>()(
  persist(
    (set, get) => ({
      eventsByVendor: SAMPLE_SEED,

      addEvent: (event) =>
        set((state) => {
          const next: VendorEvent = {
            ...event,
            id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            createdAt: new Date().toISOString(),
          }
          const prior = state.eventsByVendor[event.vendor_id] ?? []
          return {
            eventsByVendor: {
              ...state.eventsByVendor,
              [event.vendor_id]: [...prior, next],
            },
          }
        }),

      removeEvent: (vendorId, eventId) =>
        set((state) => {
          const prior = state.eventsByVendor[vendorId] ?? []
          return {
            eventsByVendor: {
              ...state.eventsByVendor,
              [vendorId]: prior.filter((e) => e.id !== eventId),
            },
          }
        }),

      getEventsForVendor: (vendorId) => get().eventsByVendor[vendorId] ?? [],

      getEventsForVendorOnDate: (vendorId, date) =>
        (get().eventsByVendor[vendorId] ?? []).filter((e) => e.date === date),
    }),
    { name: 'buildconnect-vendor-events' },
  ),
)
