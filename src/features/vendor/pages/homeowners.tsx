import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import { Search, Users, MessageSquare, Mail, MapPin, Phone, Briefcase } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { EmptyState } from '@/components/shared/empty-state'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useProjectsStore } from '@/stores/projects-store'
import { useVendorScope, useResolvedVendor } from '@/lib/vendor-scope'
import { matchesSearch } from '@/lib/search-match'
import { MOCK_HOMEOWNERS } from '@/lib/mock-data'

// Ship #277 — vendor-side Homeowners roster. Mirrors admin/homeowners
// visual idiom but vendor-scoped to "homeowners I've served." Three
// data sources deduped by email:
//   (a) MOCK_LEADS filtered by vendor_id — fixture leads
//   (b) sentProjects filtered by contractor.vendor_id||contractor.company
//       (matches lead-inbox.tsx #214 strict-filter shape)
//   (c) ADMIN_HOMEOWNER_FIXTURES filtered by their CUSTOMER_PROJECTS
//       contractor_assigned matching this vendor.company
// Per-card actions trimmed to Message + Email — Suspend/Reactivate
// stays admin-only (banked label-as-contract: "Homeowners" tab promises
// "my homeowners," not "homeowners I can moderate"). Empty state sets
// expectation: leads create the roster.

interface HomeownerCardEntry {
  id: string
  name: string
  email: string
  phone: string
  address: string
  avatar_color?: string
  initials?: string
  projectCount: number
}

// Local fixture mirror of admin/homeowners.tsx HOMEOWNERS const +
// CUSTOMER_PROJECTS contractor_assigned mapping. Inline because the
// admin file's inline arrays are not exported; surface-vs-deep audit
// today says don't extract until n=3+ consumers (we're at n=2).
const ADMIN_FIXTURE_HOMEOWNERS: HomeownerCardEntry[] = [
  { id: 'ho-1', name: 'Maria Rodriguez', email: 'maria@email.com', phone: '(305) 555-0101', address: '1234 Coral Way, Miami, FL 33145', avatar_color: '#3b82f6', initials: 'MR', projectCount: 0 },
  { id: 'ho-2', name: 'James Thompson', email: 'james@email.com', phone: '(786) 555-0202', address: '5678 Kendall Dr, Miami, FL 33156', avatar_color: '#8b5cf6', initials: 'JT', projectCount: 0 },
  { id: 'ho-3', name: 'Sarah Chen', email: 'sarah@email.com', phone: '(954) 555-0303', address: '910 Princeton Blvd, Homestead, FL 33032', avatar_color: '#ec4899', initials: 'SC', projectCount: 0 },
  { id: 'ho-4', name: 'David Gonzalez', email: 'david.g@email.com', phone: '(305) 555-0404', address: '2200 Biscayne Blvd, Miami, FL 33137', avatar_color: '#f59e0b', initials: 'DG', projectCount: 0 },
  { id: 'ho-5', name: 'Lisa Patel', email: 'lisa.patel@email.com', phone: '(786) 555-0505', address: '4400 Collins Ave, Miami Beach, FL 33140', avatar_color: '#10b981', initials: 'LP', projectCount: 0 },
]

// Static map of homeowner → vendor.company contractor_assigned (mirrors
// admin/homeowners.tsx CUSTOMER_PROJECTS contractor_assigned). Drives
// the source-c filter below.
const HOMEOWNER_VENDOR_COMPANIES: Record<string, string[]> = {
  'ho-1': ['Apex Roofing & Solar', 'Elite Paving Co', 'Paradise Pools FL'],
  'ho-2': ['Shield Impact Windows', 'Apex Roofing & Solar', 'Elite Paving Co'],
  'ho-3': ['Paradise Pools FL', 'Cool Breeze HVAC'],
  'ho-4': ['Shield Impact Windows', 'Paradise Pools FL'],
  'ho-5': ['Apex Roofing & Solar', 'Cool Breeze HVAC'],
}

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
  const { vendorId } = useVendorScope()
  const vendor = useResolvedVendor()
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const mockLeads = useEffectiveMockLeads()
  const [search, setSearch] = useState('')

  // Three-source dedup-by-email filter.
  const homeowners: HomeownerCardEntry[] = useMemo(() => {
    if (!vendor) return []
    const byEmail = new Map<string, HomeownerCardEntry>()
    const bumpProjectCount = (entry: HomeownerCardEntry) => {
      const prior = byEmail.get(entry.email)
      if (prior) {
        prior.projectCount += entry.projectCount
      } else {
        byEmail.set(entry.email, { ...entry })
      }
    }

    // (a) MOCK_LEADS filtered by vendor_id — has homeowner_name + email
    // + address per lead (no avatar fields). Look up MOCK_HOMEOWNERS for
    // avatar/initials when matchable; fall back to lead-derived display.
    mockLeads
      .filter((l) => l.vendor_id === vendorId)
      .forEach((l) => {
        const fixtureMatch = MOCK_HOMEOWNERS.find((h) => h.email === l.email)
        bumpProjectCount({
          id: fixtureMatch?.id ?? l.homeowner_id,
          name: fixtureMatch?.name ?? l.homeowner_name,
          email: l.email,
          phone: l.phone,
          address: l.address,
          avatar_color: fixtureMatch?.avatar_color,
          initials: fixtureMatch?.initials,
          projectCount: 1,
        })
      })

    // (b) sentProjects filtered by contractor.vendor_id (preferred) or
    // contractor.company (legacy fallback). Matches lead-inbox.tsx
    // #214 strict-filter shape.
    sentProjects
      .filter((sp) => {
        if (sp.contractor?.vendor_id) return sp.contractor.vendor_id === vendor.id
        return sp.contractor?.company === vendor.company
      })
      .forEach((sp) => {
        if (!sp.homeowner?.email) return
        const fixtureMatch =
          MOCK_HOMEOWNERS.find((h) => h.email === sp.homeowner!.email) ??
          ADMIN_FIXTURE_HOMEOWNERS.find((h) => h.email === sp.homeowner!.email)
        bumpProjectCount({
          id: fixtureMatch?.id ?? sp.id,
          name: fixtureMatch?.name ?? sp.homeowner.name,
          email: sp.homeowner.email,
          phone: fixtureMatch?.phone ?? sp.homeowner.phone,
          address: fixtureMatch?.address ?? sp.homeowner.address,
          avatar_color: fixtureMatch?.avatar_color,
          initials: fixtureMatch?.initials,
          projectCount: 1,
        })
      })

    // (c) Admin-fixture homeowners whose CUSTOMER_PROJECTS reference
    // this vendor.company. Surfaces ho-N entries from the admin demo
    // seed even when no MOCK_LEADS or sentProjects exist for them.
    Object.entries(HOMEOWNER_VENDOR_COMPANIES).forEach(([hoId, companies]) => {
      if (!companies.includes(vendor.company)) return
      const entry = ADMIN_FIXTURE_HOMEOWNERS.find((h) => h.id === hoId)
      if (!entry) return
      const occurrences = companies.filter((c) => c === vendor.company).length
      bumpProjectCount({ ...entry, projectCount: occurrences })
    })

    return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [vendor, vendorId, mockLeads, sentProjects])

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
              <Card className="rounded-xl shadow-sm hover:shadow-md transition flex flex-col h-full">
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
                      onClick={() => navigate('/vendor/messages', { state: { homeownerId: homeowner.id, homeownerName: homeowner.name } })}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Message
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => { window.location.href = `mailto:${homeowner.email}` }}
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
