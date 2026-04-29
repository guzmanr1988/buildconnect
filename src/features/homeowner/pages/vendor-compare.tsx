import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Clock, ShieldCheck, Banknote, Award, TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { useCartStore } from '@/stores/cart-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { haversineMiles } from '@/lib/geo-distance'
import {
  computeVendorTotal,
  formatPriceCents,
  getVendorPriceMap,
  type VendorPriceMap,
  type VendorTotalResult,
} from '@/lib/api/pricing'
import { cn } from '@/lib/utils'

export function VendorComparePage() {
  const navigate = useNavigate()
  const cartItems = useCartStore((s) => s.items)
  const profile = useAuthStore((s) => s.profile)
  const matchRadiusMiles = useAdminModerationStore((s) => s.matchRadiusMiles)

  // Ship #246 — geo-match Phase 1 filter.
  // Category match: vendor covers at least one service_category the
  //   homeowner has in cart (cartItems.serviceId).
  // Distance match: haversine(vendor, homeowner) <= admin matchRadiusMiles.
  //   If homeowner has no lat/lng on profile (unseeded demo addresses,
  //   new signups pre-geocoding), distance filter falls through permissive
  //   — the empty-state messaging surfaces this case. Tranche-2 geocoding
  //   replaces the demo-seeded lat/lng with real coords and the fall-through
  //   narrows to "geocoding failed" edge cases only.
  const cartCategories = useMemo<Set<string>>(
    () => new Set(cartItems.map((i) => i.serviceId)),
    [cartItems],
  )
  const hasHomeownerCoord =
    typeof profile?.latitude === 'number' && typeof profile?.longitude === 'number'

  const featuredVendors = useMemo(() => {
    const base = MOCK_VENDORS.filter((v) => {
      // If cart is non-empty, only include vendors covering at least one
      // cart category. Empty cart → skip category filter (let them browse).
      if (cartCategories.size > 0) {
        const covers = v.service_categories.some((c) => cartCategories.has(c))
        if (!covers) return false
      }
      // Distance filter — only applies when homeowner has lat/lng.
      if (hasHomeownerCoord && typeof v.latitude === 'number' && typeof v.longitude === 'number') {
        const miles = haversineMiles(profile!.latitude, profile!.longitude, v.latitude, v.longitude)
        if (miles > matchRadiusMiles) return false
      }
      return true
    })
    return base
  }, [cartCategories, hasHomeownerCoord, profile, matchRadiusMiles])

  const [priceMaps, setPriceMaps] = useState<Record<string, VendorPriceMap>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setFetchError(null)
      try {
        const entries = await Promise.all(
          featuredVendors.map(async (v) => {
            const uuid = DEMO_VENDOR_UUID_BY_MOCK_ID[v.id]
            if (!uuid) return [v.id, new Map()] as const
            const map = await getVendorPriceMap(uuid)
            return [v.id, map] as const
          })
        )
        if (!mounted) return
        setPriceMaps(Object.fromEntries(entries))
      } catch (err) {
        if (!mounted) return
        setFetchError(err instanceof Error ? err.message : 'Failed to load vendor pricing')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  const totalsByVendor = useMemo(() => {
    const out: Record<string, VendorTotalResult> = {}
    for (const v of featuredVendors) {
      const map = priceMaps[v.id]
      if (!map) continue
      out[v.id] = computeVendorTotal(map, cartItems)
    }
    return out
  }, [priceMaps, cartItems])

  const highlights = useMemo(() => {
    // Best price: lowest non-zero total among vendors that cover all services and have no missing options.
    const eligible = featuredVendors.filter((v) => {
      const r = totalsByVendor[v.id]
      return r && r.hasSelections && r.coversAllServices && r.missingOptionKeys.length === 0 && r.totalCents > 0
    })
    const bestPrice = eligible.length > 0
      ? eligible.reduce((a, b) => (totalsByVendor[a.id].totalCents < totalsByVendor[b.id].totalCents ? a : b)).id
      : null
    const highestRated = featuredVendors.length > 0
      ? featuredVendors.reduce((a, b) => (a.rating > b.rating ? a : b)).id
      : null
    return { bestPrice, highestRated }
  }, [totalsByVendor, featuredVendors])

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
      {featuredVendors.length === 0 && (
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
        {featuredVendors.map((vendor, i) => {
          const result = totalsByVendor[vendor.id]
          const isBestPrice = vendor.id === highlights.bestPrice
          const isHighestRated = vendor.id === highlights.highestRated

          // Decide what to render in the Price slot.
          let priceText: string
          let priceTone: 'strong' | 'muted' = 'strong'
          if (loading) {
            priceText = 'Loading price…'
            priceTone = 'muted'
          } else if (!result || !result.hasSelections) {
            priceText = 'Configure to see price'
            priceTone = 'muted'
          } else if (!result.coversAllServices || result.missingOptionKeys.length > 0 || result.totalCents === 0) {
            priceText = 'Contact for quote'
            priceTone = 'muted'
          } else {
            priceText = formatPriceCents(result.totalCents)
          }

          return (
            <motion.div
              key={vendor.id}
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
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Price</p>
                    <p className={cn(
                      'text-lg font-bold font-heading',
                      priceTone === 'strong' ? 'text-foreground' : 'text-muted-foreground italic font-medium'
                    )}>
                      {priceText}
                    </p>
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

                  <Button
                    size="lg"
                    className="mt-auto w-full h-11 text-sm font-medium"
                    onClick={() => {
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
                    Book Site Visit
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
