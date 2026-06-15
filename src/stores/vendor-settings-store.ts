import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Per-device vendor settings (Zustand persist via localStorage).
//
// financingEnabled — v1 vendor master toggle for the Financing tab. Mirrors
// usersTabEnabled persist shape. Per-device (acceptable v1 asymmetry per
// kratos msg 1781498887759-kratos-xcb40): gates the Financing tab visibility
// in the vendor sidebar. Per-lender activation lives in server-side
// vendor_lenders (mig 071) so per-lender state DOES cross devices.
//
// Fast-follow if Rod wants cross-device master: promote to
// profiles.financing_enabled column (one ALTER + ~5 LoC swap from
// useVendorSettingsStore to a useFinancingMasterFlag hook).
interface VendorSettingsState {
  usersTabEnabled: boolean
  setUsersTabEnabled: (enabled: boolean) => void
  financingEnabled: boolean
  setFinancingEnabled: (enabled: boolean) => void
}

export const useVendorSettingsStore = create<VendorSettingsState>()(
  persist(
    (set) => ({
      usersTabEnabled: true,
      setUsersTabEnabled: (enabled) => set({ usersTabEnabled: enabled }),
      financingEnabled: false,
      setFinancingEnabled: (enabled) => set({ financingEnabled: enabled }),
    }),
    { name: 'buildconnect-vendor-settings' },
  ),
)
