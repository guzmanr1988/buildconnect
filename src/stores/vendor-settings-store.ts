import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface VendorSettingsState {
  usersTabEnabled: boolean
  setUsersTabEnabled: (enabled: boolean) => void
}

export const useVendorSettingsStore = create<VendorSettingsState>()(
  persist(
    (set) => ({
      usersTabEnabled: true,
      setUsersTabEnabled: (enabled) => set({ usersTabEnabled: enabled }),
    }),
    { name: 'buildconnect-vendor-settings' },
  ),
)
