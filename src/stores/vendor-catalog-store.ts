import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

// Arc-32 close — pending-write queue for the cache-not-ready window.
// setPrice/setServicePermit fire from input onChange handlers, which can race
// AHEAD of hydrateFromSupabase building _optionDbIdCache / _subOptionDbIdCache.
// Pre-fix: cache miss + no UUID → console.error + silent drop → Rod's typed
// price lived only in zustand-persist localStorage and never reached Supabase
// (canonical class: Apex VSOP=0 entirely 2026-05-24 forensic). Fix: when the
// cache isn't ready, queue the write; replay on hydrate-complete; toast only
// on genuine post-replay failure (cache-miss after hydrate OR upsert error).
type PendingWrite =
  | { kind: 'option'; serviceId: string; optionId: string; cents: number }
  | { kind: 'permit'; serviceId: string; cents: number }

type HydrationStatus = 'idle' | 'in_flight' | 'complete'

const WRITE_FAIL_TOAST = 'Could not save price — please retry'

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
  // PR #118 — ONE flat permit price per service (Rodolfo: "permit is only
  // 1 line item to add the price not in every single item"). sendProject()
  // snapshots this single value onto the breakdown's Permit Price line.
  // Persisted in vendor_service_permits table (separate from per-option
  // pricing in vendor_option_prices).
  permitCents?: number
}

interface VendorCatalogState {
  services: VendorServiceConfig[]
  // Supabase wire — set on hydrateFromSupabase, used for fire-and-forget upserts in setPrice.
  _vendorUuid: string | null
  // Cache of (serviceId|optionId) -> options.id (DB UUID). Built during hydration
  // so setPrice can upsert by option DB UUID without a round-trip lookup.
  _optionDbIdCache: Record<string, string>
  // Cache of (serviceId|subOptionId) -> sub_options.id (DB UUID). Parallel to
  // _optionDbIdCache; populated in hydrateFromSupabase. setPrice routes to
  // vendor_sub_option_prices when a price-input fires on a sub_option id.
  _subOptionDbIdCache: Record<string, string>
  // One-time flag: have we migrated localStorage pricing to Supabase?
  _migrationDone: boolean
  // Arc-32 close — hydration lifecycle. setPrice queues if 'idle' | 'in_flight'.
  _hydrationStatus: HydrationStatus
  // Arc-32 close — writes queued while cache wasn't ready. Drained at the end
  // of hydrateFromSupabase against the freshly built caches. Persisted across
  // refresh so a vendor who types prices and immediately reloads doesn't lose
  // them (zustand-pricing[] is the second safety; this is the first).
  _pendingWrites: PendingWrite[]

  initFromAdmin: (adminServices: { id: string }[]) => void
  toggleService: (serviceId: string) => void
  toggleOption: (serviceId: string, groupId: string, optionId: string) => void
  setPrice: (serviceId: string, optionId: string, price: number) => void
  setPricePercent: (serviceId: string, optionId: string, percent: number) => void
  setServicePermit: (serviceId: string, cents: number) => void
  isServiceEnabled: (serviceId: string) => boolean
  isOptionEnabled: (serviceId: string, groupId: string, optionId: string) => boolean
  getPrice: (serviceId: string, optionId: string) => number
  getPricePercent: (serviceId: string, optionId: string) => number
  getServicePermit: (serviceId: string) => number
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

type DbPermitRow = {
  service_id: string
  permit_price_cents: number
  active: boolean
}

type DbOptionRow = {
  id: string
  option_id: string
  option_groups: { group_id: string; service_id: string }
}

type DbSubOptionRow = {
  id: string
  sub_option_id: string
  sub_groups: {
    options: {
      option_groups: { service_id: string }
    }
  }
}

type DbSubPriceRow = {
  price_cents: number
  active: boolean
  sub_options: {
    id: string
    sub_option_id: string
    sub_groups: {
      options: {
        option_groups: { service_id: string }
      }
    }
  }
}

function cacheKey(serviceId: string, optionId: string) {
  return `${serviceId}|${optionId}`
}

// Resolve current vendor UUID with fallback to auth-store. hydrateFromSupabase
// sets _vendorUuid, but writes can race ahead of hydration on a fresh page
// load (cart-store/setPrice fired before AuthBootstrap.hydrate completes its
// chain). Falling back to auth-store.profile?.id (when role==='vendor')
// closes the silent-drop window. See Bug 1 root cause.
function resolveVendorUuid(stateUuid: string | null): string | null {
  if (stateUuid) return stateUuid
  const profile = useAuthStore.getState().profile
  if (profile?.role === 'vendor' && profile.id) return profile.id
  return null
}

// Fire-and-forget upsert of profiles.service_categories from the current
// services[] enabled set. Called after every toggleService so the homeowner
// vendor-match query (which filters on service_categories intersection)
// stays in sync with the vendor's catalog state. Without this write, a
// vendor could enable Roofing in their catalog but never show up in the
// homeowner Compare Vendors list because service_categories stayed empty.
// Arc-32 close — enqueue a write when caches/auth aren't ready. Dedupes
// against pending entries of the same shape so rapid typing on the same input
// collapses to the latest cents value rather than replaying every keystroke.
function enqueuePending(
  setState: (
    partial:
      | Partial<VendorCatalogState>
      | ((s: VendorCatalogState) => Partial<VendorCatalogState>),
  ) => void,
  write: PendingWrite,
) {
  setState((state) => {
    const queue = state._pendingWrites.filter((w) => {
      if (w.kind !== write.kind) return true
      if (w.serviceId !== write.serviceId) return true
      if (w.kind === 'option' && write.kind === 'option') {
        return w.optionId !== write.optionId
      }
      return false
    })
    return { _pendingWrites: [...queue, write] }
  })
}

// Arc-32 close — drain queued writes against now-built caches. Called at the
// end of hydrateFromSupabase (caches populated, auth attached). Eagerly clears
// the queue so re-entry from a parallel hydrate (auth state-change) doesn't
// double-fire. Toasts only on genuine post-replay failure.
async function drainPendingWrites(
  vendorUuid: string,
  getState: () => VendorCatalogState,
  setState: (
    partial:
      | Partial<VendorCatalogState>
      | ((s: VendorCatalogState) => Partial<VendorCatalogState>),
  ) => void,
) {
  const queue = getState()._pendingWrites
  if (queue.length === 0) return
  setState({ _pendingWrites: [] })
  for (const w of queue) {
    if (w.kind === 'permit') {
      const { error } = await supabase
        .from('vendor_service_permits')
        .upsert(
          {
            vendor_id: vendorUuid,
            service_id: w.serviceId,
            permit_price_cents: w.cents,
            currency: 'USD',
            active: true,
          },
          { onConflict: 'vendor_id,service_id' },
        )
      if (error) {
        console.error('[catalog] drain permit upsert failed:', error.message)
        toast.error('Could not save permit price — please retry')
      }
      continue
    }
    const ck = cacheKey(w.serviceId, w.optionId)
    const optionDbId = getState()._optionDbIdCache[ck]
    if (optionDbId) {
      const { error } = await supabase
        .from('vendor_option_prices')
        .upsert(
          { vendor_id: vendorUuid, option_id: optionDbId, price_cents: w.cents, currency: 'USD', active: true },
          { onConflict: 'vendor_id,option_id' },
        )
      if (error) {
        console.error('[catalog] drain option upsert failed:', error.message)
        toast.error(WRITE_FAIL_TOAST)
      }
      continue
    }
    const subOptionDbId = getState()._subOptionDbIdCache[ck]
    if (subOptionDbId) {
      const { error } = await supabase
        .from('vendor_sub_option_prices')
        .upsert(
          { vendor_id: vendorUuid, sub_option_id: subOptionDbId, price_cents: w.cents, currency: 'USD', active: true },
          { onConflict: 'vendor_id,sub_option_id' },
        )
      if (error) {
        console.error('[catalog] drain sub_option upsert failed:', error.message)
        toast.error(WRITE_FAIL_TOAST)
      }
      continue
    }
    console.error('[catalog] drain: id not in cache after hydrate — write dropped', w)
    toast.error(`Could not save price for "${w.optionId}" — option not in catalog`)
  }
}

function syncServiceCategories(
  vendorUuid: string,
  services: VendorServiceConfig[],
) {
  const enabledIds = services.filter((s) => s.enabled).map((s) => s.serviceId)
  supabase
    .from('profiles')
    .update({ service_categories: enabledIds })
    .eq('id', vendorUuid)
    .then(({ error }) => {
      if (error) console.error('[catalog] service_categories update failed:', error.message)
    })
}

export const useVendorCatalogStore = create<VendorCatalogState>()(
  persist(
    (set, get) => ({
      services: [],
      _vendorUuid: null,
      _optionDbIdCache: {},
      _subOptionDbIdCache: {},
      _migrationDone: false,
      _hydrationStatus: 'idle',
      _pendingWrites: [],

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
        const vendorUuid = resolveVendorUuid(get()._vendorUuid)
        if (vendorUuid) syncServiceCategories(vendorUuid, get().services)
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
        // Legacy phantom-key handling — pre-PR-#118 code stored service-level
        // permit prices in svc.pricing["permit"]. Some vendor localStorage
        // still holds this stale key; on Save the handleSaveService loop pipes
        // it into setPrice and the option-catalog cache-miss assertion (PR-#383)
        // toasts spuriously ("Could not save price for \"permit\" — option
        // not in catalog"). Route to the canonical service-permit write-path
        // and strip the stale pricing key inline so subsequent saves stop
        // iterating it.
        if (optionId === 'permit') {
          set((state) => ({
            services: state.services.map((s) => {
              if (s.serviceId !== serviceId) return s
              if (!('permit' in s.pricing)) return s
              const cleanedPricing = { ...s.pricing }
              delete cleanedPricing.permit
              return { ...s, pricing: cleanedPricing }
            }),
          }))
          get().setServicePermit(serviceId, price)
          return
        }
        // Sync local state first (fast, no await).
        set((state) => ({
          services: state.services.map((s) =>
            s.serviceId === serviceId
              ? { ...s, pricing: { ...s.pricing, [optionId]: price } }
              : s
          ),
        }))
        // Arc-32 close — queue-and-replay when caches/auth aren't ready;
        // toast only on genuine post-hydrate failures.
        const vendorUuid = resolveVendorUuid(get()._vendorUuid)
        const status = get()._hydrationStatus
        if (!vendorUuid || status !== 'complete') {
          enqueuePending(set, { kind: 'option', serviceId, optionId, cents: price })
          return
        }
        const ck = cacheKey(serviceId, optionId)
        const optionDbId = get()._optionDbIdCache[ck]
        if (optionDbId) {
          supabase
            .from('vendor_option_prices')
            .upsert(
              { vendor_id: vendorUuid, option_id: optionDbId, price_cents: price, currency: 'USD', active: true },
              { onConflict: 'vendor_id,option_id' }
            )
            .then(({ error }) => {
              if (error) {
                console.error('[catalog] upsert option price failed:', error.message)
                toast.error(WRITE_FAIL_TOAST)
              }
            })
          return
        }
        const subOptionDbId = get()._subOptionDbIdCache[ck]
        if (subOptionDbId) {
          supabase
            .from('vendor_sub_option_prices')
            .upsert(
              { vendor_id: vendorUuid, sub_option_id: subOptionDbId, price_cents: price, currency: 'USD', active: true },
              { onConflict: 'vendor_id,sub_option_id' }
            )
            .then(({ error }) => {
              if (error) {
                console.error('[catalog] upsert sub_option price failed:', error.message)
                toast.error(WRITE_FAIL_TOAST)
              }
            })
          return
        }
        // Genuine cache miss post-hydrate: option id isn't in the catalog.
        console.error('[catalog] setPrice: id not in option OR sub_option DB cache after hydrate', { serviceId, optionId })
        toast.error(`Could not save price for "${optionId}" — option not in catalog`)
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

      setServicePermit: (serviceId, cents) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.serviceId === serviceId ? { ...s, permitCents: cents } : s
          ),
        }))
        const vendorUuid = resolveVendorUuid(get()._vendorUuid)
        const status = get()._hydrationStatus
        if (!vendorUuid || status !== 'complete') {
          enqueuePending(set, { kind: 'permit', serviceId, cents })
          return
        }
        supabase
          .from('vendor_service_permits')
          .upsert(
            { vendor_id: vendorUuid, service_id: serviceId, permit_price_cents: cents, currency: 'USD', active: true },
            { onConflict: 'vendor_id,service_id' }
          )
          .then(({ error }) => {
            if (error) {
              console.error('[catalog] upsert service permit failed:', error.message)
              toast.error('Could not save permit price — please retry')
            }
          })
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

      getServicePermit: (serviceId) => {
        const service = get().services.find((s) => s.serviceId === serviceId)
        return service?.permitCents ?? 0
      },

      hasActiveProducts: () => {
        return get().services.some(
          (s) => s.enabled && Object.values(s.pricing).some((cents) => cents > 0),
        )
      },

      hydrateFromSupabase: async (vendorUuid: string) => {
        set({ _vendorUuid: vendorUuid, _hydrationStatus: 'in_flight' })

        // Arc-43 — auth-bootstrap-race guard. RLS gates options/sub_options/
        // vendor_*_prices on authenticated role. A fresh /vendor/catalog mount
        // can fire hydrate before the Supabase session JWT is attached → anon
        // SELECTs return [] → caches empty → every setPrice silent-drops at
        // the L218 _subOptionDbIdCache lookup. Returning early when no session
        // exists is safe — the module-scope onAuthStateChange listener below
        // re-fires hydrate post-SIGNED_IN/INITIAL_SESSION with the same uuid.
        const { data: { session: authSession } } = await supabase.auth.getSession()
        if (!authSession) {
          console.warn('[catalog] hydrate skipped — no auth session yet; will retry on SIGNED_IN')
          set({ _hydrationStatus: 'idle' })
          return
        }

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

        // 1b. Load this vendor's per-service permit prices (PR #118).
        const { data: permitRows, error: permitErr } = await supabase
          .from('vendor_service_permits')
          .select('service_id,permit_price_cents,active')
          .eq('vendor_id', vendorUuid)
          .eq('active', true)

        if (permitErr) {
          console.error('[catalog] permit hydrate load failed:', permitErr.message)
        }

        // 1c. Load this vendor's sub_option prices (Arc-41 — sub-option layer).
        const { data: subPriceRows, error: subPriceErr } = await supabase
          .from('vendor_sub_option_prices')
          .select('price_cents,active,sub_options(id,sub_option_id,sub_groups(options(option_groups(service_id))))')
          .eq('vendor_id', vendorUuid)
          .eq('active', true)

        if (subPriceErr) {
          console.error('[catalog] sub_option price hydrate load failed:', subPriceErr.message)
        }

        // 2. Load ALL options for the DB UUID cache (covers options not yet priced).
        const { data: allOptions, error: optErr } = await supabase
          .from('options')
          .select('id,option_id,option_groups(group_id,service_id)')

        if (optErr) {
          console.error('[catalog] options load failed:', optErr.message)
        }

        // 2b. Load ALL sub_options for the sub_option DB UUID cache. Walks
        // sub_groups → options → option_groups so each sub_option pairs with
        // the same serviceId used as the cacheKey prefix for option rows.
        const { data: allSubOptions, error: subOptErr } = await supabase
          .from('sub_options')
          .select('id,sub_option_id,sub_groups(options(option_groups(service_id)))')

        if (subOptErr) {
          console.error('[catalog] sub_options load failed:', subOptErr.message)
        }

        // 3. Build option DB UUID cache from all options.
        const optionDbIdCache: Record<string, string> = {}
        for (const opt of (allOptions ?? []) as unknown as DbOptionRow[]) {
          const og = opt.option_groups
          if (!og) continue
          optionDbIdCache[cacheKey(og.service_id, opt.option_id)] = opt.id
        }

        // 3b. Build sub_option DB UUID cache from all sub_options.
        const subOptionDbIdCache: Record<string, string> = {}
        for (const so of (allSubOptions ?? []) as unknown as DbSubOptionRow[]) {
          const svcId = so.sub_groups?.options?.option_groups?.service_id
          if (!svcId) continue
          subOptionDbIdCache[cacheKey(svcId, so.sub_option_id)] = so.id
        }

        // 4. Build pricing maps from Supabase rows (Supabase is canonical).
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

        // 4a. Fold sub_option prices into the same pricing[] map keyed by
        // sub_option_id. Cart/configurator selections that target a sub_option
        // id hit getPrice with the sub_option_id; flat key shape mirrors the
        // option-side fold so consumer code stays one-shape.
        for (const row of (subPriceRows ?? []) as unknown as DbSubPriceRow[]) {
          const so = row.sub_options
          const svcId = so?.sub_groups?.options?.option_groups?.service_id
          if (!so || !svcId) continue
          if (!priceBySvcOption[svcId]) priceBySvcOption[svcId] = {}
          priceBySvcOption[svcId][so.sub_option_id] = row.price_cents
          const ck = cacheKey(svcId, so.sub_option_id)
          if (!subOptionDbIdCache[ck]) subOptionDbIdCache[ck] = so.id
        }

        // 4b. Build per-service permit map (PR #118).
        const permitByService: Record<string, number> = {}
        for (const row of (permitRows ?? []) as unknown as DbPermitRow[]) {
          if (!row.service_id) continue
          permitByService[row.service_id] = row.permit_price_cents ?? 0
        }

        // 5. Merge Supabase prices into local store (Supabase wins).
        set((state) => ({
          _optionDbIdCache: optionDbIdCache,
          _subOptionDbIdCache: subOptionDbIdCache,
          services: state.services.map((s) => {
            const sbPricing = priceBySvcOption[s.serviceId]
            const sbPermit = permitByService[s.serviceId]
            if (!sbPricing && sbPermit === undefined) return s
            return {
              ...s,
              pricing: sbPricing ? { ...s.pricing, ...sbPricing } : s.pricing,
              permitCents: sbPermit !== undefined ? sbPermit : s.permitCents,
            }
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

        // Arc-43 — (B) sub_option backfill arm. Un-gated by _migrationDone
        // (which is single-shot and Carlos already passed it pre-Arc-41
        // without touching sub_options). Idempotent via UPSERT ON CONFLICT
        // (vendor_id, sub_option_id) + skip-pattern against the same
        // priceBySvcOption map the option-arm above uses (the L387-392
        // flat-fold seeds sub_option prices into the same map). Recovers
        // the Carlos 21 sub_option keystrokes that silent-dropped pre-fix
        // without requiring a re-type, and stays cheap on subsequent
        // mounts (every row already-in-DB skips the push).
        const subUpsertRows: { vendor_id: string; sub_option_id: string; price_cents: number; currency: string; active: boolean }[] = []
        for (const svc of get().services) {
          for (const [optId, priceCents] of Object.entries(svc.pricing)) {
            if (!priceCents || priceCents <= 0) continue
            const sbPrice = priceBySvcOption[svc.serviceId]?.[optId]
            if (sbPrice !== undefined) continue
            const subOptionDbId = subOptionDbIdCache[cacheKey(svc.serviceId, optId)]
            if (!subOptionDbId) continue
            subUpsertRows.push({ vendor_id: vendorUuid, sub_option_id: subOptionDbId, price_cents: priceCents, currency: 'USD', active: true })
          }
        }
        if (subUpsertRows.length > 0) {
          const { error: subMigErr } = await supabase
            .from('vendor_sub_option_prices')
            .upsert(subUpsertRows, { onConflict: 'vendor_id,sub_option_id' })
          if (subMigErr) {
            console.error('[catalog] sub_option backfill failed:', subMigErr.message)
            toast.error(WRITE_FAIL_TOAST)
          } else console.log(`[catalog] backfilled ${subUpsertRows.length} sub_option prices to Supabase`)
        }

        // Arc-32 close — caches are now built; mark hydration complete and
        // drain any writes that queued while we were 'in_flight' or 'idle'.
        set({ _hydrationStatus: 'complete' })
        await drainPendingWrites(vendorUuid, get, set)
      },
    }),
    {
      name: 'buildconnect-vendor-catalog',
      // Persist user-facing state only; internal cache is rebuilt on hydration.
      // _pendingWrites is INTENTIONALLY NOT persisted (Arc-32 PR-D2). The
      // queue's purpose is to bridge the cache-not-ready window WITHIN a
      // single page lifecycle (_hydrationStatus 'idle' → 'complete'). Persisting
      // it across sessions causes stale pre-fix-encoded writes to replay
      // against post-migration DB rows on the next TOKEN_REFRESHED hydrate,
      // overwriting fresh values with stored localStorage state. Same-session
      // queue behaviour (typing during 'idle' → drain on hydrate-complete)
      // is preserved because _pendingWrites remains in memory.
      partialize: (state) => ({
        services: state.services,
        _migrationDone: state._migrationDone,
      }),
    }
  )
)

// PR-#427 — removed Arc-43 onAuthStateChange listener. AuthBootstrap.tsx
// already gates `useVendorCatalogStore.getState().hydrateFromSupabase(userId)`
// on `merged.role === 'vendor'` (L100-102), called from its own listener for
// SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED and from the initial
// `supabase.auth.getSession()` path. The Arc-43 fallback was redundant for
// vendors and harmful for homeowners (RLS-denied UPSERT throws the
// "Could not save price — please retry" toast on homeowner login).
