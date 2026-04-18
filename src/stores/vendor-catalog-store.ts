import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Tracks which services and options a vendor has enabled, with their pricing
export interface VendorServiceConfig {
  serviceId: string
  enabled: boolean
  enabledOptions: Record<string, string[]> // groupId -> array of enabled optionIds
  pricing: Record<string, number> // optionId -> price
}

interface VendorCatalogState {
  services: VendorServiceConfig[]
  initFromAdmin: (adminServices: { id: string }[]) => void
  toggleService: (serviceId: string) => void
  toggleOption: (serviceId: string, groupId: string, optionId: string) => void
  setPrice: (serviceId: string, optionId: string, price: number) => void
  isServiceEnabled: (serviceId: string) => boolean
  isOptionEnabled: (serviceId: string, groupId: string, optionId: string) => boolean
  getPrice: (serviceId: string, optionId: string) => number
}

export const useVendorCatalogStore = create<VendorCatalogState>()(
  persist(
    (set, get) => ({
      services: [],

      initFromAdmin: (adminServices) => {
        const existing = get().services
        const updated = adminServices.map((as) => {
          const found = existing.find((s) => s.serviceId === as.id)
          return found || { serviceId: as.id, enabled: false, enabledOptions: {}, pricing: {} }
        })
        set({ services: updated })
      },

      toggleService: (serviceId) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.serviceId === serviceId ? { ...s, enabled: !s.enabled } : s
          ),
        }))
      },

      toggleOption: (serviceId, groupId, optionId) => {
        set((state) => ({
          services: state.services.map((s) => {
            if (s.serviceId !== serviceId) return s
            const current = s.enabledOptions[groupId] || []
            const isEnabled = current.includes(optionId)
            return {
              ...s,
              enabledOptions: {
                ...s.enabledOptions,
                [groupId]: isEnabled
                  ? current.filter((id) => id !== optionId)
                  : [...current, optionId],
              },
            }
          }),
        }))
      },

      setPrice: (serviceId, optionId, price) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.serviceId === serviceId
              ? { ...s, pricing: { ...s.pricing, [optionId]: price } }
              : s
          ),
        }))
      },

      isServiceEnabled: (serviceId) => {
        return get().services.find((s) => s.serviceId === serviceId)?.enabled || false
      },

      isOptionEnabled: (serviceId, groupId, optionId) => {
        const service = get().services.find((s) => s.serviceId === serviceId)
        if (!service) return false
        return (service.enabledOptions[groupId] || []).includes(optionId)
      },

      getPrice: (serviceId, optionId) => {
        const service = get().services.find((s) => s.serviceId === serviceId)
        return service?.pricing[optionId] || 0
      },
    }),
    {
      name: 'buildconnect-vendor-catalog',
    }
  )
)
