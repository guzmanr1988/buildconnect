import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserRole } from '@/types'

export type UserStatus = 'active' | 'pending' | 'suspended'

export interface MockUser {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  joined_at: string
  account_rep_for_vendor_id?: string
}

interface UsersState {
  users: MockUser[]
  addUser: (user: Omit<MockUser, 'id' | 'joined_at'>) => void
  updateUser: (id: string, updates: Partial<Omit<MockUser, 'id'>>) => void
  toggleStatus: (id: string) => void
  removeUser: (id: string) => void
}

const INITIAL_USERS: MockUser[] = [
  { id: 'u1', name: 'Alex Rivera', email: 'alex@buildconnect.io', role: 'admin', status: 'active', joined_at: '2025-01-10' },
  { id: 'u2', name: 'Jordan Lee', email: 'jordan@buildconnect.io', role: 'admin', status: 'active', joined_at: '2025-02-14' },
  { id: 'u3', name: 'Sam Patel', email: 'sam@eliteroofing.com', role: 'vendor', status: 'active', joined_at: '2025-03-01' },
  { id: 'u4', name: 'Maria Gonzalez', email: 'maria@premiumwindows.com', role: 'vendor', status: 'active', joined_at: '2025-03-18' },
  { id: 'u5', name: 'Chen Wei', email: 'chen@poolpros.com', role: 'vendor', status: 'pending', joined_at: '2025-04-02' },
  { id: 'u6', name: 'Lisa Thompson', email: 'lisa.t@gmail.com', role: 'homeowner', status: 'active', joined_at: '2025-04-05' },
  { id: 'u7', name: 'Derek Williams', email: 'derek.w@outlook.com', role: 'homeowner', status: 'active', joined_at: '2025-04-08' },
  { id: 'u8', name: 'Priya Sharma', email: 'priya.s@yahoo.com', role: 'homeowner', status: 'suspended', joined_at: '2025-02-20' },
  { id: 'u9', name: 'Carlos Mendez', email: 'carlos@drivewayking.com', role: 'vendor', status: 'suspended', joined_at: '2025-01-25' },
  { id: 'u10', name: 'Nina Okafor', email: 'nina.o@gmail.com', role: 'homeowner', status: 'pending', joined_at: '2025-04-10' },
  // Demo account rep scoped to v-1 (Apex Roofing) — mirrors the Account Rep demo login.
  { id: 'u11', name: 'Miguel Reyes', email: 'account_rep@buildc.net', role: 'account_rep', status: 'active', joined_at: '2026-04-29', account_rep_for_vendor_id: 'v-1' },
]

export const useUsersStore = create<UsersState>()(
  persist(
    (set) => ({
      users: INITIAL_USERS,
      addUser: (user) =>
        set((state) => ({
          users: [
            {
              ...user,
              id: `u${Date.now()}`,
              joined_at: new Date().toISOString().slice(0, 10),
            },
            ...state.users,
          ],
        })),
      updateUser: (id, updates) =>
        set((state) => ({
          users: state.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        })),
      toggleStatus: (id) =>
        set((state) => ({
          users: state.users.map((u) =>
            u.id === id
              ? { ...u, status: u.status === 'suspended' ? 'active' : 'suspended' }
              : u,
          ),
        })),
      removeUser: (id) =>
        set((state) => ({
          users: state.users.filter((u) => u.id !== id),
        })),
    }),
    { name: 'buildconnect-users' },
  ),
)
