import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  MapPin,
  Calendar,
  MessageSquare,
  Ban,
  Mail,
  Phone,
  Search,
  Users,
  Hammer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { StatusBadge } from '@/components/shared/status-badge'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { matchesSearch } from '@/lib/search-match'
import { ProjectDetailDialog } from '@/components/shared/project-detail-dialog'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import type { LeadStatus } from '@/types'

// ─── Mock Homeowners (extended) ───
const HOMEOWNERS = [
  { id: 'ho-1', name: 'Maria Rodriguez', email: 'maria@email.com', phone: '(305) 555-0101', address: '1234 Coral Way, Miami, FL 33145', avatar_color: '#3b82f6', initials: 'MR', status: 'active' as const, created_at: '2026-01-15T10:00:00Z' },
  { id: 'ho-2', name: 'James Thompson', email: 'james@email.com', phone: '(786) 555-0202', address: '5678 Kendall Dr, Miami, FL 33156', avatar_color: '#8b5cf6', initials: 'JT', status: 'active' as const, created_at: '2026-02-03T14:30:00Z' },
  { id: 'ho-3', name: 'Sarah Chen', email: 'sarah@email.com', phone: '(954) 555-0303', address: '910 Princeton Blvd, Homestead, FL 33032', avatar_color: '#ec4899', initials: 'SC', status: 'active' as const, created_at: '2026-02-20T09:15:00Z' },
  { id: 'ho-4', name: 'David Gonzalez', email: 'david.g@email.com', phone: '(305) 555-0404', address: '2200 Biscayne Blvd, Miami, FL 33137', avatar_color: '#f59e0b', initials: 'DG', status: 'pending' as const, created_at: '2026-03-10T08:45:00Z' },
  { id: 'ho-5', name: 'Lisa Patel', email: 'lisa.patel@email.com', phone: '(786) 555-0505', address: '4400 Collins Ave, Miami Beach, FL 33140', avatar_color: '#10b981', initials: 'LP', status: 'suspended' as const, created_at: '2026-01-28T11:20:00Z' },
]

// ─── Mock Customer Projects ───
interface CustomerProject {
  id: string
  homeowner_id: string
  project_name: string
  service_type: string
  status: LeadStatus
  date_submitted: string
  contractor_assigned: string
  // Optional secondary-address label — when set, the per-homeowner
  // Other-Addresses dropdown (ship #135) uses it to bucket projects by
  // property. Absent = Primary by default (see synthesis path in the
  // main component). Ship #137 added Maria's Beach House seed so the
  // dropdown renders out-of-the-box without requiring runtime cart-add.
  address_label?: string
}

const CUSTOMER_PROJECTS: CustomerProject[] = [
  // Maria — 3 Primary + 1 Beach House (ship #137 demo-seed for Other-Addresses
  // dropdown visibility per kratos msg 1776743704759).
  { id: 'cp-1', homeowner_id: 'ho-1', project_name: 'Full Roof Replacement - Barrel Tile', service_type: 'Roofing', status: 'confirmed', date_submitted: '2026-04-07T14:22:00Z', contractor_assigned: 'Apex Roofing & Solar' },
  { id: 'cp-2', homeowner_id: 'ho-1', project_name: 'Paver Driveway - Full Install', service_type: 'Driveways', status: 'rescheduled', date_submitted: '2026-04-05T11:30:00Z', contractor_assigned: 'Elite Paving Co' },
  { id: 'cp-3', homeowner_id: 'ho-1', project_name: 'Louvered Pergola 12x16', service_type: 'Pergolas', status: 'rejected', date_submitted: '2026-04-04T15:45:00Z', contractor_assigned: 'Paradise Pools FL' },
  { id: 'cp-1b', homeowner_id: 'ho-1', project_name: 'Pool & Spa - Key Largo Beach House', service_type: 'Pool & Oasis', status: 'pending', date_submitted: '2026-04-10T10:00:00Z', contractor_assigned: 'Paradise Pools FL', address_label: 'Beach House' },
  // James
  { id: 'cp-4', homeowner_id: 'ho-2', project_name: 'Impact Windows - Full Home', service_type: 'Windows & Doors', status: 'pending', date_submitted: '2026-04-08T09:45:00Z', contractor_assigned: 'Shield Impact Windows' },
  { id: 'cp-5', homeowner_id: 'ho-2', project_name: 'Metal Roof + Solar Prep', service_type: 'Roofing', status: 'pending', date_submitted: '2026-04-09T08:15:00Z', contractor_assigned: 'Apex Roofing & Solar' },
  { id: 'cp-6', homeowner_id: 'ho-2', project_name: 'Stamped Concrete Driveway', service_type: 'Driveways', status: 'completed', date_submitted: '2026-03-28T10:00:00Z', contractor_assigned: 'Elite Paving Co' },
  // Sarah
  { id: 'cp-7', homeowner_id: 'ho-3', project_name: 'Resort Pool with Spa & LED', service_type: 'Pool & Oasis', status: 'confirmed', date_submitted: '2026-04-06T16:10:00Z', contractor_assigned: 'Paradise Pools FL' },
  { id: 'cp-8', homeowner_id: 'ho-3', project_name: 'Central AC 3 Ton + Smart Thermostat', service_type: 'Air Conditioning', status: 'confirmed', date_submitted: '2026-04-08T13:00:00Z', contractor_assigned: 'Cool Breeze HVAC' },
  // David
  { id: 'cp-9', homeowner_id: 'ho-4', project_name: 'Impact Windows - Partial (Living Room)', service_type: 'Windows & Doors', status: 'pending', date_submitted: '2026-03-20T09:00:00Z', contractor_assigned: 'Shield Impact Windows' },
  { id: 'cp-10', homeowner_id: 'ho-4', project_name: 'Pool & Oasis - 15x30 Classic', service_type: 'Pool & Oasis', status: 'pending', date_submitted: '2026-03-22T14:30:00Z', contractor_assigned: 'Paradise Pools FL' },
  { id: 'cp-11', homeowner_id: 'ho-4', project_name: 'Board & Batten Wall Paneling', service_type: 'Wall Paneling', status: 'confirmed', date_submitted: '2026-03-18T10:15:00Z', contractor_assigned: 'Unassigned' },
  // Lisa
  { id: 'cp-12', homeowner_id: 'ho-5', project_name: 'Architectural Shingle Roof Repair', service_type: 'Roofing', status: 'completed', date_submitted: '2026-02-10T11:00:00Z', contractor_assigned: 'Apex Roofing & Solar' },
  { id: 'cp-13', homeowner_id: 'ho-5', project_name: 'Mini-Split AC - Multi Zone', service_type: 'Air Conditioning', status: 'completed', date_submitted: '2026-02-15T09:30:00Z', contractor_assigned: 'Cool Breeze HVAC' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

const statusColorMap: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export default function HomeownersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null)

  // Merge the static MOCK_HOMEOWNERS with any admin-moderation overrides so
  // suspend/reactivate reflects in the list + counts immediately. Subscribe
  // to the overrides MAP (not the selector fn) — zustand keeps function
  // identities stable across state updates, so a useMemo keyed on the
  // selector fn would never re-run; keying on the overrides object does.
  // When Tranche 2 wires lib/api/vendors.updateVendor to Supabase, this
  // layer becomes a read from profiles-by-role; the UX layer is unchanged.
  const homeownerStatusOverrides = useAdminModerationStore((s) => s.homeownerStatusOverrides)
  const suspendHomeowner = useAdminModerationStore((s) => s.suspendHomeowner)
  const reactivateHomeowner = useAdminModerationStore((s) => s.reactivateHomeowner)
  // Ship #250 — demoDataHidden flag gates raw fixture arrays on user-visible
  // surfaces. CUSTOMER_PROJECTS is a local fixture (not the shared mock-data
  // one) so we gate it inline here instead of through a shared hook.
  const demoDataHidden = useAdminModerationStore((s) => s.demoDataHidden)

  // Ship #250 — effective-fixture hook honors the demoDataHidden flag.
  const mockLeads = useEffectiveMockLeads()

  // Cross-tab rehydrate: admin-moderation + projects both persist to LS but
  // don't auto-sync across tabs. Rehydrate on focus so status changes +
  // homeowner cart-created projects surface here. Phase 2b admin-SoT per
  // kratos msg 1776725252468.
  const rehydrateModeration = useCallback(() => useAdminModerationStore.persist.rehydrate(), [])
  const rehydrateProjects = useCallback(() => useProjectsStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateModeration)
  useRefetchOnFocus(rehydrateProjects)

  // Live homeowner projects: merge CUSTOMER_PROJECTS fixtures with
  // sentProjects (cart-created flow). sentProjects know which homeowner via
  // homeowner.email (Profile.id used to not map back to mock ho-N ids, so
  // email is the stable bridge key).
  const sentProjects = useProjectsStore((s) => s.sentProjects)

  // Per-homeowner "Showing projects at: <label>" address filter (ship #135
  // per kratos msg 1776742863870). Silent no-op when a homeowner's
  // sentProjects only surface one distinct address label.
  const [addressFilterByHomeowner, setAddressFilterByHomeowner] = useState<Record<string, string>>({})

  // In-place project-detail Dialog (ship #140 replaces #139 navigate()).
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Ship #250 — gate the local CUSTOMER_PROJECTS fixture behind the
  // demoDataHidden flag the same way the shared mock fixtures are gated.
  const effectiveCustomerProjects = useMemo(
    () => (demoDataHidden ? [] : CUSTOMER_PROJECTS),
    [demoDataHidden]
  )

  const homeowners = useMemo(
    () =>
      HOMEOWNERS.map((h) => ({
        ...h,
        status: homeownerStatusOverrides[h.id] ?? h.status,
      })),
    [homeownerStatusOverrides]
  )

  // Multi-field search (ship #134) via shared matchesSearch util: name /
  // email / phone (digits-normalized) / address / project-id (fixture
  // CUSTOMER_PROJECTS + sentProject ids bridged via homeowner.email).
  const filtered = useMemo(() => {
    if (!search.trim()) return homeowners
    return homeowners.filter((h) => {
      const projectIds = [
        ...effectiveCustomerProjects.filter((p) => p.homeowner_id === h.id).map((p) => p.id),
        ...sentProjects.filter((sp) => sp.homeowner?.email === h.email).map((sp) => sp.id),
      ]
      return matchesSearch({
        query: search,
        fields: [h.name, h.email, h.address],
        phones: [h.phone],
        ids: projectIds,
      })
    })
  }, [search, homeowners, sentProjects, effectiveCustomerProjects])

  const handleMessage = (homeowner: { id: string; name: string }) => {
    navigate('/admin/messages', { state: { homeownerId: homeowner.id, homeownerName: homeowner.name } })
  }

  const handleEmail = (homeowner: { email: string }) => {
    window.location.href = `mailto:${homeowner.email}`
  }

  const handleSuspend = (homeowner: { id: string; name: string }) => {
    setSuspendTarget({ id: homeowner.id, name: homeowner.name })
  }

  const confirmSuspend = () => {
    if (!suspendTarget) return
    suspendHomeowner(suspendTarget.id)
    const name = suspendTarget.name
    const id = suspendTarget.id
    toast.success(`${name} suspended`, {
      action: { label: 'Undo', onClick: () => reactivateHomeowner(id) },
    })
    setSuspendTarget(null)
  }

  const handleReactivate = (homeowner: { id: string; name: string }) => {
    reactivateHomeowner(homeowner.id)
    toast.success(`${homeowner.name} reactivated`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homeowner Management"
        description={`${HOMEOWNERS.length} registered homeowners`}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {homeowners.filter((h) => h.status === 'active').length} Active
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-sm">
            <span className="font-medium text-amber-800 dark:text-amber-400">
              {homeowners.filter((h) => h.status === 'pending').length} Pending
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1.5 text-sm">
            <span className="font-medium text-red-800 dark:text-red-400">
              {homeowners.filter((h) => h.status === 'suspended').length} Suspended
            </span>
          </div>
        </div>
      </PageHeader>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search name, email, phone, address, or project ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Homeowner Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((homeowner, i) => {
          const fixtureProjects: (CustomerProject & { address_label?: string })[] = effectiveCustomerProjects
            .filter((p) => p.homeowner_id === homeowner.id)
            .map((p) => ({ ...p, address_label: p.address_label ?? 'Primary' }))
          // Merge sentProjects: cart-created projects where the homeowner
          // email matches (stable bridge to mock ho-N ids). Synthesize
          // CustomerProject rows so the existing renderer handles both.
          // Carry sp.item.address?.label through as address_label so the
          // /admin/homeowners Other-Addresses filter can resolve against
          // either path (ship #135).
          const sentForHomeowner: (CustomerProject & { address_label?: string })[] = sentProjects
            .filter((sp) => sp.homeowner?.email === homeowner.email)
            .map((sp) => ({
              id: sp.id,
              homeowner_id: homeowner.id,
              project_name: sp.item.serviceName,
              service_type: sp.item.serviceName,
              status: (sp.status === 'sold'
                ? 'completed'
                : sp.status === 'approved'
                  ? 'confirmed'
                  : sp.status === 'declined'
                    ? 'rejected'
                    : 'pending') as LeadStatus,
              date_submitted: sp.sentAt,
              contractor_assigned: sp.contractor?.company ?? 'Unassigned',
              address_label: sp.item.address?.label ?? 'Primary',
            }))
          const allProjects = [...sentForHomeowner, ...fixtureProjects]

          // Distinct address labels across this homeowner's projects — used
          // to decide whether to surface the Other-Addresses filter. Silent
          // no-op if only one distinct label (per kratos spec 1776742863870:
          // "If homeowner has no additional addresses, no UI surfaces").
          const distinctAddressLabels = Array.from(new Set(
            allProjects.map((p) => p.address_label ?? 'Primary')
          ))
          const showAddressFilter = distinctAddressLabels.length >= 2
          // Ship #138: add 'All Properties' as first dropdown option; keep
          // Primary as default for single-focus view.
          const ALL_ADDRESSES = 'All Properties'
          const selectedAddress = addressFilterByHomeowner[homeowner.id] ?? 'Primary'
          const projects = showAddressFilter && selectedAddress !== ALL_ADDRESSES
            ? allProjects.filter((p) => (p.address_label ?? 'Primary') === selectedAddress)
            : allProjects
          // Grouped-by-address view when 'All Properties' is selected — small
          // address subheader above each group so admin can visually distinguish
          // which property each project belongs to.
          const showGrouped = showAddressFilter && selectedAddress === ALL_ADDRESSES
          const groupedProjects: { label: string; items: typeof projects }[] = showGrouped
            ? distinctAddressLabels
                .sort((a, b) => (a === 'Primary' ? -1 : b === 'Primary' ? 1 : a.localeCompare(b)))
                .map((label) => ({
                  label,
                  items: projects.filter((p) => (p.address_label ?? 'Primary') === label),
                }))
                .filter((g) => g.items.length > 0)
            : []
          return (
            <motion.div
              key={homeowner.id}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
            >
              <Card className="rounded-xl shadow-sm hover:shadow-md transition flex flex-col">
                <CardContent className="p-5 flex-1 flex flex-col">
                  {/* Header — Ship #280: name+email row click-to-detail
                      (small affordance). Existing per-card buttons
                      keep their own click semantics — no stopPropagation
                      sprawl across the many inline handlers in this
                      file. Vendor side wraps whole card; admin side
                      uses targeted name-click since the per-card body
                      has many existing actions. */}
                  <div className="flex items-start gap-3 mb-4">
                    <AvatarInitials
                      initials={homeowner.initials}
                      color={homeowner.avatar_color}
                      size="lg"
                    />
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate(`/admin/homeowners/${encodeURIComponent(homeowner.email)}`)}
                    >
                      <h3 className="font-heading font-semibold text-base truncate hover:text-primary transition-colors">
                        {homeowner.name}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {homeowner.email}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                            statusColorMap[homeowner.status]
                          )}
                        >
                          {homeowner.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="space-y-2 mb-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{homeowner.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{homeowner.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Joined{' '}
                        {new Date(homeowner.created_at).toLocaleDateString(
                          'en-US',
                          { month: 'short', day: 'numeric', year: 'numeric' }
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">
                        Projects
                      </p>
                      <p className="text-lg font-bold font-heading">
                        {projects.length}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">
                        Completed
                      </p>
                      <p className="text-lg font-bold font-heading">
                        {projects.filter((p) => p.status === 'completed').length}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      aria-label={`Message ${homeowner.name}`}
                      onClick={() => handleMessage(homeowner)}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Message
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      aria-label={`Email ${homeowner.name}`}
                      onClick={() => handleEmail(homeowner)}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </Button>
                    {homeowner.status !== 'suspended' ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1.5"
                        aria-label={`Suspend ${homeowner.name}`}
                        onClick={() => handleSuspend(homeowner)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Suspend
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        aria-label={`Reactivate ${homeowner.name}`}
                        onClick={() => handleReactivate(homeowner)}
                      >
                        Reactivate
                      </Button>
                    )}
                  </div>

                  {/* Projects Accordion */}
                  <Accordion type="single" collapsible className="mt-auto">
                    <AccordionItem value="projects">
                      <AccordionTrigger className="text-sm">
                        <div className="flex items-center gap-2">
                          <Hammer className="h-4 w-4 text-muted-foreground" />
                          <span>Customer Projects ({projects.length})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {showAddressFilter && (
                          <div className="mb-3 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <label className="text-xs text-muted-foreground shrink-0" htmlFor={`addr-filter-${homeowner.id}`}>
                              Showing projects at:
                            </label>
                            <select
                              id={`addr-filter-${homeowner.id}`}
                              value={selectedAddress}
                              onChange={(e) =>
                                setAddressFilterByHomeowner((prev) => ({
                                  ...prev,
                                  [homeowner.id]: e.target.value,
                                }))
                              }
                              className="flex-1 bg-background rounded border text-xs px-2 py-1"
                              aria-label={`Filter projects by address for ${homeowner.name}`}
                            >
                              <option value={ALL_ADDRESSES}>{ALL_ADDRESSES}</option>
                              {distinctAddressLabels
                                .sort((a, b) => (a === 'Primary' ? -1 : b === 'Primary' ? 1 : a.localeCompare(b)))
                                .map((label) => (
                                  <option key={label} value={label}>{label}</option>
                                ))}
                            </select>
                          </div>
                        )}
                        {projects.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">
                            No projects yet
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">
                                  Project
                                </TableHead>
                                <TableHead className="text-xs">
                                  Service
                                </TableHead>
                                <TableHead className="text-xs">
                                  Status
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {showGrouped
                                ? groupedProjects.flatMap((group) => [
                                    <TableRow key={`group-${group.label}`} className="bg-muted/30 hover:bg-muted/30">
                                      <TableCell colSpan={3} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-1.5">
                                        <span className="flex items-center gap-1.5">
                                          <MapPin className="h-3 w-3" />
                                          {group.label} ({group.items.length})
                                        </span>
                                      </TableCell>
                                    </TableRow>,
                                    ...group.items.map((proj) => (
                                      <TableRow
                                        key={proj.id}
                                        className="cursor-pointer hover:bg-muted/40"
                                        onClick={() => {
                                          // Ship #151 P0 fix: CUSTOMER_PROJECTS
                                          // fixture ids (cp-N) aren't in MOCK_
                                          // LEADS/sentProjects so ProjectDetail
                                          // Dialog can't resolve them. Bridge
                                          // cp-N → matching MOCK_LEAD via
                                          // homeowner_id + project-name prefix
                                          // match (handles em-dash vs hyphen
                                          // variance). sentProject synth rows
                                          // pass through directly (sp.id in
                                          // sentProjects).
                                          let resolvedId = proj.id
                                          if (proj.id.startsWith('cp-')) {
                                            const matched = mockLeads.find((l) => {
                                              if (l.homeowner_id !== proj.homeowner_id) return false
                                              const leadPrefix = l.project.split(/[-—]/)[0].trim().toLowerCase()
                                              const projPrefix = proj.project_name.split(/[-—]/)[0].trim().toLowerCase()
                                              return leadPrefix === projPrefix || projPrefix.includes(leadPrefix) || leadPrefix.includes(projPrefix)
                                            })
                                            if (matched) resolvedId = matched.id
                                          }
                                          setSelectedProjectId(resolvedId)
                                        }}
                                      >
                                        <TableCell className="text-xs font-medium max-w-[140px]">
                                          <div className="truncate">{proj.project_name}</div>
                                          <div className="text-[10px] text-muted-foreground mt-0.5">
                                            {new Date(proj.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-xs">{proj.service_type}</TableCell>
                                        <TableCell>
                                          <StatusBadge status={proj.status} className="text-[10px] px-2 py-0" />
                                        </TableCell>
                                      </TableRow>
                                    )),
                                  ])
                                : projects.map((proj) => (
                                    <TableRow
                                      key={proj.id}
                                      className="cursor-pointer hover:bg-muted/40"
                                      onClick={() => {
                                        // Ship #152 P0 — flat-mode branch
                                        // got missed by #151 replace_all
                                        // (multi-line onClick pattern drift
                                        // broke the single-line flat-mode
                                        // match). Second instance of the
                                        // replace_all-blindspot-on-multi-
                                        // branch-render pattern I banked at
                                        // #141 — applied replace_all but the
                                        // CODE-SHAPE divergence between the
                                        // two branches post-edit broke the
                                        // symmetry. Post-edit grep is the
                                        // right cheap-insurance discipline.
                                        let resolvedId = proj.id
                                        if (proj.id.startsWith('cp-')) {
                                          const matched = mockLeads.find((l) => {
                                            if (l.homeowner_id !== proj.homeowner_id) return false
                                            const leadPrefix = l.project.split(/[-—]/)[0].trim().toLowerCase()
                                            const projPrefix = proj.project_name.split(/[-—]/)[0].trim().toLowerCase()
                                            return leadPrefix === projPrefix || projPrefix.includes(leadPrefix) || leadPrefix.includes(projPrefix)
                                          })
                                          if (matched) resolvedId = matched.id
                                        }
                                        setSelectedProjectId(resolvedId)
                                      }}
                                    >
                                      <TableCell className="text-xs font-medium max-w-[140px]">
                                        <div className="truncate">{proj.project_name}</div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                          {new Date(proj.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-xs">{proj.service_type}</TableCell>
                                      <TableCell>
                                        <StatusBadge status={proj.status} className="text-[10px] px-2 py-0" />
                                      </TableCell>
                                    </TableRow>
                                  ))}
                            </TableBody>
                          </Table>
                        )}
                        {projects.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">
                                Last contractor:
                              </span>{' '}
                              {projects[0].contractor_assigned}
                            </p>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No homeowners found matching "{search}"
          </p>
        </div>
      )}

      {/* Suspend confirmation */}
      <Dialog open={!!suspendTarget} onOpenChange={(open) => !open && setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {suspendTarget?.name}?</DialogTitle>
            <DialogDescription>
              Suspended homeowners cannot book new projects or message contractors. You can reactivate them at any time from this page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmSuspend}>
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectDetailDialog
        open={!!selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
        projectId={selectedProjectId}
      />
    </div>
  )
}
