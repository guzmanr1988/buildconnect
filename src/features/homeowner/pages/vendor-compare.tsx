import { useNavigate } from 'react-router-dom'
import { Star, Clock, ShieldCheck, Banknote, Award, TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const vendors = MOCK_VENDORS.slice(0, 3)

function getHighlights(vendorList: typeof vendors) {
  const sorted = [...vendorList]
  const bestPrice = sorted[2] // lowest priced (mock: Paradise Pools)
  const highestRated = sorted.reduce((a, b) => (a.rating > b.rating ? a : b))
  return { bestPrice: bestPrice.id, highestRated: highestRated.id }
}

const highlights = getHighlights(vendors)

const mockPricing: Record<string, { low: string; high: string }> = {
  'v-1': { low: '$24,000', high: '$35,000' },
  'v-2': { low: '$28,000', high: '$42,000' },
  'v-3': { low: '$18,000', high: '$28,000' },
}

export function VendorComparePage() {
  const navigate = useNavigate()

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {vendors.map((vendor, i) => {
          const pricing = mockPricing[vendor.id] ?? { low: '$20,000', high: '$30,000' }
          const isBestPrice = vendor.id === highlights.bestPrice
          const isHighestRated = vendor.id === highlights.highestRated

          return (
            <motion.div
              key={vendor.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card className={cn('relative h-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5')}>
                {/* Highlight badges */}
                {(isBestPrice || isHighestRated) && (
                  <div className="absolute -top-2.5 left-4 flex gap-1.5">
                    {isHighestRated && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        <Award className="h-3 w-3" />
                        Highest Rated
                      </span>
                    )}
                    {isBestPrice && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        <TrendingUp className="h-3 w-3" />
                        Best Price
                      </span>
                    )}
                  </div>
                )}

                <CardContent className="flex flex-col gap-4 pt-4">
                  {/* Avatar + info */}
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

                  {/* Rating */}
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

                  {/* Response time */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Response: {vendor.response_time}</span>
                  </div>

                  {/* Pricing */}
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Estimated Range</p>
                    <p className="text-lg font-bold font-heading text-foreground">
                      {pricing.low} <span className="text-muted-foreground font-normal text-sm">-</span> {pricing.high}
                    </p>
                  </div>

                  {/* Badges */}
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

                  {/* CTA */}
                  <Button
                    size="lg"
                    className="mt-auto w-full h-11 text-sm font-medium"
                    onClick={() => navigate('/home/booking')}
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
