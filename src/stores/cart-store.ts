import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ConfiguratorEntry {
  id: string
  size: string
  type: string
  frameColor: string
  glassColor: string
  glassType: string
  quantity: number
}

export interface AddonQuantities {
  ledCount?: number
  bubblerCount?: number
  laminarJets?: number
  waterfalls?: number
}

export interface CartItemAddress {
  label: string  // "Primary" or SecondaryAddress.label
  full: string   // single-line display string
}

export interface CartItem {
  id: string
  serviceId: string
  serviceName: string
  selections: Record<string, string[]>
  // Per-option quantities for options flagged requiresQuantity in option-metadata
  // (e.g. install_windows / install_doors). Keyed by option_id. Absent for options
  // that don't need a quantity.
  selectionQuantities?: Record<string, number>
  windowSelections?: ConfiguratorEntry[]
  doorSelections?: ConfiguratorEntry[]
  garageDoorSelection?: { type: string; size: string; color: string; glass: string }
  metalRoofSelection?: { color: string; roofSize: string }
  // Architectural Shingle color id from GAF Timberline HDZ palette. Optional;
  // populated when the homeowner picks Shingle in the roof wizard. Sibling of
  // metalRoofSelection (different shape — shingle has color only, area is
  // measured by the wizard, not configurator-entered).
  shingleColor?: string
  // Roof measurement wizard output — area + pitch captured before manual config.
  // Stored regardless of material so pitch is preserved for all material types.
  roofMeasurement?: { areaSqft: number; pitch: string; address: string; perimeterFt?: number; pitchedAreaSqft?: number; flatAreaSqft?: number; includeFlat?: boolean }
  // Permit choice captured from roof wizard. 'yes' = permit pulled; 'no' = cash-only (no financing).
  // Optional for widen-reads: absent on legacy items; treat as 'yes' on read (no surprise downgrade).
  roofPermit?: 'yes' | 'no'
  // Liability waiver — populated when roofPermit = 'no'. Null when permit is yes or not yet set.
  permitWaiver?: { acknowledged: boolean; signedName: string; signedAt: string } | null
  // Linear feet per roofing addon (gutters, soffit_wood, fascia_wood, soffit_metal,
  // fascia_metal). Keyed by option id. For gutters this stores the perimeter base;
  // pricing layer adds drops × per-floor extension via gutterDropsConfig below.
  roofAddonLinearFt?: Record<string, number>
  // Linear feet for non-roofing addons priced per linear ft (e.g. pool_fence).
  // Keyed by option id. Pricing layer reads this OR roofAddonLinearFt for any
  // option flagged priceUnit:'linear_ft' in OPTION_METADATA.
  addonLinearFt?: Record<string, number>
  // Per-option-id sqft for custom-sized products that bill per sqft (e.g. pool
  // size 'custom', pool floor surfaces, square_concrete). Sibling to areaSqft
  // for cases where a single cart item carries MULTIPLE independent sqft
  // measurements (pool size vs pool floor — different prices, different areas).
  customSizeSqft?: Record<string, number>
  // Gutter math: total lin ft = perimeter + drops × per-floor (see GUTTER_DROP_FT_BY_FLOORS
  // in lib/roof-pricing.ts). Populated on BOTH flow paths when gutters selected.
  gutterDropsConfig?: { floors: 1 | 2; drops: number }
  addonQuantities?: AddonQuantities
  // Which property this line item applies to. Phase B2: primary OR one of
  // profile.additional_addresses, selected at add-to-project time. Optional
  // because older cart items predating the selector have no address.
  address?: CartItemAddress
  // Geocoded lat/lng for the project address — populated at add-to-cart
  // time when googleMapsPlatform + realGeocoding flags are ON. Used by
  // vendor-compare for per-project distance filtering. Optional for
  // widen-reads-narrow-writes on legacy items.
  projectLat?: number
  projectLng?: number
  // Satellite-measured area for area-based services (driveways, pergolas).
  areaSqft?: number
  // Satellite-measured perimeter for linear services (fencing). Primary value for fencing items.
  perimeterFt?: number
  addedAt: string
  itemPhotos?: string[]
  itemNotes?: string
}

export type ProjectPermitChoice = 'yes' | 'no'

export interface ProjectPermitWaiver {
  acknowledged: boolean
  signedName: string
  signedAt: string
}

interface CartState {
  items: CartItem[]
  projectTitle: string
  notes: string
  photos: string[]
  idDocument: string | null
  // Project-level permit choice — replaces the per-item roofPermit pattern.
  // Asked once per cart at submit time when at least one item triggers the
  // permit Q (see shouldAskProjectPermit). 'yes' = vendor pulls permit;
  // 'no' = cash-only path, blocks PACE financing.
  projectPermit: ProjectPermitChoice | null
  // Captured when projectPermit === 'no'. Single waiver covers the whole
  // project (all items in cart). Null when permit is yes or not yet set.
  projectPermitWaiver: ProjectPermitWaiver | null
  setIdDocument: (dataUrl: string | null) => void
  addItem: (item: Omit<CartItem, 'id' | 'addedAt'>) => void
  removeItem: (id: string) => void
  updateItem: (id: string, updates: Partial<CartItem>) => void
  setProjectTitle: (title: string) => void
  setNotes: (notes: string) => void
  setProjectPermit: (choice: ProjectPermitChoice | null) => void
  setProjectPermitWaiver: (waiver: ProjectPermitWaiver | null) => void
  addPhoto: (dataUrl: string) => void
  removePhoto: (index: number) => void
  clearCart: () => void
  itemCount: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      projectTitle: '',
      notes: '',
      photos: [],
      idDocument: null,
      projectPermit: null,
      projectPermitWaiver: null,
      setIdDocument: (dataUrl) => set({ idDocument: dataUrl }),

      addItem: (item) => {
        const newItem: CartItem = {
          ...item,
          id: crypto.randomUUID(),
          addedAt: new Date().toISOString(),
        }
        set((state) => ({ items: [...state.items, newItem] }))
      },

      removeItem: (id) => {
        set((state) => ({ items: state.items.filter((i) => i.id !== id) }))
      },

      updateItem: (id, updates) => {
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        }))
      },

      setProjectTitle: (title) => set({ projectTitle: title }),
      setNotes: (notes) => set({ notes }),
      setProjectPermit: (choice) => set({ projectPermit: choice }),
      setProjectPermitWaiver: (waiver) => set({ projectPermitWaiver: waiver }),
      addPhoto: (dataUrl) => set((state) => ({ photos: state.photos.length < 20 ? [...state.photos, dataUrl] : state.photos })),
      removePhoto: (index) => set((state) => ({ photos: state.photos.filter((_, i) => i !== index) })),

      clearCart: () =>
        set({
          items: [],
          projectTitle: '',
          notes: '',
          photos: [],
          idDocument: null,
          projectPermit: null,
          projectPermitWaiver: null,
        }),

      itemCount: () => get().items.length,
    }),
    {
      name: 'buildconnect-cart',
      version: 1,
      // PR1 of project-level-permit migration: lift the first non-null
      // per-item roofPermit + permitWaiver onto project-level state so
      // legacy carts created before this version still answer the
      // project-level Q without a re-prompt. Future cycles (PR4) will
      // drop CartItem.roofPermit entirely after one persist version of
      // widen-reads compat.
      migrate: (persistedState: unknown, version: number) => {
        const state = (persistedState ?? {}) as Partial<CartState> & {
          items?: CartItem[]
        }
        if (version < 1) {
          const items = state.items ?? []
          const firstPermit = items.find((i) => i.roofPermit)?.roofPermit ?? null
          const firstWaiver =
            items.find((i) => i.permitWaiver)?.permitWaiver ?? null
          return {
            ...state,
            projectPermit: firstPermit,
            projectPermitWaiver: firstWaiver,
          }
        }
        return state
      },
    },
  )
)
