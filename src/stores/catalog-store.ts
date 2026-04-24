import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ServiceConfig, OptionGroup, ServiceOption } from '@/types'
import { SERVICE_CATALOG } from '@/lib/constants'
import * as api from '@/lib/api/service-catalog'

/*
 * Phase 2 catalog-store: Supabase-backed with bundled SERVICE_CATALOG as
 * offline/error fallback. SWR on initial load — show bundled immediately,
 * overwrite with server data in the background.
 *
 * Mutations are async and await the Supabase call before updating local
 * state. Errors propagate to the caller (admin/products handles them with
 * toast). Store stays consistent with server on success; on failure, local
 * state is untouched and user sees the error.
 */

interface CatalogState {
  services: ServiceConfig[]
  isHydrating: boolean
  hasHydrated: boolean
  lastFetchError: string | null

  // Server sync
  hydrateFromServer: () => Promise<void>
  resetToBundled: () => void

  // Service CRUD
  addService: (service: ServiceConfig) => Promise<void>
  updateService: (id: string, updates: Partial<Omit<ServiceConfig, 'id'>>) => Promise<void>
  removeService: (id: string) => Promise<void>

  // Option Group CRUD
  addOptionGroup: (serviceId: string, group: OptionGroup) => Promise<void>
  updateOptionGroup: (
    serviceId: string,
    groupId: string,
    updates: Partial<Omit<OptionGroup, 'id'>>
  ) => Promise<void>
  removeOptionGroup: (serviceId: string, groupId: string) => Promise<void>

  // Option CRUD
  addOption: (serviceId: string, groupId: string, option: ServiceOption) => Promise<void>
  updateOption: (
    serviceId: string,
    groupId: string,
    optionId: string,
    updates: Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
  ) => Promise<void>
  removeOption: (serviceId: string, groupId: string, optionId: string) => Promise<void>

  // Sub-Group / Sub-Option CRUD
  addSubGroup: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroup: OptionGroup
  ) => Promise<void>
  updateSubGroup: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    updates: Partial<Omit<OptionGroup, 'id' | 'options'>>
  ) => Promise<void>
  removeSubGroup: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string
  ) => Promise<void>
  addSubOption: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    subOption: ServiceOption
  ) => Promise<void>
  updateSubOption: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    subOptionId: string,
    updates: Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
  ) => Promise<void>
  removeSubOption: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    subOptionId: string
  ) => Promise<void>

  // Ship #175 (Rodolfo-direct 2026-04-21) — reorder via long-press-and-drag
  // on admin/products. All four nested levels are reorderable; top-level
  // services are intentionally NOT reorderable (per Rodolfos "only menus
  // under the services" scope). fromIndex/toIndex are positions in the
  // current array, not sort_order values. Local-only today — the Supabase
  // sort_order column is read on hydrate but bulk-reorder write API is
  // Tranche-2 (needs a per-table batch-update endpoint); for now the
  // zustand persist middleware survives the reorder across reloads, which
  // matches the mock-as-test-harness pattern for other admin edits.
  reorderOptionGroups: (serviceId: string, fromIndex: number, toIndex: number) => void
  reorderOptions: (
    serviceId: string,
    groupId: string,
    fromIndex: number,
    toIndex: number
  ) => void
  reorderSubGroups: (
    serviceId: string,
    groupId: string,
    optionId: string,
    fromIndex: number,
    toIndex: number
  ) => void
  reorderSubOptions: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    fromIndex: number,
    toIndex: number
  ) => void
}

/* ---------------------------------------------------------------- */
/* Pure local-state reducers (used after successful API calls to    */
/* keep the store consistent without a full re-fetch round-trip).   */
/* ---------------------------------------------------------------- */

const localAddService = (
  state: CatalogState,
  service: ServiceConfig
): Pick<CatalogState, 'services'> => ({
  services: [...state.services, service],
})

const localUpdateService = (
  state: CatalogState,
  id: string,
  updates: Partial<Omit<ServiceConfig, 'id'>>
): Pick<CatalogState, 'services'> => ({
  services: state.services.map((s) => (s.id === id ? { ...s, ...updates } : s)),
})

const localRemoveService = (
  state: CatalogState,
  id: string
): Pick<CatalogState, 'services'> => ({
  services: state.services.filter((s) => s.id !== id),
})

const localAddOptionGroup = (
  state: CatalogState,
  serviceId: string,
  group: OptionGroup
): Pick<CatalogState, 'services'> => ({
  services: state.services.map((s) =>
    s.id === serviceId ? { ...s, optionGroups: [...s.optionGroups, group] } : s
  ),
})

const localUpdateOptionGroup = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  updates: Partial<Omit<OptionGroup, 'id'>>
): Pick<CatalogState, 'services'> => ({
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
})

const localRemoveOptionGroup = (
  state: CatalogState,
  serviceId: string,
  groupId: string
): Pick<CatalogState, 'services'> => ({
  services: state.services.map((s) =>
    s.id === serviceId
      ? { ...s, optionGroups: s.optionGroups.filter((g) => g.id !== groupId) }
      : s
  ),
})

const localAddOption = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  option: ServiceOption
): Pick<CatalogState, 'services'> => ({
  services: state.services.map((s) =>
    s.id === serviceId
      ? {
          ...s,
          optionGroups: s.optionGroups.map((g) =>
            g.id === groupId ? { ...g, options: [...g.options, option] } : g
          ),
        }
      : s
  ),
})

const localUpdateOption = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  optionId: string,
  updates: Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
): Pick<CatalogState, 'services'> => ({
  services: state.services.map((s) =>
    s.id === serviceId
      ? {
          ...s,
          optionGroups: s.optionGroups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  options: g.options.map((o) =>
                    o.id === optionId ? { ...o, ...updates } : o
                  ),
                }
              : g
          ),
        }
      : s
  ),
})

const localRemoveOption = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  optionId: string
): Pick<CatalogState, 'services'> => ({
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
})

const localAddSubGroup = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroup: OptionGroup
): Pick<CatalogState, 'services'> => ({
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
})

const localUpdateSubGroup = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string,
  updates: Partial<Omit<OptionGroup, 'id' | 'options'>>
): Pick<CatalogState, 'services'> => ({
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
                            sg.id === subGroupId ? { ...sg, ...updates } : sg
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
})

const localRemoveSubGroup = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string
): Pick<CatalogState, 'services'> => ({
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
                          subGroups: (o.subGroups || []).filter(
                            (sg) => sg.id !== subGroupId
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
})

const localAddSubOption = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string,
  subOption: ServiceOption
): Pick<CatalogState, 'services'> => ({
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
})

const localUpdateSubOption = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string,
  subOptionId: string,
  updates: Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
): Pick<CatalogState, 'services'> => ({
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
                              ? {
                                  ...sg,
                                  options: sg.options.map((so) =>
                                    so.id === subOptionId ? { ...so, ...updates } : so
                                  ),
                                }
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
})

const localRemoveSubOption = (
  state: CatalogState,
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string,
  subOptionId: string
): Pick<CatalogState, 'services'> => ({
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
                              ? {
                                  ...sg,
                                  options: sg.options.filter(
                                    (so) => so.id !== subOptionId
                                  ),
                                }
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
})

/* ---------------------------------------------------------------- */
/* Reorder helpers (Ship #175)                                       */
/* ---------------------------------------------------------------- */

// Standard array move — returns a new array with the element at
// fromIndex moved to toIndex. No-ops when indices are equal or when
// either is out of range.
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr
  if (from < 0 || from >= arr.length) return arr
  if (to < 0 || to >= arr.length) return arr
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/* ---------------------------------------------------------------- */
/* Store                                                             */
/* ---------------------------------------------------------------- */

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => ({
      services: SERVICE_CATALOG,
      isHydrating: false,
      hasHydrated: false,
      lastFetchError: null,

      hydrateFromServer: async () => {
        if (get().isHydrating) return
        set({ isHydrating: true, lastFetchError: null })
        try {
          const services = await api.fetchServiceCatalog()
          set({ services, hasHydrated: true, isHydrating: false })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'fetchServiceCatalog failed'
          // Keep existing local services (bundled fallback or cached) — do NOT blank out on fetch failure.
          set({ isHydrating: false, lastFetchError: msg })
          console.error('[catalog-store] hydrateFromServer failed:', msg)
        }
      },

      resetToBundled: () => {
        set({ services: SERVICE_CATALOG, hasHydrated: false, lastFetchError: null })
      },

      addService: async (service) => {
        await api.createService(service)
        set((state) => localAddService(state, service))
      },

      updateService: async (id, updates) => {
        await api.updateService(id, updates)
        set((state) => localUpdateService(state, id, updates))
      },

      removeService: async (id) => {
        await api.deleteService(id)
        set((state) => localRemoveService(state, id))
      },

      addOptionGroup: async (serviceId, group) => {
        await api.createOptionGroup(serviceId, group)
        set((state) => localAddOptionGroup(state, serviceId, group))
      },

      updateOptionGroup: async (serviceId, groupId, updates) => {
        await api.updateOptionGroup(serviceId, groupId, updates)
        set((state) => localUpdateOptionGroup(state, serviceId, groupId, updates))
      },

      removeOptionGroup: async (serviceId, groupId) => {
        await api.deleteOptionGroup(serviceId, groupId)
        set((state) => localRemoveOptionGroup(state, serviceId, groupId))
      },

      addOption: async (serviceId, groupId, option) => {
        await api.createOption(serviceId, groupId, option)
        set((state) => localAddOption(state, serviceId, groupId, option))
      },

      updateOption: async (serviceId, groupId, optionId, updates) => {
        await api.updateOption(serviceId, groupId, optionId, updates)
        set((state) => localUpdateOption(state, serviceId, groupId, optionId, updates))
      },

      removeOption: async (serviceId, groupId, optionId) => {
        await api.deleteOption(serviceId, groupId, optionId)
        set((state) => localRemoveOption(state, serviceId, groupId, optionId))
      },

      addSubGroup: async (serviceId, groupId, optionId, subGroup) => {
        await api.createSubGroup(serviceId, groupId, optionId, subGroup)
        set((state) => localAddSubGroup(state, serviceId, groupId, optionId, subGroup))
      },

      updateSubGroup: async (serviceId, groupId, optionId, subGroupId, updates) => {
        await api.updateSubGroup(serviceId, groupId, optionId, subGroupId, updates)
        set((state) =>
          localUpdateSubGroup(state, serviceId, groupId, optionId, subGroupId, updates)
        )
      },

      removeSubGroup: async (serviceId, groupId, optionId, subGroupId) => {
        await api.deleteSubGroup(serviceId, groupId, optionId, subGroupId)
        set((state) =>
          localRemoveSubGroup(state, serviceId, groupId, optionId, subGroupId)
        )
      },

      addSubOption: async (serviceId, groupId, optionId, subGroupId, subOption) => {
        await api.createSubOption(serviceId, groupId, optionId, subGroupId, subOption)
        set((state) =>
          localAddSubOption(state, serviceId, groupId, optionId, subGroupId, subOption)
        )
      },

      updateSubOption: async (serviceId, groupId, optionId, subGroupId, subOptionId, updates) => {
        await api.updateSubOption(
          serviceId,
          groupId,
          optionId,
          subGroupId,
          subOptionId,
          updates
        )
        set((state) =>
          localUpdateSubOption(
            state,
            serviceId,
            groupId,
            optionId,
            subGroupId,
            subOptionId,
            updates
          )
        )
      },

      // Ship #175 — reorder actions. Pure local-state updates; no api.*
      // call because vendor_option_prices / option-groups bulk-reorder
      // endpoints aren't wired yet. zustand persist middleware keeps the
      // reorder across reloads, matching the mock-as-test-harness pattern.
      reorderOptionGroups: (serviceId, fromIndex, toIndex) =>
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? { ...s, optionGroups: arrayMove(s.optionGroups, fromIndex, toIndex) }
              : s
          ),
        })),

      reorderOptions: (serviceId, groupId, fromIndex, toIndex) =>
        set((state) => ({
          services: state.services.map((s) =>
            s.id !== serviceId
              ? s
              : {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id === groupId
                      ? { ...g, options: arrayMove(g.options, fromIndex, toIndex) }
                      : g
                  ),
                }
          ),
        })),

      reorderSubGroups: (serviceId, groupId, optionId, fromIndex, toIndex) =>
        set((state) => ({
          services: state.services.map((s) =>
            s.id !== serviceId
              ? s
              : {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id !== groupId
                      ? g
                      : {
                          ...g,
                          options: g.options.map((o) =>
                            o.id !== optionId
                              ? o
                              : {
                                  ...o,
                                  subGroups: arrayMove(o.subGroups ?? [], fromIndex, toIndex),
                                }
                          ),
                        }
                  ),
                }
          ),
        })),

      reorderSubOptions: (serviceId, groupId, optionId, subGroupId, fromIndex, toIndex) =>
        set((state) => ({
          services: state.services.map((s) =>
            s.id !== serviceId
              ? s
              : {
                  ...s,
                  optionGroups: s.optionGroups.map((g) =>
                    g.id !== groupId
                      ? g
                      : {
                          ...g,
                          options: g.options.map((o) =>
                            o.id !== optionId
                              ? o
                              : {
                                  ...o,
                                  subGroups: (o.subGroups ?? []).map((sg) =>
                                    sg.id !== subGroupId
                                      ? sg
                                      : { ...sg, options: arrayMove(sg.options, fromIndex, toIndex) }
                                  ),
                                }
                          ),
                        }
                  ),
                }
          ),
        })),

      removeSubOption: async (serviceId, groupId, optionId, subGroupId, subOptionId) => {
        await api.deleteSubOption(
          serviceId,
          groupId,
          optionId,
          subGroupId,
          subOptionId
        )
        set((state) =>
          localRemoveSubOption(
            state,
            serviceId,
            groupId,
            optionId,
            subGroupId,
            subOptionId
          )
        )
      },
    }),
    {
      name: 'buildconnect-catalog',
      // Ship #259 — version bump 8→9 forces existing users to re-hydrate
      // from SERVICE_CATALOG via the migrate fn below. #255 flipped the
      // roofing material option-group from type:'single' to type:'multi'
      // in constants.ts, but the persist middleware kept serving the v8
      // cached single-select shape to existing users, so the multi-select
      // code-path never fired on their runtime despite the bundle carrying
      // the new default.
      //
      // Ship #260 — version bump 9→10 paired-edit-discipline: SERVICE_CATALOG
      // gained 12th service "Blinds" in the same commit. Paired-edit enforces
      // the #259 lesson — any SERVICE_CATALOG shape change MUST bump persist
      // version in the same commit to force migration for existing users.
      //
      // Future same-class fixes: when changing SERVICE_CATALOG defaults,
      // bump this version to force persisted-state eviction.
      version: 10,
      // Persist only the services array and the hasHydrated flag; transient
      // state (isHydrating, lastFetchError) stays in-memory only.
      partialize: (state) => ({
        services: state.services,
        hasHydrated: state.hasHydrated,
      }),
      // Migrate resets to bundled SERVICE_CATALOG so existing users get a
      // clean fallback; hydrateFromServer will overwrite on next auth'd load.
      migrate: () => ({
        services: SERVICE_CATALOG,
        hasHydrated: false,
      }),
    }
  )
)
