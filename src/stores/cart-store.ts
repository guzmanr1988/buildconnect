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

export interface CartItem {
  id: string
  serviceId: string
  serviceName: string
  selections: Record<string, string[]>
  windowSelections?: ConfiguratorEntry[]
  doorSelections?: ConfiguratorEntry[]
  garageDoorSelection?: { type: string; size: string; color: string; glass: string }
  metalRoofSelection?: { color: string; roofSize: string }
  addonQuantities?: AddonQuantities
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
