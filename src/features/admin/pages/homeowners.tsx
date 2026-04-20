import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
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
  FileText,
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
}

const CUSTOMER_PROJECTS: CustomerProject[] = [
  // Maria
  { id: 'cp-1', homeowner_id: 'ho-1', project_name: 'Full Roof Replacement - Barrel Tile', service_type: 'Roofing', status: 'confirmed', date_submitted: '2026-04-07T14:22:00Z', contractor_assigned: 'Apex Roofing & Solar' },
  { id: 'cp-2', homeowner_id: 'ho-1', project_name: 'Paver Driveway - Full Install', service_type: 'Driveways', status: 'rescheduled', date_submitted: '2026-04-05T11:30:00Z', contractor_assigned: 'Elite Paving Co' },
  { id: 'cp-3', homeowner_id: 'ho-1', project_name: 'Louvered Pergola 12x16', service_type: 'Pergolas', status: 'rejected', date_submitted: '2026-04-04T15:45:00Z', contractor_assigned: 'Paradise Pools FL' },
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
}

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

  const homeowners = useMemo(
    () =>
      HOMEOWNERS.map((h) => ({
        ...h,
        status: homeownerStatusOverrides[h.id] ?? h.status,
      })),
    [homeownerStatusOverrides]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return homeowners
    return homeowners.filter(
      (h) => h.name.toLowerCase().includes(q) || h.email.toLowerCase().includes(q)
    )
  }, [search, homeowners])

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
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Homeowner Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((homeowner, i) => {
          const fixtureProjects = CUSTOMER_PROJECTS.filter(
            (p) => p.homeowner_id === homeowner.id
          )
          // Merge sentProjects: cart-created projects where the homeowner
          // email matches (stable bridge to mock ho-N ids). Synthesize
          // CustomerProject rows so the existing renderer handles both.
          const sentForHomeowner: CustomerProject[] = sentProjects
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
            }))
          const projects = [...sentForHomeowner, ...fixtureProjects]
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
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <AvatarInitials
                      initials={homeowner.initials}
                      color={homeowner.avatar_color}
                      size="lg"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading font-semibold text-base truncate">
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
                              {projects.map((proj) => (
                                <TableRow key={proj.id}>
                                  <TableCell className="text-xs font-medium max-w-[140px]">
                                    <div className="truncate">
                                      {proj.project_name}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {new Date(
                                        proj.date_submitted
                                      ).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {proj.service_type}
                                  </TableCell>
                                  <TableCell>
                                    <StatusBadge
                                      status={proj.status}
                                      className="text-[10px] px-2 py-0"
                                    />
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
    </div>
  )
}
