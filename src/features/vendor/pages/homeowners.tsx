import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import { Search, Users, MessageSquare, Mail, MapPin, Phone, Briefcase, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { EmptyState } from '@/components/shared/empty-state'
import { useVendorHomeowners } from '@/lib/hooks/use-vendor-homeowners'
import { matchesSearch } from '@/lib/search-match'

// Ship #277 → #278: refactored to consume useVendorHomeowners hook
// (extracted at n=2 consumers per banked format-SoT-shared-helper).
// Cards now click-through to /vendor/homeowners/:homeownerId detail
// page (Sold Projects + Documents). Card buttons (Message / Email)
// stop-propagation so they don't trigger the card-level navigate.

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

export default function VendorHomeowners() {
  const navigate = useNavigate()
  const homeowners = useVendorHomeowners()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return homeowners
    return homeowners.filter((h) =>
      matchesSearch({
        query: search,
        fields: [h.name, h.email, h.address],
        phones: [h.phone],
      }),
    )
  }, [homeowners, search])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homeowners"
        description={`${homeowners.length} ${homeowners.length === 1 ? 'homeowner has' : 'homeowners have'} sent you leads`}
      >
        {homeowners.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{homeowners.length} Total</span>
          </div>
        )}
      </PageHeader>

      {homeowners.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {homeowners.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No homeowners yet"
          description="They'll appear here when they send you a lead."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((homeowner, i) => (
            <motion.div key={`${homeowner.id}-${homeowner.email}`} custom={i} variants={fadeUp} initial="hidden" animate="visible">
              <Card
                className="rounded-xl shadow-sm hover:shadow-md transition flex flex-col h-full cursor-pointer"
                onClick={() => navigate(`/vendor/homeowners/${encodeURIComponent(homeowner.email)}`)}
              >
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start gap-3 mb-4">
                    <AvatarInitials
                      initials={homeowner.initials ?? homeowner.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                      color={homeowner.avatar_color ?? '#3b82f6'}
                      size="lg"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading font-semibold text-base truncate">{homeowner.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{homeowner.email}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </div>

                  <div className="space-y-2 mb-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{homeowner.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{homeowner.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-3.5 w-3.5 shrink-0" />
                      <span>{homeowner.projectCount} {homeowner.projectCount === 1 ? 'project' : 'projects'} with you</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate('/vendor/messages', { state: { homeownerId: homeowner.id, homeownerName: homeowner.name } })
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Message
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.location.href = `mailto:${homeowner.email}`
                      }}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
