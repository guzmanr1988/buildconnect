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
  // Roof measurement wizard output — area + pitch captured before manual config.
  // Stored regardless of material so pitch is preserved for all material types.
  roofMeasurement?: { areaSqft: number; pitch: string; address: string; perimeterFt?: number; pitchedAreaSqft?: number; flatAreaSqft?: number; includeFlat?: boolean }
  // Permit choice captured from roof wizard. 'yes' = permit pulled; 'no' = cash-only (no financing).
  // Optional for widen-reads: absent on legacy items; treat as 'yes' on read (no surprise downgrade).
  roofPermit?: 'yes' | 'no'
  // Liability waiver — populated when roofPermit = 'no'. Null when permit is yes or not yet set.
  permitWaiver?: { acknowledged: boolean; signedName: string; signedAt: string } | null
  // Linear feet per roofing addon (gutters, soffit_wood, fascia_wood). Keyed by option id.
  roofAddonLinearFt?: Record<string, number>
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
  addedAt: string
  itemPhotos?: string[]
  itemNotes?: string
}

interface CartState {
  items: CartItem[]
  projectTitle: string
  notes: string
  photos: string[]
  idDocument: string | null
  setIdDocument: (dataUrl: string | null) => void
  addItem: (item: Omit<CartItem, 'id' | 'addedAt'>) => void
  removeItem: (id: string) => void
  updateItem: (id: string, updates: Partial<CartItem>) => void
  setProjectTitle: (title: string) => void
  setNotes: (notes: string) => void
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
      addPhoto: (dataUrl) => set((state) => ({ photos: state.photos.length < 20 ? [...state.photos, dataUrl] : state.photos })),
      removePhoto: (index) => set((state) => ({ photos: state.photos.filter((_, i) => i !== index) })),

      clearCart: () => set({ items: [], projectTitle: '', notes: '', photos: [], idDocument: null }),

      itemCount: () => get().items.length,
    }),
    {
      name: 'buildconnect-cart',
    }
  )
)
