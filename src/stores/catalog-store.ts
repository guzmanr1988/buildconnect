import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ServiceConfig, OptionGroup, ServiceOption } from '@/types'
import { SERVICE_CATALOG } from '@/lib/constants'

interface CatalogState {
  services: ServiceConfig[]
  addService: (service: ServiceConfig) => void
  updateService: (id: string, updates: Partial<Omit<ServiceConfig, 'id'>>) => void
  removeService: (id: string) => void
  addOptionGroup: (serviceId: string, group: OptionGroup) => void
  updateOptionGroup: (serviceId: string, groupId: string, updates: Partial<Omit<OptionGroup, 'id'>>) => void
  removeOptionGroup: (serviceId: string, groupId: string) => void
  addOption: (serviceId: string, groupId: string, option: ServiceOption) => void
  removeOption: (serviceId: string, groupId: string, optionId: string) => void
  addSubGroup: (serviceId: string, groupId: string, optionId: string, subGroup: OptionGroup) => void
  removeSubGroup: (serviceId: string, groupId: string, optionId: string, subGroupId: string) => void
  addSubOption: (serviceId: string, groupId: string, optionId: string, subGroupId: string, subOption: ServiceOption) => void
  removeSubOption: (serviceId: string, groupId: string, optionId: string, subGroupId: string, subOptionId: string) => void
}

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set) => ({
      services: SERVICE_CATALOG,

      addService: (service) => {
        set((state) => ({ services: [...state.services, service] }))
      },

      updateService: (id, updates) => {
        set((state) => ({
          services: state.services.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        }))
      },

      removeService: (id) => {
        set((state) => ({ services: state.services.filter((s) => s.id !== id) }))
      },

      addOptionGroup: (serviceId, group) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? { ...s, optionGroups: [...s.optionGroups, group] }
              : s
          ),
        }))
      },

      updateOptionGroup: (serviceId, groupId, updates) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id === groupId ? { ...g, ...updates } : g
                  ),
                }
              : s
          ),
        }))
      },

      removeOptionGroup: (serviceId, groupId) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? { ...s, optionGroups: s.optionGroups.filter((g) => g.id !== groupId) }
              : s
          ),
        }))
      },

      addOption: (serviceId, groupId, option) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id === groupId
                      ? { ...g, options: [...g.options, option] }
                      : g
                  ),
                }
              : s
          ),
        }))
      },

      removeOption: (serviceId, groupId, optionId) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id === groupId
                      ? { ...g, options: g.options.filter((o) => o.id !== optionId) }
                      : g
                  ),
                }
              : s
          ),
        }))
      },
      addSubGroup: (serviceId, groupId, optionId, subGroup) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id === groupId
                      ? {
                          ...g,
                          options: g.options.map((o) =>
                            o.id === optionId
                              ? { ...o, subGroups: [...(o.subGroups || []), subGroup] }
                              : o
                          ),
                        }
                      : g
                  ),
                }
              : s
          ),
        }))
      },

      removeSubGroup: (serviceId, groupId, optionId, subGroupId) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id === groupId
                      ? {
                          ...g,
                          options: g.options.map((o) =>
                            o.id === optionId
                              ? { ...o, subGroups: (o.subGroups || []).filter((sg) => sg.id !== subGroupId) }
                              : o
                          ),
                        }
                      : g
                  ),
                }
              : s
          ),
        }))
      },

      addSubOption: (serviceId, groupId, optionId, subGroupId, subOption) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id === groupId
                      ? {
                          ...g,
                          options: g.options.map((o) =>
                            o.id === optionId
                              ? {
                                  ...o,
                                  subGroups: (o.subGroups || []).map((sg) =>
                                    sg.id === subGroupId
                                      ? { ...sg, options: [...sg.options, subOption] }
                                      : sg
                                  ),
                                }
                              : o
                          ),
                        }
                      : g
                  ),
                }
              : s
          ),
        }))
      },

      removeSubOption: (serviceId, groupId, optionId, subGroupId, subOptionId) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id === groupId
                      ? {
                          ...g,
                          options: g.options.map((o) =>
                            o.id === optionId
                              ? {
                                  ...o,
                                  subGroups: (o.subGroups || []).map((sg) =>
                                    sg.id === subGroupId
                                      ? { ...sg, options: sg.options.filter((so) => so.id !== subOptionId) }
                                      : sg
                                  ),
                                }
                              : o
                          ),
                        }
                      : g
                  ),
                }
              : s
          ),
        }))
      },
    }),
    {
      name: 'buildconnect-catalog',
      version: 4,
      migrate: () => ({
        services: SERVICE_CATALOG,
      }),
    }
  )
)
