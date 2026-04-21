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
import {
  computeVendorTotal,
  formatPriceCents,
  getVendorPriceMap,
  type VendorPriceMap,
  type VendorTotalResult,
} from '@/lib/api/pricing'
import { cn } from '@/lib/utils'

// Feature the first 3 mock vendors (Apex / Shield / Paradise) that have been
// bridged to real Supabase profiles + seeded vendor_option_prices rows.
const featuredVendors = MOCK_VENDORS.slice(0, 3)

export function VendorComparePage() {
  const navigate = useNavigate()
  const cartItems = useCartStore((s) => s.items)

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
    const highestRated = featuredVendors.reduce((a, b) => (a.rating > b.rating ? a : b)).id
    return { bestPrice, highestRated }
  }, [totalsByVendor])

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
