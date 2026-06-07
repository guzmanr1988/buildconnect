import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Clock, ShieldCheck, Banknote, Award, TrendingUp, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { MOCK_VENDORS, MOCK_CATALOG } from '@/lib/mock-data'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { useRealVendors } from '@/lib/hooks/use-real-vendors'
import { useCartStore } from '@/stores/cart-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useFeatureFlagsStore } from '@/stores/feature-flags-store'
import { useCatalogStore } from '@/stores/catalog-store'
import { haversineMiles } from '@/lib/geo-distance'
import {
  computeVendorTotal,
  formatPriceCents,
  getVendorPriceMap,
  getVendorPermitMap,
  type VendorPriceMap,
  type VendorPermitMap,
  type VendorTotalResult,
} from '@/lib/api/pricing'
import {
  getVendorServiceRateMap,
  type VendorServiceRateMap,
} from '@/lib/api/vendor-service-rates'
import { useVendorPriceRealtime } from '@/lib/hooks/use-vendor-price-realtime'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

// Apex-only mode — Rodolfo 2026-05-06: solo Apex on prod marketplace
// while we test the chain end-to-end before opening to other vendors.
// Flip APEX_ONLY_MODE to false to restore multi-vendor matching with no
// other code changes (the guards below collapse to no-ops).
const APEX_ONLY_MODE = true
// PR-#437 — swap from fc0d8ff3 (suspended "(legacy)" apex profile) to
// 3e0821aa (active canonical apex). useRealVendors filters status='active'
// so the legacy UUID never returned a row; APEX_ONLY guard at L101 then
// excluded the live 3e0821aa too → zero-vendors. Same consolidation as
// Arc-32 W4 close 2026-05-25 (vendor-visibility compound gate). Rod
// surface: "Put apex within the 60 miles radius. Because nothing is
// showing as demo" — distance was a red herring; root was wrong UUID.
const APEX_REAL_UUID = '3e0821aa-89e7-4140-bff8-c4f7f985f561'

export function VendorComparePage() {
  const navigate = useNavigate()
  const cartItems = useCartStore((s) => s.items)
  const profile = useAuthStore((s) => s.profile)
  const matchRadiusMiles = useAdminModerationStore((s) => s.matchRadiusMiles)
  const gmpEnabled = useFeatureFlagsStore((s) => s.getFlag('googleMapsPlatform'))
  const realGeoEnabled = useFeatureFlagsStore((s) => s.getFlag('realGeocoding'))

  const cartCategories = useMemo<Set<string>>(
    () => new Set(cartItems.map((i) => i.serviceId)),
    [cartItems],
  )

  // Resolve homeowner coords — prefer geocoded project address from cart items
  // (projectLat/Lng set at add-to-cart when both flags ON), fall back to profile
  // lat/lng (demo-seeded / Supabase-stored). If flags are OFF, no distance filter.
  const projectCoords = useMemo<{ lat: number; lng: number } | null>(() => {
    if (!gmpEnabled || !realGeoEnabled) return null
    const withCoords = cartItems.find(
      (i) => typeof i.projectLat === 'number' && typeof i.projectLng === 'number',
    )
    if (withCoords) return { lat: withCoords.projectLat!, lng: withCoords.projectLng! }
    if (typeof profile?.latitude === 'number' && typeof profile?.longitude === 'number') {
      return { lat: profile.latitude, lng: profile.longitude }
    }
    return null
  }, [cartItems, profile, gmpEnabled, realGeoEnabled])

  const hasHomeownerCoord = projectCoords !== null
  // Apex-only mode: bypass useRealVendors's DEMO_UUIDS dedupe for APEX_REAL_UUID
  // so real Apex (full 11-category coverage + $100 placeholder pricing) renders
  // on every cart, and skip ALL mocks below so we never double-render Apex.
  const realVendors = useRealVendors(
    APEX_ONLY_MODE ? new Set([APEX_REAL_UUID]) : undefined,
  )

  const featuredVendors = useMemo(() => {
    // Mock vendors: full PRODUCT-IS-GOD checks (catalog pricing required).
    const mockFiltered = MOCK_VENDORS.filter((v) => {
      if (APEX_ONLY_MODE) return false
      if (v.status !== 'active') return false
      if (cartCategories.size > 0) {
        const covers = v.service_categories.some((c) => cartCategories.has(c))
        if (!covers) return false
      }
      // PRODUCT-IS-GOD Phase B (PR 3): vendor must have a priced active CatalogItem
      // for EVERY service category in cart.
      if (cartCategories.size > 0) {
        const allPriced = [...cartCategories].every((cat) =>
          MOCK_CATALOG.some((ci) => ci.vendor_id === v.id && ci.category === cat && ci.active && ci.price > 0)
        )
        if (!allPriced) return false
      }
      if (projectCoords && typeof v.latitude === 'number' && typeof v.longitude === 'number') {
        const miles = haversineMiles(projectCoords.lat, projectCoords.lng, v.latitude, v.longitude)
        if (miles > matchRadiusMiles) return false
      }
      return true
    })

    // Real-auth vendors: category + distance filter only (no MOCK_CATALOG check).
    // Pricing is fetched from Supabase catalog per-UUID; PRODUCT-IS-GOD applied post-load via displayVendors.
    const realFiltered = realVendors.filter((v) => {
      if (APEX_ONLY_MODE && v.id !== APEX_REAL_UUID) return false
      if (cartCategories.size > 0) {
        const cats = v.service_categories ?? []
        const covers = cats.some((c) => cartCategories.has(c))
        if (!covers) return false
      }
      if (projectCoords && typeof v.latitude === 'number' && typeof v.longitude === 'number') {
        const miles = haversineMiles(projectCoords.lat, projectCoords.lng, v.latitude, v.longitude)
        if (miles > matchRadiusMiles) return false
      }
      return true
    })

    return [...mockFiltered, ...realFiltered]
  }, [cartCategories, projectCoords, matchRadiusMiles, realVendors])

  const [priceMaps, setPriceMaps] = useState<Record<string, VendorPriceMap>>({})
  // Arc-32 PR-B — parallel to priceMaps. Rod-rule "permit is default in every
  // service unless vendor puts it at 0" requires summing vendor_service_permits
  // into the Compare-Vendors total. getVendorPermitMap filters zero/missing
  // rows, so absence in the map = vendor opt-out for that service.
  const [permitMaps, setPermitMaps] = useState<Record<string, VendorPermitMap>>({})
  // Mig 068 — per-vendor remodel + bathroom rate maps (measurement-driven
  // services). Same fetch-and-pass pattern as priceMaps; computeVendorTotal
  // uses vendor's vendor_service_rates rows to drive the configurator engine,
  // so different vendors show DIFFERENT believable totals across remodel /
  // bathroom carts. Coverage rule mirrors priceMaps: zero rows → drop out.
  const [serviceRateMapsByVendor, setServiceRateMapsByVendor] = useState<
    Record<string, Record<string, VendorServiceRateMap>>
  >({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Stable vendor-id key — featuredVendors changes async when useRealVendors()
  // resolves; without this stable dep, priceMaps would freeze to the mount-time
  // mocks-only set and real vendors silently fall out of totalsByVendor[id].
  // Also used by the realtime hook below so the refetch callback only rebinds
  // when the vendor set actually changes (not every render).
  const featuredVendorIdsKey = featuredVendors.map((v) => v.id).join('|')

  const loadPriceMaps = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const entries = await Promise.all(
        featuredVendors.map(async (v) => {
          // Demo vendors: look up UUID from mock-id map.
          // Real vendors: their id IS already the UUID.
          const uuid = DEMO_VENDOR_UUID_BY_MOCK_ID[v.id] ?? v.id
          // Skip non-UUID mock fixture ids — Supabase rejects them with a syntax error.
          if (!UUID_RE.test(uuid)) {
            return [
              v.id,
              new Map() as VendorPriceMap,
              new Map() as VendorPermitMap,
              { remodel: new Map(), bathroom: new Map() } as Record<string, VendorServiceRateMap>,
            ] as const
          }
          // Parallel-fetch price + permit + measurement-rate maps so a slow
          // query doesn't serialize the others. computeVendorTotal sums all.
          const [map, permits, remodelRates, bathroomRates] = await Promise.all([
            getVendorPriceMap(uuid),
            getVendorPermitMap(uuid),
            getVendorServiceRateMap(uuid, 'remodel').catch(() => new Map<string, number>()),
            getVendorServiceRateMap(uuid, 'bathroom').catch(() => new Map<string, number>()),
          ])
          const rateMaps: Record<string, VendorServiceRateMap> = {
            remodel: remodelRates,
            bathroom: bathroomRates,
          }
          return [v.id, map, permits, rateMaps] as const
        })
      )
      setPriceMaps(Object.fromEntries(entries.map(([id, map]) => [id, map])))
      setPermitMaps(Object.fromEntries(entries.map(([id, , permits]) => [id, permits])))
      setServiceRateMapsByVendor(Object.fromEntries(entries.map(([id, , , rateMaps]) => [id, rateMaps])))
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load vendor pricing')
    } finally {
      setLoading(false)
    }
    // featuredVendors intentionally excluded — featuredVendorIdsKey is the
    // stable identity used for the refetch trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredVendorIdsKey])

  useEffect(() => {
    loadPriceMaps().catch(() => {})
  }, [loadPriceMaps])

  // Arc-41: realtime listener on vendor_option_prices + vendor_sub_option_prices.
  // Vendor edits a price → WAL event → refetch all priceMaps for the current
  // vendor set. Low-frequency channel; per-vendor filtering happens implicitly
  // because we refetch per-id in loadPriceMaps.
  useVendorPriceRealtime(loadPriceMaps)

  const services = useCatalogStore((s) => s.services)
  const totalsByVendor = useMemo(() => {
    const out: Record<string, VendorTotalResult> = {}
    for (const v of featuredVendors) {
      const map = priceMaps[v.id]
      if (!map) continue
      out[v.id] = computeVendorTotal(map, cartItems, services, permitMaps[v.id], serviceRateMapsByVendor[v.id])
    }
    return out
  }, [priceMaps, permitMaps, serviceRateMapsByVendor, cartItems, services])

  // PRODUCT-IS-GOD for real-auth vendors: applied post-load since their pricing
  // comes from Supabase (not MOCK_CATALOG). Mock vendors already passed at featuredVendors time.
  // While loading, show all to avoid flash; filter once priceMaps are in.
  const UUID_RE_DISPLAY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const displayVendors = useMemo(() => {
    if (loading || cartCategories.size === 0) return featuredVendors
    return featuredVendors.filter((v) => {
      // Mock vendors (non-UUID id or in DEMO map) already passed PRODUCT-IS-GOD.
      const isMock = !UUID_RE_DISPLAY.test(v.id) || v.id in DEMO_VENDOR_UUID_BY_MOCK_ID
      if (isMock) return true
      // All real vendors (incl. Apex) gated by PRODUCT-IS-GOD strict floor.
      // Rod-chosen behavior: when vendor toggles a service OFF in their
      // catalog, the cascaded vop.active=false drops it from the priceMap;
      // computeVendorTotal reports !coversAllServices and Apex disappears
      // from Compare-Vendors for any cart needing that service. APEX FLOOR
      // (previously rendered Apex with partial pricing via .hasSelections)
      // removed in vendor-active-toggle-law bundle.
      const result = totalsByVendor[v.id]
      return !!(result && result.coversAllServices && result.totalCents > 0)
    })
  }, [featuredVendors, loading, totalsByVendor, cartCategories])

  const highlights = useMemo(() => {
    // Best price: lowest non-zero total among vendors that cover all services and have no missing options.
    const eligible = displayVendors.filter((v) => {
      const r = totalsByVendor[v.id]
      return r && r.hasSelections && r.coversAllServices && r.missingOptionKeys.length === 0 && r.missingSubOptionKeys.length === 0 && r.totalCents > 0
    })
    const bestPrice = eligible.length > 0
      ? eligible.reduce((a, b) => (totalsByVendor[a.id].totalCents < totalsByVendor[b.id].totalCents ? a : b)).id
      : null
    const highestRated = displayVendors.length > 0
      ? displayVendors.reduce((a, b) => (a.rating > b.rating ? a : b)).id
      : null
    return { bestPrice, highestRated }
  }, [totalsByVendor, displayVendors])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Compare Vendors
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and select the best contractor for your project.
        </p>
      </div>

      {fetchError && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200">
          Could not load vendor pricing: {fetchError}. Showing vendor list without totals.
        </div>
      )}

      {/* Ship #246 — empty-state when geo+category filter yields zero.
          Differentiates the "no coverage in your area" case from a generic
          "no vendors" state so the homeowner knows to adjust radius (via
          admin) or pick a different project category. */}
      {displayVendors.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
          <p className="text-base font-semibold text-foreground">No contractors in your area</p>
          {hasHomeownerCoord ? (
            <p className="text-sm text-muted-foreground">
              No contractors within {matchRadiusMiles} miles of your address match the selected services.
              Try expanding the radius in admin Settings or adjusting the services in your project.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add your address to your profile so we can match you with local contractors.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {displayVendors.map((vendor, i) => {
          const result = totalsByVendor[vendor.id]
          const isBestPrice = vendor.id === highlights.bestPrice
          const isHighestRated = vendor.id === highlights.highestRated
          const isApex = vendor.id === APEX_REAL_UUID
          // Arc-32 close — vendor offers a cart-service when its profile toggles
          // Active for the category (vendor.service_categories) OR at least one
          // priced VOP/VSOP row exists for that vendor+service. Vendor-offers
          // gates the availability-gap UX: when the vendor offers EVERY
          // cart-service, partial pricing is informational (show the total, no
          // gap-badge, no IWD line-through). True-gap = at least one
          // cart-service has neither Active toggle nor any priced row.
          const offeredServices = new Set<string>(vendor.service_categories ?? [])
          const vendorPriceMap = priceMaps[vendor.id]
          if (vendorPriceMap) {
            for (const key of vendorPriceMap.keys()) {
              const m = key.match(/^(?:opt|subopt):([^|]+)\|/)
              if (m) offeredServices.add(m[1])
            }
          }
          const vendorOffersAllCartServices =
            cartCategories.size === 0
            || [...cartCategories].every((sid) => offeredServices.has(sid))
          // Availability-gap: Apex priced some-but-not-all cart services AND
          // does NOT offer at least one of the unpriced services. Vendor-offers
          // suppresses the badge so Active-toggle-on + partial-row-pricing
          // shows a clean total. computeVendorTotal already excludes
          // missingOptionKeys from totalCents (per-row total preserved).
          const apexHasGap =
            isApex &&
            !!result &&
            result.hasSelections &&
            !vendorOffersAllCartServices &&
            (!result.coversAllServices
              || result.missingOptionKeys.length > 0
              || result.missingSubOptionKeys.length > 0) &&
            result.totalCents > 0
          // Arc-42 — priceKey/subOptionPriceKey carry an 'opt:'/'subopt:' prefix
          // post-Arc-41; strip before splitting so services.find() resolves the
          // raw service id (not 'opt:windows_doors'). Arc-32 close — filter to
          // services Apex does NOT offer (true gap-services only).
          const gapServiceNames = apexHasGap
            ? Array.from(
                new Set(
                  [...result.missingOptionKeys, ...result.missingSubOptionKeys]
                    .map((k) => k.replace(/^(opt|subopt):/, '').split('|')[0]),
                ),
              )
                .filter((sid) => !offeredServices.has(sid))
                .map(
                  (sid) => services.find((s) => s.id === sid)?.name ?? sid,
                )
            : []

          // Decide what to render in the Price slot.
          let priceText: string
          let priceTone: 'strong' | 'muted' = 'strong'
          if (loading) {
            priceText = 'Loading price…'
            priceTone = 'muted'
          } else if (!result || !result.hasSelections) {
            priceText = 'Configure to see price'
            priceTone = 'muted'
          } else if (apexHasGap) {
            priceText = formatPriceCents(result.totalCents)
            priceTone = 'strong'
          } else if (isApex && vendorOffersAllCartServices && result.totalCents > 0) {
            // Apex offers every cart-service (Active toggle OR any priced row)
            // but some sub-options unpriced → show partial total clean (no
            // gap-badge, no "Contact for quote").
            priceText = formatPriceCents(result.totalCents)
            priceTone = 'strong'
          } else if (
            !result.coversAllServices
            || result.missingOptionKeys.length > 0
            || result.missingSubOptionKeys.length > 0
            || result.totalCents === 0
          ) {
            priceText = 'Contact for quote'
            priceTone = 'muted'
          } else {
            priceText = formatPriceCents(result.totalCents)
          }

          return (
            <motion.div
              key={vendor.id}
              data-vendor-id={vendor.id}
              data-vendor-company={vendor.company}
              data-best-price={isBestPrice ? 'true' : 'false'}
              data-highest-rated={isHighestRated ? 'true' : 'false'}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card className={cn('relative h-full overflow-visible transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5', (isBestPrice || isHighestRated) && 'mt-3')}>
                {(isBestPrice || isHighestRated) && (
                  <div className="absolute -top-3 left-4 flex gap-1.5 z-10">
                    {isHighestRated && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                        <Award className="h-3 w-3" />
                        Highest Rated
                      </span>
                    )}
                    {isBestPrice && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                        <TrendingUp className="h-3 w-3" />
                        Best Price
                      </span>
                    )}
                  </div>
                )}

                <CardContent className="flex flex-col gap-4 pt-4">
                  <div className="flex items-center gap-3">
                    <AvatarInitials
                      initials={vendor.initials}
                      color={vendor.avatar_color}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold font-heading text-foreground truncate">
                        {vendor.company}
                      </h3>
                      <p className="text-xs text-muted-foreground">{vendor.name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, starIdx) => (
                        <Star
                          key={starIdx}
                          className={cn(
                            'h-4 w-4',
                            starIdx < Math.floor(vendor.rating)
                              ? 'fill-amber-400 text-amber-400'
                              : starIdx < vendor.rating
                                ? 'fill-amber-400/50 text-amber-400'
                                : 'fill-muted text-muted'
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {vendor.rating}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({vendor.total_reviews} reviews)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Response: {vendor.response_time}</span>
                  </div>

                  {/* Price */}
                  <div
                    className="rounded-lg bg-muted/50 p-3"
                    data-vendor-price={result?.totalCents ?? 0}
                    data-price-state={loading ? 'loading' : !result?.hasSelections ? 'no-selection' : apexHasGap ? 'apex-gap-deducted' : isApex && vendorOffersAllCartServices && (result?.totalCents ?? 0) > 0 ? 'quoted' : !result.coversAllServices || result.missingOptionKeys.length > 0 ? 'contact-quote' : 'quoted'}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">Price</p>
                      {apexHasGap && (
                        <span
                          data-availability-gap="true"
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-200"
                        >
                          <AlertCircle className="h-3 w-3" />
                          Some services unpriced
                        </span>
                      )}
                    </div>
                    <p className={cn(
                      'text-lg font-bold font-heading',
                      priceTone === 'strong' ? 'text-foreground' : 'text-muted-foreground italic font-medium'
                    )}>
                      {priceText}
                    </p>
                    {apexHasGap && (
                      <p
                        data-availability-gap-note="true"
                        className="mt-1 text-[10px] leading-snug text-muted-foreground"
                      >
                        Apex doesn’t price{' '}
                        {gapServiceNames.map((n, idx) => (
                          <span key={n}>
                            <span className="line-through">{n}</span>
                            {idx < gapServiceNames.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                        {' '}— total excludes those. They may be covered as more contractors join.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {vendor.verified && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <ShieldCheck className="h-3 w-3" />
                        Verified
                      </Badge>
                    )}
                    {vendor.financing_available && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Banknote className="h-3 w-3" />
                        Financing
                      </Badge>
                    )}
                  </div>

                  {(() => {
                    // Stage B booking-block: vendor must have pricing configured for
                    // every service in the cart before homeowner can book.
                    // Apex availability-gap exception: when Apex prices a subset,
                    // homeowner can still book against the deducted total; the
                    // unpriced services are surfaced via the gap badge + note.
                    const unconfigured =
                      result != null
                      && result.hasSelections
                      && !result.coversAllServices
                      && !apexHasGap
                      && !(isApex && vendorOffersAllCartServices && result.totalCents > 0)
                    const btn = (
                      <Button
                        size="lg"
                        className="mt-auto w-full h-11 text-sm font-medium"
                        disabled={unconfigured}
                        data-book-vendor={vendor.id}
                        onClick={unconfigured ? undefined : () => {
                          localStorage.setItem('buildconnect-selected-contractor', JSON.stringify({
                            vendor_id: vendor.id,
                            name: vendor.name,
                            company: vendor.company,
                            rating: vendor.rating,
                            // Ship #355 — freeze the price the homeowner sees at
                            // booking time. Only set when vendor has a full quote
                            // (totalCents > 0); absent when "Contact for quote".
                            ...(result?.totalCents > 0 ? { quotedPriceCents: result.totalCents } : {}),
                          }))
                          navigate('/home/booking')
                        }}
                      >
                        {unconfigured
                          ? <><AlertCircle className="h-4 w-4 mr-1.5 shrink-0" />Not Available</>
                          : 'Book Site Visit'}
                      </Button>
                    )
                    if (!unconfigured) return btn
                    return (
                      <Tooltip>
                        <TooltipTrigger render={<span className="mt-auto w-full block" />}>
                          {btn}
                        </TooltipTrigger>
                        <TooltipContent>
                          This vendor has not set up pricing for your selected services. Contact them directly or choose another vendor.
                        </TooltipContent>
                      </Tooltip>
                    )
                  })()}
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
