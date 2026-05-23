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
  stormFrontSelections?: ConfiguratorEntry[]
  garageDoorSelection?: { type: string; size: string; color: string; glass: string }
  metalRoofSelection?: { color: string; roofSize: string }
  shingleSelection?: { color: string; roofSize: string }
  tileSelection?: { tileType: 'flat' | 'spanish' | 'mission'; tileColor: string; roofSize: string }
  aluminumSelection?: { color: string; roofSize: string }
  flatRoofSelection?: { membraneType: 'tpo' | 'epdm' | 'modified_bitumen'; roofSize: string }
  // Legacy widen-reads fields — preserved so cart items persisted before the
  // shingleSelection / tileSelection consolidation still render correctly on
  // every consumer surface (homeowner cart, vendor inbox, project-detail
  // dialog). Write-side now sets the consolidated selection objects above.
  shingleColor?: string
  tileType?: 'flat' | 'spanish' | 'mission'
  tileColor?: string
  // Roof measurement wizard output — area + pitch captured before manual config.
  // Stored regardless of material so pitch is preserved for all material types.
  roofMeasurement?: { areaSqft: number; pitch: string; address: string; perimeterFt?: number; pitchedAreaSqft?: number; flatAreaSqft?: number; includeMaterialOrder?: boolean; includePerimeter?: boolean; includeFlatArea?: boolean }
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
  // Google Static Maps URL captured at polygon-confirm with the drawn
  // overlay baked in (driveways, pergolas, fencing — anything that uses
  // PolygonDraw). Rendered on vendor lead-inbox with "Measured area"
  // caption above the regular itemPhotos grid. URL-storage (200-800
  // bytes/item) — picked over base64 to keep persisted-cart payload
  // clear of the PR-194/195/196 5MB LS-quota cliff.
  measurementMapUrl?: string
  // Per-polygon static-map URLs for multi-polygon measurements (pergolas
  // with 2 structures). Each entry is a single-polygon overlay so the
  // consumer surface can render one map per structure with a color
  // caption. Empty/undefined for single-polygon items — legacy
  // measurementMapUrl above remains the SoT for those.
  measurementMapUrls?: Array<{ mapUrl: string; color: string; sqft: number }>
  // Per-structure measurement breakdown (pergolas multi-structure). Keyed
  // by structure option_id (e.g. 'aluminum_terrace'). Pricing reads from
  // here when present to sum same-rate sqft across structures; absence
  // falls back to scalar areaSqft (legacy single-structure path).
  structureMeasurements?: Record<string, { sqft: number; color: string }>
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
      version: 8,
      // PR #196 — strip heavyweight base64 fields (idDocument, photos[],
      // items[].itemPhotos[]) from the persisted shape. PR #195 nuke
      // unblocked once but cart-store had no partialize, so first send
      // post-nuke re-bloated LS via cart-store persist write (idDocument
      // up to 2MB + uncapped per-item photos). In-memory only: photos
      // and ID re-upload on reload, mirrors PR #194 trade-off. Persisted:
      // items meta (sans itemPhotos), projectTitle, notes, projectPermit,
      // projectPermitWaiver.
      partialize: (state) => ({
        ...state,
        idDocument: null,
        photos: [],
        items: state.items.map((item) => ({
          ...item,
          itemPhotos: undefined,
        })),
      }),
      // Pre-launch hygiene policy (v8): treat any v<7 entry as a stale
      // demo/test artifact and drop entirely on first mount rather than
      // running a multi-step migration chain that may not align with the
      // current CartItem interface anymore. Since BuildConnect is still
      // pre-launch, there are no real-user carts to preserve at v<7 —
      // safe to fresh-mount. v7 → v8 is a no-op cache-invalidation bump.
      migrate: (persistedState: unknown, version: number) => {
        if (version < 7) {
          return {
            items: [],
            projectTitle: '',
            notes: '',
            photos: [],
            idDocument: null,
            projectPermit: null,
            projectPermitWaiver: null,
          } as Partial<CartState>
        }
        const state = (persistedState ?? {}) as Partial<CartState> & {
          items?: CartItem[]
        }
        return state
      },
    },
  )
)
