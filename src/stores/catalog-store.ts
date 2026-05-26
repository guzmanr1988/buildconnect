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

/* ---------------------------------------------------------------- */
/* Staged-mutation types (PR-#425)                                  */
/*                                                                  */
/* Trash clicks + dialog Saves stage locally; Save Changes flushes  */
/* the whole batch (deletes → edits → reorders). Pending state is   */
/* INTENTIONALLY not persisted (partialize excludes _pending*) —    */
/* page reload discards staged-but-unsaved changes (mirrors Arc-32  */
/* _pendingWrites discipline in vendor-catalog-store).              */
/* ---------------------------------------------------------------- */

export type PendingNodeType =
  | 'service'
  | 'group'
  | 'option'
  | 'subGroup'
  | 'subOption'

export interface PendingKeys {
  serviceId: string
  groupId?: string
  optionId?: string
  subGroupId?: string
  subOptionId?: string
}

export interface PendingDelete extends PendingKeys {
  type: PendingNodeType
}

export interface PendingEdit extends PendingKeys {
  type: PendingNodeType
  patch: Record<string, unknown>
  // prev snapshot lets Undo restore the pre-stage values when the user
  // discards a pending edit without committing.
  prev: Record<string, unknown>
}

interface CatalogState {
  services: ServiceConfig[]
  isHydrating: boolean
  hasHydrated: boolean
  lastFetchError: string | null

  // Staged mutations for batch-commit Save Changes (PR-#425)
  _pendingDeletes: PendingDelete[]
  _pendingEdits: PendingEdit[]

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

  // Reorder via long-press-and-drag on admin/products. All four nested
  // levels are reorderable; top-level services are intentionally NOT
  // reorderable. Optimistic-local-update first, then Supabase bulk
  // sort_order writes; on error, rollback to prior order and re-throw.
  reorderOptionGroups: (serviceId: string, fromIndex: number, toIndex: number) => Promise<void>
  reorderOptions: (
    serviceId: string,
    groupId: string,
    fromIndex: number,
    toIndex: number
  ) => Promise<void>
  reorderSubGroups: (
    serviceId: string,
    groupId: string,
    optionId: string,
    fromIndex: number,
    toIndex: number
  ) => Promise<void>
  reorderSubOptions: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    fromIndex: number,
    toIndex: number
  ) => Promise<void>
  saveService: (serviceId: string) => Promise<void>

  // PR-#425 staged-mutation actions. Trash → stageDelete*. Dialog Save
  // (edit mode) → stageEdit*. Save Changes commits via saveService.
  stageDeleteService: (serviceId: string) => void
  stageDeleteGroup: (serviceId: string, groupId: string) => void
  stageDeleteOption: (serviceId: string, groupId: string, optionId: string) => void
  stageDeleteSubGroup: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string
  ) => void
  stageDeleteSubOption: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    subOptionId: string
  ) => void

  unstageDeleteService: (serviceId: string) => void
  unstageDeleteGroup: (serviceId: string, groupId: string) => void
  unstageDeleteOption: (serviceId: string, groupId: string, optionId: string) => void
  unstageDeleteSubGroup: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string
  ) => void
  unstageDeleteSubOption: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    subOptionId: string
  ) => void

  stageEditService: (
    serviceId: string,
    patch: Partial<Omit<ServiceConfig, 'id'>>
  ) => void
  stageEditGroup: (
    serviceId: string,
    groupId: string,
    patch: Partial<Omit<OptionGroup, 'id'>>
  ) => void
  stageEditOption: (
    serviceId: string,
    groupId: string,
    optionId: string,
    patch: Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
  ) => void
  stageEditSubGroup: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    patch: Partial<Omit<OptionGroup, 'id' | 'options'>>
  ) => void
  stageEditSubOption: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    subOptionId: string,
    patch: Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
  ) => void

  unstageEditService: (serviceId: string) => void
  unstageEditGroup: (serviceId: string, groupId: string) => void
  unstageEditOption: (serviceId: string, groupId: string, optionId: string) => void
  unstageEditSubGroup: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string
  ) => void
  unstageEditSubOption: (
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    subOptionId: string
  ) => void

  discardAllPendingForService: (serviceId: string) => void
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
/* Pending-key helpers (PR-#425)                                    */
/* ---------------------------------------------------------------- */

const sameKeys = (a: PendingKeys, b: PendingKeys, type: PendingNodeType): boolean => {
  if (a.serviceId !== b.serviceId) return false
  if (type === 'service') return true
  if (a.groupId !== b.groupId) return false
  if (type === 'group') return true
  if (a.optionId !== b.optionId) return false
  if (type === 'option') return true
  if (a.subGroupId !== b.subGroupId) return false
  if (type === 'subGroup') return true
  return a.subOptionId === b.subOptionId
}

const matchesPending = (
  entry: { type: PendingNodeType } & PendingKeys,
  type: PendingNodeType,
  keys: PendingKeys
): boolean => entry.type === type && sameKeys(entry, keys, type)

// Re-apply pending edits on top of a fresh services array so realtime/
// hydrateFromServer refetch doesn't clobber Rod's staged-but-uncommitted
// changes. Pending-deletes are NOT applied here — they're rendered as
// pending-delete styling and only removed from services on flush.
function applyPendingEditsToServices(
  services: ServiceConfig[],
  pendingEdits: PendingEdit[]
): ServiceConfig[] {
  if (pendingEdits.length === 0) return services
  let next: { services: ServiceConfig[] } = { services }
  for (const e of pendingEdits) {
    switch (e.type) {
      case 'service':
        next = localUpdateService(
          { ...(next as unknown as CatalogState), services: next.services },
          e.serviceId,
          e.patch
        )
        break
      case 'group':
        if (!e.groupId) break
        next = localUpdateOptionGroup(
          { ...(next as unknown as CatalogState), services: next.services },
          e.serviceId,
          e.groupId,
          e.patch
        )
        break
      case 'option':
        if (!e.groupId || !e.optionId) break
        next = localUpdateOption(
          { ...(next as unknown as CatalogState), services: next.services },
          e.serviceId,
          e.groupId,
          e.optionId,
          e.patch
        )
        break
      case 'subGroup':
        if (!e.groupId || !e.optionId || !e.subGroupId) break
        next = localUpdateSubGroup(
          { ...(next as unknown as CatalogState), services: next.services },
          e.serviceId,
          e.groupId,
          e.optionId,
          e.subGroupId,
          e.patch
        )
        break
      case 'subOption':
        if (!e.groupId || !e.optionId || !e.subGroupId || !e.subOptionId) break
        next = localUpdateSubOption(
          { ...(next as unknown as CatalogState), services: next.services },
          e.serviceId,
          e.groupId,
          e.optionId,
          e.subGroupId,
          e.subOptionId,
          e.patch
        )
        break
    }
  }
  return next.services
}

// Snapshot pre-stage entity values so stageEdit can store `prev` for Undo.
function snapshotEntity(
  services: ServiceConfig[],
  type: PendingNodeType,
  keys: PendingKeys
): Record<string, unknown> {
  const svc = services.find((s) => s.id === keys.serviceId)
  if (!svc) return {}
  if (type === 'service') {
    const { id: _id, ...rest } = svc
    void _id
    return rest as Record<string, unknown>
  }
  const grp = svc.optionGroups.find((g) => g.id === keys.groupId)
  if (!grp) return {}
  if (type === 'group') {
    const { id: _id, options: _options, ...rest } = grp
    void _id
    void _options
    return rest as Record<string, unknown>
  }
  const opt = grp.options.find((o) => o.id === keys.optionId)
  if (!opt) return {}
  if (type === 'option') {
    const { id: _id, subGroups: _sg, ...rest } = opt
    void _id
    void _sg
    return rest as Record<string, unknown>
  }
  const sg = (opt.subGroups ?? []).find((x) => x.id === keys.subGroupId)
  if (!sg) return {}
  if (type === 'subGroup') {
    const { id: _id, options: _options, ...rest } = sg
    void _id
    void _options
    return rest as Record<string, unknown>
  }
  const so = sg.options.find((x) => x.id === keys.subOptionId)
  if (!so) return {}
  const { id: _id, subGroups: _sg2, ...rest } = so
  void _id
  void _sg2
  return rest as Record<string, unknown>
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
      _pendingDeletes: [],
      _pendingEdits: [],

      hydrateFromServer: async () => {
        if (get().isHydrating) return
        set({ isHydrating: true, lastFetchError: null })
        try {
          // Server payload is the sole source of truth — admin add/edit/delete
          // on /admin/products propagates realtime to the homeowner /quote surface
          // because nothing locally re-fills the catalog from bundled defaults
          // after fetch. SERVICE_CATALOG remains only as an offline-bootstrap
          // fallback (initial state on first load before hydrate fires).
          const fresh = await api.fetchServiceCatalog()
          // PR-#425 — overlay any in-flight pending edits on top of the fresh
          // server payload so realtime refetch doesn't visually clobber staged-
          // but-uncommitted user changes. Pending-deletes stay marker-only.
          const withPending = applyPendingEditsToServices(fresh, get()._pendingEdits)
          set({ services: withPending, hasHydrated: true, isHydrating: false })
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

      // Reorder actions — optimistic local update, then await Supabase
      // bulk sort_order write. On error, rollback to prior order so the
      // store stays in sync with what the DB actually has.
      reorderOptionGroups: async (serviceId, fromIndex, toIndex) => {
        const prevServices = get().services
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId
              ? { ...s, optionGroups: arrayMove(s.optionGroups, fromIndex, toIndex) }
              : s
          ),
        }))
        try {
          const updated = get().services.find((s) => s.id === serviceId)?.optionGroups ?? []
          await api.reorderOptionGroupsApi(
            serviceId,
            updated.map((g) => g.id),
          )
        } catch (err) {
          set({ services: prevServices })
          throw err
        }
      },

      reorderOptions: async (serviceId, groupId, fromIndex, toIndex) => {
        const prevServices = get().services
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
        }))
        try {
          const updated =
            get().services
              .find((s) => s.id === serviceId)
              ?.optionGroups.find((g) => g.id === groupId)?.options ?? []
          await api.reorderOptionsApi(
            serviceId,
            groupId,
            updated.map((o) => o.id),
          )
        } catch (err) {
          set({ services: prevServices })
          throw err
        }
      },

      reorderSubGroups: async (serviceId, groupId, optionId, fromIndex, toIndex) => {
        const prevServices = get().services
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
        }))
        try {
          const updatedOpt = get()
            .services.find((s) => s.id === serviceId)
            ?.optionGroups.find((g) => g.id === groupId)
            ?.options.find((o) => o.id === optionId)
          await api.reorderSubGroupsApi(
            serviceId,
            groupId,
            optionId,
            (updatedOpt?.subGroups ?? []).map((sg) => sg.id),
          )
        } catch (err) {
          set({ services: prevServices })
          throw err
        }
      },

      reorderSubOptions: async (serviceId, groupId, optionId, subGroupId, fromIndex, toIndex) => {
        const prevServices = get().services
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
        }))
        try {
          const updatedSub = get()
            .services.find((s) => s.id === serviceId)
            ?.optionGroups.find((g) => g.id === groupId)
            ?.options.find((o) => o.id === optionId)
            ?.subGroups?.find((sg) => sg.id === subGroupId)
          await api.reorderSubOptionsApi(
            serviceId,
            groupId,
            optionId,
            subGroupId,
            (updatedSub?.options ?? []).map((so) => so.id),
          )
        } catch (err) {
          set({ services: prevServices })
          throw err
        }
      },

      // PR-#425 — Save Changes commits the entire staged batch for one
      // service: deletes (leaf-first) → substantive edits → reorders. Each
      // phase mirrors the existing brute-force programmatic-rewrite shape
      // (see Arc-32 _pendingWrites pattern in vendor-catalog-store). On
      // first error throws — partial-state is acceptable since user can
      // retry; subsequent retries are idempotent.
      saveService: async (serviceId) => {
        const state = get()
        const svc = state.services.find((s) => s.id === serviceId)
        if (!svc) throw new Error(`saveService: no service ${serviceId}`)

        // Phase 1 — flush pending deletes leaf-first so FK constraints
        // never trip. subOption → subGroup → option → group → service.
        const deleteOrder: PendingNodeType[] = [
          'subOption',
          'subGroup',
          'option',
          'group',
          'service',
        ]
        const myDeletes = state._pendingDeletes.filter((d) => d.serviceId === serviceId)
        for (const t of deleteOrder) {
          const batch = myDeletes.filter((d) => d.type === t)
          await Promise.all(
            batch.map((d) => {
              switch (d.type) {
                case 'subOption':
                  return api.deleteSubOption(
                    d.serviceId,
                    d.groupId!,
                    d.optionId!,
                    d.subGroupId!,
                    d.subOptionId!
                  )
                case 'subGroup':
                  return api.deleteSubGroup(
                    d.serviceId,
                    d.groupId!,
                    d.optionId!,
                    d.subGroupId!
                  )
                case 'option':
                  return api.deleteOption(d.serviceId, d.groupId!, d.optionId!)
                case 'group':
                  return api.deleteOptionGroup(d.serviceId, d.groupId!)
                case 'service':
                  return api.deleteService(d.serviceId)
              }
            })
          )
          // After each level's deletes land in substrate, prune from local
          // services so the next phase's edits/reorders don't reference
          // already-gone nodes.
          for (const d of batch) {
            switch (d.type) {
              case 'subOption':
                set((s) =>
                  localRemoveSubOption(
                    s,
                    d.serviceId,
                    d.groupId!,
                    d.optionId!,
                    d.subGroupId!,
                    d.subOptionId!
                  )
                )
                break
              case 'subGroup':
                set((s) =>
                  localRemoveSubGroup(
                    s,
                    d.serviceId,
                    d.groupId!,
                    d.optionId!,
                    d.subGroupId!
                  )
                )
                break
              case 'option':
                set((s) =>
                  localRemoveOption(s, d.serviceId, d.groupId!, d.optionId!)
                )
                break
              case 'group':
                set((s) => localRemoveOptionGroup(s, d.serviceId, d.groupId!))
                break
              case 'service':
                set((s) => localRemoveService(s, d.serviceId))
                break
            }
          }
        }

        // Phase 2 — flush substantive edits (label/description/priceUnit/etc).
        // Order within phase doesn't matter for updates; parallelize per-level
        // mirroring bulkSortOrder shape.
        const myEdits = get()._pendingEdits.filter((e) => e.serviceId === serviceId)
        await Promise.all(
          myEdits.map((e) => {
            switch (e.type) {
              case 'service':
                return api.updateService(e.serviceId, e.patch as Partial<Omit<ServiceConfig, 'id'>>)
              case 'group':
                return api.updateOptionGroup(
                  e.serviceId,
                  e.groupId!,
                  e.patch as Partial<Omit<OptionGroup, 'id'>>
                )
              case 'option':
                return api.updateOption(
                  e.serviceId,
                  e.groupId!,
                  e.optionId!,
                  e.patch as Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
                )
              case 'subGroup':
                return api.updateSubGroup(
                  e.serviceId,
                  e.groupId!,
                  e.optionId!,
                  e.subGroupId!,
                  e.patch as Partial<Omit<OptionGroup, 'id' | 'options'>>
                )
              case 'subOption':
                return api.updateSubOption(
                  e.serviceId,
                  e.groupId!,
                  e.optionId!,
                  e.subGroupId!,
                  e.subOptionId!,
                  e.patch as Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
                )
            }
          })
        )

        // Phase 3 — idempotent re-fire of the service's nested sort_order
        // to Supabase. Picks up any drag-reorders the user did in this
        // session. Reload of services from get() so post-delete shape is
        // respected.
        const svcAfter = get().services.find((s) => s.id === serviceId)
        if (svcAfter) {
          await api.reorderOptionGroupsApi(
            serviceId,
            svcAfter.optionGroups.map((g) => g.id),
          )
          for (const group of svcAfter.optionGroups) {
            await api.reorderOptionsApi(
              serviceId,
              group.id,
              group.options.map((o) => o.id),
            )
            for (const opt of group.options) {
              const subGroups = opt.subGroups ?? []
              if (subGroups.length > 0) {
                await api.reorderSubGroupsApi(
                  serviceId,
                  group.id,
                  opt.id,
                  subGroups.map((sg) => sg.id),
                )
                for (const sg of subGroups) {
                  if (sg.options.length > 0) {
                    await api.reorderSubOptionsApi(
                      serviceId,
                      group.id,
                      opt.id,
                      sg.id,
                      sg.options.map((so) => so.id),
                    )
                  }
                }
              }
            }
          }
        }

        // All phases landed — clear this service's pending queues.
        set((s) => ({
          _pendingDeletes: s._pendingDeletes.filter((d) => d.serviceId !== serviceId),
          _pendingEdits: s._pendingEdits.filter((e) => e.serviceId !== serviceId),
        }))
      },

      /* ---- PR-#425 stage/unstage actions ---- */

      stageDeleteService: (serviceId) => {
        set((s) => {
          const keys: PendingKeys = { serviceId }
          if (s._pendingDeletes.some((d) => matchesPending(d, 'service', keys))) return s
          // Cancel any pending edit on the same node — delete supersedes edit.
          return {
            _pendingDeletes: [...s._pendingDeletes, { type: 'service', ...keys }],
            _pendingEdits: s._pendingEdits.filter(
              (e) => !matchesPending(e, 'service', keys)
            ),
          }
        })
      },
      stageDeleteGroup: (serviceId, groupId) => {
        set((s) => {
          const keys: PendingKeys = { serviceId, groupId }
          if (s._pendingDeletes.some((d) => matchesPending(d, 'group', keys))) return s
          return {
            _pendingDeletes: [...s._pendingDeletes, { type: 'group', ...keys }],
            _pendingEdits: s._pendingEdits.filter((e) => !matchesPending(e, 'group', keys)),
          }
        })
      },
      stageDeleteOption: (serviceId, groupId, optionId) => {
        set((s) => {
          const keys: PendingKeys = { serviceId, groupId, optionId }
          if (s._pendingDeletes.some((d) => matchesPending(d, 'option', keys))) return s
          return {
            _pendingDeletes: [...s._pendingDeletes, { type: 'option', ...keys }],
            _pendingEdits: s._pendingEdits.filter((e) => !matchesPending(e, 'option', keys)),
          }
        })
      },
      stageDeleteSubGroup: (serviceId, groupId, optionId, subGroupId) => {
        set((s) => {
          const keys: PendingKeys = { serviceId, groupId, optionId, subGroupId }
          if (s._pendingDeletes.some((d) => matchesPending(d, 'subGroup', keys))) return s
          return {
            _pendingDeletes: [...s._pendingDeletes, { type: 'subGroup', ...keys }],
            _pendingEdits: s._pendingEdits.filter(
              (e) => !matchesPending(e, 'subGroup', keys)
            ),
          }
        })
      },
      stageDeleteSubOption: (serviceId, groupId, optionId, subGroupId, subOptionId) => {
        set((s) => {
          const keys: PendingKeys = { serviceId, groupId, optionId, subGroupId, subOptionId }
          if (s._pendingDeletes.some((d) => matchesPending(d, 'subOption', keys))) return s
          return {
            _pendingDeletes: [...s._pendingDeletes, { type: 'subOption', ...keys }],
            _pendingEdits: s._pendingEdits.filter(
              (e) => !matchesPending(e, 'subOption', keys)
            ),
          }
        })
      },

      unstageDeleteService: (serviceId) =>
        set((s) => ({
          _pendingDeletes: s._pendingDeletes.filter(
            (d) => !matchesPending(d, 'service', { serviceId })
          ),
        })),
      unstageDeleteGroup: (serviceId, groupId) =>
        set((s) => ({
          _pendingDeletes: s._pendingDeletes.filter(
            (d) => !matchesPending(d, 'group', { serviceId, groupId })
          ),
        })),
      unstageDeleteOption: (serviceId, groupId, optionId) =>
        set((s) => ({
          _pendingDeletes: s._pendingDeletes.filter(
            (d) => !matchesPending(d, 'option', { serviceId, groupId, optionId })
          ),
        })),
      unstageDeleteSubGroup: (serviceId, groupId, optionId, subGroupId) =>
        set((s) => ({
          _pendingDeletes: s._pendingDeletes.filter(
            (d) =>
              !matchesPending(d, 'subGroup', { serviceId, groupId, optionId, subGroupId })
          ),
        })),
      unstageDeleteSubOption: (serviceId, groupId, optionId, subGroupId, subOptionId) =>
        set((s) => ({
          _pendingDeletes: s._pendingDeletes.filter(
            (d) =>
              !matchesPending(d, 'subOption', {
                serviceId,
                groupId,
                optionId,
                subGroupId,
                subOptionId,
              })
          ),
        })),

      stageEditService: (serviceId, patch) => {
        const keys: PendingKeys = { serviceId }
        const state = get()
        const existing = state._pendingEdits.find((e) =>
          matchesPending(e, 'service', keys)
        )
        const prev = existing?.prev ?? snapshotEntity(state.services, 'service', keys)
        set((s) => ({
          services: localUpdateService(s, serviceId, patch).services,
          _pendingEdits: [
            ...s._pendingEdits.filter((e) => !matchesPending(e, 'service', keys)),
            {
              type: 'service',
              ...keys,
              patch: { ...(existing?.patch ?? {}), ...(patch as Record<string, unknown>) },
              prev,
            },
          ],
        }))
      },
      stageEditGroup: (serviceId, groupId, patch) => {
        const keys: PendingKeys = { serviceId, groupId }
        const state = get()
        const existing = state._pendingEdits.find((e) =>
          matchesPending(e, 'group', keys)
        )
        const prev = existing?.prev ?? snapshotEntity(state.services, 'group', keys)
        set((s) => ({
          services: localUpdateOptionGroup(s, serviceId, groupId, patch).services,
          _pendingEdits: [
            ...s._pendingEdits.filter((e) => !matchesPending(e, 'group', keys)),
            {
              type: 'group',
              ...keys,
              patch: { ...(existing?.patch ?? {}), ...(patch as Record<string, unknown>) },
              prev,
            },
          ],
        }))
      },
      stageEditOption: (serviceId, groupId, optionId, patch) => {
        const keys: PendingKeys = { serviceId, groupId, optionId }
        const state = get()
        const existing = state._pendingEdits.find((e) =>
          matchesPending(e, 'option', keys)
        )
        const prev = existing?.prev ?? snapshotEntity(state.services, 'option', keys)
        set((s) => ({
          services: localUpdateOption(s, serviceId, groupId, optionId, patch).services,
          _pendingEdits: [
            ...s._pendingEdits.filter((e) => !matchesPending(e, 'option', keys)),
            {
              type: 'option',
              ...keys,
              patch: { ...(existing?.patch ?? {}), ...(patch as Record<string, unknown>) },
              prev,
            },
          ],
        }))
      },
      stageEditSubGroup: (serviceId, groupId, optionId, subGroupId, patch) => {
        const keys: PendingKeys = { serviceId, groupId, optionId, subGroupId }
        const state = get()
        const existing = state._pendingEdits.find((e) =>
          matchesPending(e, 'subGroup', keys)
        )
        const prev = existing?.prev ?? snapshotEntity(state.services, 'subGroup', keys)
        set((s) => ({
          services: localUpdateSubGroup(s, serviceId, groupId, optionId, subGroupId, patch)
            .services,
          _pendingEdits: [
            ...s._pendingEdits.filter((e) => !matchesPending(e, 'subGroup', keys)),
            {
              type: 'subGroup',
              ...keys,
              patch: { ...(existing?.patch ?? {}), ...(patch as Record<string, unknown>) },
              prev,
            },
          ],
        }))
      },
      stageEditSubOption: (
        serviceId,
        groupId,
        optionId,
        subGroupId,
        subOptionId,
        patch
      ) => {
        const keys: PendingKeys = { serviceId, groupId, optionId, subGroupId, subOptionId }
        const state = get()
        const existing = state._pendingEdits.find((e) =>
          matchesPending(e, 'subOption', keys)
        )
        const prev = existing?.prev ?? snapshotEntity(state.services, 'subOption', keys)
        set((s) => ({
          services: localUpdateSubOption(
            s,
            serviceId,
            groupId,
            optionId,
            subGroupId,
            subOptionId,
            patch
          ).services,
          _pendingEdits: [
            ...s._pendingEdits.filter((e) => !matchesPending(e, 'subOption', keys)),
            {
              type: 'subOption',
              ...keys,
              patch: { ...(existing?.patch ?? {}), ...(patch as Record<string, unknown>) },
              prev,
            },
          ],
        }))
      },

      // Unstage edit = roll the local entity back to its snapshotted prev
      // values, then drop the pending-edit record. Mirrors the stage path
      // in reverse.
      unstageEditService: (serviceId) => {
        const state = get()
        const keys: PendingKeys = { serviceId }
        const entry = state._pendingEdits.find((e) => matchesPending(e, 'service', keys))
        if (!entry) return
        set((s) => ({
          services: localUpdateService(s, serviceId, entry.prev).services,
          _pendingEdits: s._pendingEdits.filter((e) => !matchesPending(e, 'service', keys)),
        }))
      },
      unstageEditGroup: (serviceId, groupId) => {
        const state = get()
        const keys: PendingKeys = { serviceId, groupId }
        const entry = state._pendingEdits.find((e) => matchesPending(e, 'group', keys))
        if (!entry) return
        set((s) => ({
          services: localUpdateOptionGroup(s, serviceId, groupId, entry.prev).services,
          _pendingEdits: s._pendingEdits.filter((e) => !matchesPending(e, 'group', keys)),
        }))
      },
      unstageEditOption: (serviceId, groupId, optionId) => {
        const state = get()
        const keys: PendingKeys = { serviceId, groupId, optionId }
        const entry = state._pendingEdits.find((e) => matchesPending(e, 'option', keys))
        if (!entry) return
        set((s) => ({
          services: localUpdateOption(s, serviceId, groupId, optionId, entry.prev).services,
          _pendingEdits: s._pendingEdits.filter((e) => !matchesPending(e, 'option', keys)),
        }))
      },
      unstageEditSubGroup: (serviceId, groupId, optionId, subGroupId) => {
        const state = get()
        const keys: PendingKeys = { serviceId, groupId, optionId, subGroupId }
        const entry = state._pendingEdits.find((e) => matchesPending(e, 'subGroup', keys))
        if (!entry) return
        set((s) => ({
          services: localUpdateSubGroup(
            s,
            serviceId,
            groupId,
            optionId,
            subGroupId,
            entry.prev
          ).services,
          _pendingEdits: s._pendingEdits.filter(
            (e) => !matchesPending(e, 'subGroup', keys)
          ),
        }))
      },
      unstageEditSubOption: (serviceId, groupId, optionId, subGroupId, subOptionId) => {
        const state = get()
        const keys: PendingKeys = { serviceId, groupId, optionId, subGroupId, subOptionId }
        const entry = state._pendingEdits.find((e) =>
          matchesPending(e, 'subOption', keys)
        )
        if (!entry) return
        set((s) => ({
          services: localUpdateSubOption(
            s,
            serviceId,
            groupId,
            optionId,
            subGroupId,
            subOptionId,
            entry.prev
          ).services,
          _pendingEdits: s._pendingEdits.filter(
            (e) => !matchesPending(e, 'subOption', keys)
          ),
        }))
      },

      discardAllPendingForService: (serviceId) => {
        const state = get()
        // Roll back any pending-edits' local state to their prev snapshots
        // before clearing the queues.
        let services = state.services
        const edits = state._pendingEdits.filter((e) => e.serviceId === serviceId)
        for (const e of edits) {
          switch (e.type) {
            case 'service':
              services = localUpdateService(
                { ...state, services } as CatalogState,
                e.serviceId,
                e.prev
              ).services
              break
            case 'group':
              if (!e.groupId) break
              services = localUpdateOptionGroup(
                { ...state, services } as CatalogState,
                e.serviceId,
                e.groupId,
                e.prev
              ).services
              break
            case 'option':
              if (!e.groupId || !e.optionId) break
              services = localUpdateOption(
                { ...state, services } as CatalogState,
                e.serviceId,
                e.groupId,
                e.optionId,
                e.prev
              ).services
              break
            case 'subGroup':
              if (!e.groupId || !e.optionId || !e.subGroupId) break
              services = localUpdateSubGroup(
                { ...state, services } as CatalogState,
                e.serviceId,
                e.groupId,
                e.optionId,
                e.subGroupId,
                e.prev
              ).services
              break
            case 'subOption':
              if (!e.groupId || !e.optionId || !e.subGroupId || !e.subOptionId) break
              services = localUpdateSubOption(
                { ...state, services } as CatalogState,
                e.serviceId,
                e.groupId,
                e.optionId,
                e.subGroupId,
                e.subOptionId,
                e.prev
              ).services
              break
          }
        }
        set((s) => ({
          services,
          _pendingDeletes: s._pendingDeletes.filter((d) => d.serviceId !== serviceId),
          _pendingEdits: s._pendingEdits.filter((e) => e.serviceId !== serviceId),
        }))
      },

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
      // Ship #261 — version bump 10→11 paired-edit: the #260 migration worked
      // for homeowner-only users but got wiped when admin/products fetched
      // Supabase services (still 11 pre-Blinds entries). #261 adds
      // union-fill-gaps on hydrateFromServer AND onRehydrateStorage so
      // bundled-only services persist across fetch/rehydrate cycles. Version
      // bump forces one more migration so existing stale-state users get
      // reset alongside the new union logic.
      //
      // Ship — version bump 11→12 paired-edit: PR #111 added pool_fence to
      // pool addons (7th option) and square_concrete to pool floors AND
      // driveways surface in SERVICE_CATALOG. Existing persisted v11 catalogs
      // still serve the pre-#111 6-option pool-addons + driveways-surface
      // arrays, so the new chips never render despite the bundle carrying
      // them. Version bump forces one-time migrate() reset to bundled.
      //
      // Future same-class fixes: when changing SERVICE_CATALOG defaults,
      // bump this version to force persisted-state eviction.
      //
      // Ship — version bump 12→13 paired-edit: PR #117 added
      // water_feature_units optionGroup to pool service in SERVICE_CATALOG
      // (laminar_jet + waterfall_unit). Existing persisted v12 catalogs
      // still serve the pre-#117 pool option_groups, so the new vendor
      // priceable products never render. Version bump forces migrate()
      // reset to bundled.
      //
      // Ship — version bump 13→14 paired-edit: PR #118 fix-forward on
      // permit shape (per-option → per-service). Vendor-catalog-store
      // schema changed (permitPricing record dropped, permitCents flat
      // added); bump catalog-store version too so any in-flight
      // persisted catalog state from the brief #117 window evicts
      // cleanly alongside the vendor-store reshape.
      //
      // Ship — version bump 15→16 paired-edit: Rodolfo directive 2026-05-07
      // — add "Aluminum" as 4th main-material option to Roof Measurement
      // wizard + SERVICE_CATALOG.roofing.material. Existing persisted v15
      // catalogs would render the 5-option roofing list (no aluminum) until
      // re-hydration. Version bump forces migrate() reset to bundled.
      //
      // Ship — version bump 17→18 paired-edit with Arc-32 union-fill rip:
      // server payload becomes sole source of truth for admin add/edit/delete
      // → realtime homeowner propagation. Migrate evicts any persisted state
      // that may have bundled-fill entries baked in from prior union-merge
      // semantics; hydrateFromServer re-fetches authoritative catalog on
      // next load. Initial-state SERVICE_CATALOG bootstrap stays as offline
      // fallback for cold opens before hydrate fires.
      version: 18,
      // Persist only the services array and the hasHydrated flag; transient
      // state (isHydrating, lastFetchError) stays in-memory only.
      partialize: (state) => ({
        services: state.services,
        hasHydrated: state.hasHydrated,
      }),
      // Migrate resets to bundled SERVICE_CATALOG so existing users get a
      // clean offline-fallback; hydrateFromServer overwrites on next load.
      migrate: () => ({
        services: SERVICE_CATALOG,
        hasHydrated: false,
      }),
    }
  )
)
