import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AdminMessage {
  id: string
  vendorId: string
  senderId: string
  senderName: string
  content: string
  timestamp: string
  isAdmin: boolean
}

interface AdminMessagesState {
  messages: AdminMessage[]
  addMessage: (msg: Omit<AdminMessage, 'id' | 'timestamp'>) => void
}

// Seed data so conversations aren't empty
const SEED: AdminMessage[] = [
  { id: 's1', vendorId: 'v-1', senderId: 'admin-1', senderName: 'Admin', content: 'Hi Carlos, just checking in on the roof project status for Maria Rodriguez.', timestamp: '2026-04-14T10:00:00Z', isAdmin: true },
  { id: 's2', vendorId: 'v-1', senderId: 'v-1', senderName: 'Carlos Mendez', content: "Hey! The crew is scheduled for Monday. Materials are on site. We should be done within 3 days.", timestamp: '2026-04-14T10:05:00Z', isAdmin: false },
  { id: 's3', vendorId: 'v-1', senderId: 'admin-1', senderName: 'Admin', content: 'Great. Make sure to submit the permit photos once the inspection passes.', timestamp: '2026-04-14T10:08:00Z', isAdmin: true },
  { id: 's4', vendorId: 'v-1', senderId: 'v-1', senderName: 'Carlos Mendez', content: "Will do. I'll upload them through the platform as soon as we pass.", timestamp: '2026-04-14T10:10:00Z', isAdmin: false },
  { id: 's5', vendorId: 'v-2', senderId: 'v-2', senderName: 'Tony Rivera', content: "Quick question — is James Thompson's financing approved yet? I want to order the windows.", timestamp: '2026-04-13T14:00:00Z', isAdmin: false },
  { id: 's6', vendorId: 'v-2', senderId: 'admin-1', senderName: 'Admin', content: "Still processing. I'll let you know as soon as it clears. Should be within 48 hours.", timestamp: '2026-04-13T14:15:00Z', isAdmin: true },
  { id: 's7', vendorId: 'v-3', senderId: 'admin-1', senderName: 'Admin', content: 'Ana, just a reminder — your commission for the Chen pool project is still outstanding.', timestamp: '2026-04-12T09:00:00Z', isAdmin: true },
  { id: 's8', vendorId: 'v-3', senderId: 'v-3', senderName: 'Ana Martinez', content: "I know, sorry about that. I'll get it sent over by end of week. The client paid late.", timestamp: '2026-04-12T11:30:00Z', isAdmin: false },
]

export const useAdminMessagesStore = create<AdminMessagesState>()(
  persist(
    (set) => ({
      messages: SEED,
      addMessage: (msg) => {
        const newMsg: AdminMessage = {
          ...msg,
          id: `am-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
        }
        set((state) => ({ messages: [...state.messages, newMsg] }))
      },
    }),
    { name: 'buildconnect-admin-messages' }
  )
)
