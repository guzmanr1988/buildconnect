import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

// Tracks which services and options a vendor has enabled, with their pricing
export interface VendorServiceConfig {
  serviceId: string
  enabled: boolean
  enabledOptions: Record<string, string[]> // groupId -> array of enabled optionIds
  pricing: Record<string, number> // optionId -> price in cents (Supabase canonical)
  // Optional percentage-markup price. Currently only used on Low-E Glass
  // sub-option in /vendor/catalog — Rod directive: vendor can price Low-E
  // either as $ OR as % markup over another baseline. Extensible to other
  // options that need dual $ / % pricing.
  pricingPercent?: Record<string, number> // optionId -> percent
}

interface VendorCatalogState {
  services: VendorServiceConfig[]
  // Supabase wire — set on hydrateFromSupabase, used for fire-and-forget upserts in setPrice.
  _vendorUuid: string | null
  // Cache of (serviceId|optionId) -> options.id (DB UUID). Built during hydration
  // so setPrice can upsert by option DB UUID without a round-trip lookup.
  _optionDbIdCache: Record<string, string>
  // One-time flag: have we migrated localStorage pricing to Supabase?
  _migrationDone: boolean

  initFromAdmin: (adminServices: { id: string }[]) => void
  toggleService: (serviceId: string) => void
  toggleOption: (serviceId: string, groupId: string, optionId: string) => void
  setPrice: (serviceId: string, optionId: string, price: number) => void
  setPricePercent: (serviceId: string, optionId: string, percent: number) => void
  isServiceEnabled: (serviceId: string) => boolean
  isOptionEnabled: (serviceId: string, groupId: string, optionId: string) => boolean
  getPrice: (serviceId: string, optionId: string) => number
  getPricePercent: (serviceId: string, optionId: string) => number
  // PRODUCT-IS-GOD Phase C (PR 4): single SoT for "is this vendor product-ready."
  // True if ≥1 service is enabled AND has ≥1 priced option (pricing cents > 0).
  // Pure computed — no mutation. Consumer: PR 5 admin-moderation-store auto-flip.
  hasActiveProducts: () => boolean
  // Supabase hydration — call on vendor login. Loads prices from DB,
  // builds option UUID cache, and migrates any localStorage-only prices
  // to Supabase on first run.
  hydrateFromSupabase: (vendorUuid: string) => Promise<void>
}

type DbPriceRow = {
  price_cents: number
  active: boolean
  options: { id: string; option_id: string; option_groups: { group_id: string; service_id: string } }
}

type DbOptionRow = {
  id: string
  option_id: string
  option_groups: { group_id: string; service_id: string }
}

function cacheKey(serviceId: string, optionId: string) {
  return `${serviceId}|${optionId}`
}

export const useVendorCatalogStore = create<VendorCatalogState>()(
  persist(
    (set, get) => ({
      services: [],
      _vendorUuid: null,
      _optionDbIdCache: {},
      _migrationDone: false,

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
        // Sync local state first (fast, no await).
        set((state) => ({
          services: state.services.map((s) =>
            s.serviceId === serviceId
              ? { ...s, pricing: { ...s.pricing, [optionId]: price } }
              : s
          ),
        }))
        // Fire-and-forget Supabase upsert. Supabase is canonical; local state is cache.
        const { _vendorUuid, _optionDbIdCache } = get()
        if (_vendorUuid) {
          const optionDbId = _optionDbIdCache[cacheKey(serviceId, optionId)]
          if (optionDbId) {
            supabase
              .from('vendor_option_prices')
              .upsert(
                { vendor_id: _vendorUuid, option_id: optionDbId, price_cents: price, currency: 'USD', active: true },
                { onConflict: 'vendor_id,option_id' }
              )
              .then(({ error }) => {
                if (error) console.error('[catalog] upsert price failed:', error.message)
              })
          }
        }
      },

      setPricePercent: (serviceId, optionId, percent) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.serviceId === serviceId
              ? { ...s, pricingPercent: { ...(s.pricingPercent ?? {}), [optionId]: percent } }
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

      getPricePercent: (serviceId, optionId) => {
        const service = get().services.find((s) => s.serviceId === serviceId)
        return service?.pricingPercent?.[optionId] || 0
      },

      hasActiveProducts: () => {
        return get().services.some(
          (s) => s.enabled && Object.values(s.pricing).some((cents) => cents > 0),
        )
      },

      hydrateFromSupabase: async (vendorUuid: string) => {
        set({ _vendorUuid: vendorUuid })

        // 1. Load this vendor's existing prices from Supabase.
        const { data: priceRows, error: priceErr } = await supabase
          .from('vendor_option_prices')
          .select('price_cents,active,options(id,option_id,option_groups(group_id,service_id))')
          .eq('vendor_id', vendorUuid)
          .eq('active', true)

        if (priceErr) {
          console.error('[catalog] hydrate load failed:', priceErr.message)
          return
        }

        // 2. Load ALL options for the DB UUID cache (covers options not yet priced).
        const { data: allOptions, error: optErr } = await supabase
          .from('options')
          .select('id,option_id,option_groups(group_id,service_id)')

        if (optErr) {
          console.error('[catalog] options load failed:', optErr.message)
        }

        // 3. Build option DB UUID cache from all options.
        const optionDbIdCache: Record<string, string> = {}
        for (const opt of (allOptions ?? []) as unknown as DbOptionRow[]) {
          const og = opt.option_groups
          if (!og) continue
          optionDbIdCache[cacheKey(og.service_id, opt.option_id)] = opt.id
        }

        // 4. Build pricing map from Supabase rows (Supabase is canonical).
        const priceBySvcOption: Record<string, Record<string, number>> = {}
        for (const row of (priceRows ?? []) as unknown as DbPriceRow[]) {
          const opt = row.options
          if (!opt?.option_groups) continue
          const svcId = opt.option_groups.service_id
          if (!priceBySvcOption[svcId]) priceBySvcOption[svcId] = {}
          priceBySvcOption[svcId][opt.option_id] = row.price_cents
          // Fill cache gaps (prefer allOptions, but backfill from priceRows too)
          const ck = cacheKey(svcId, opt.option_id)
          if (!optionDbIdCache[ck]) optionDbIdCache[ck] = opt.id
        }

        // 5. Merge Supabase prices into local store (Supabase wins).
        set((state) => ({
          _optionDbIdCache: optionDbIdCache,
          services: state.services.map((s) => {
            const sbPricing = priceBySvcOption[s.serviceId]
            if (!sbPricing) return s
            return { ...s, pricing: { ...s.pricing, ...sbPricing } }
          }),
        }))

        // 6. One-time migration: upsert any localStorage-only prices to Supabase.
        if (!get()._migrationDone) {
          const state = get()
          const upsertRows: { vendor_id: string; option_id: string; price_cents: number; currency: string; active: boolean }[] = []

          for (const svc of state.services) {
            for (const [optId, priceCents] of Object.entries(svc.pricing)) {
              if (!priceCents || priceCents <= 0) continue
              const sbPrice = priceBySvcOption[svc.serviceId]?.[optId]
              if (sbPrice !== undefined) continue // already in Supabase — skip
              const optionDbId = optionDbIdCache[cacheKey(svc.serviceId, optId)]
              if (!optionDbId) continue
              upsertRows.push({ vendor_id: vendorUuid, option_id: optionDbId, price_cents: priceCents, currency: 'USD', active: true })
            }
          }

          if (upsertRows.length > 0) {
            const { error: migErr } = await supabase
              .from('vendor_option_prices')
              .upsert(upsertRows, { onConflict: 'vendor_id,option_id' })
            if (migErr) console.error('[catalog] localStorage migration failed:', migErr.message)
            else console.log(`[catalog] migrated ${upsertRows.length} localStorage prices to Supabase`)
          }

          set({ _migrationDone: true })
        }
      },
    }),
    {
      name: 'buildconnect-vendor-catalog',
      // Persist user-facing state only; internal cache is rebuilt on hydration.
      partialize: (state) => ({
        services: state.services,
        _migrationDone: state._migrationDone,
      }),
    }
  )
)
