import { useState, useEffect, useRef } from 'react'
import { maybeBackfillLegacyApprovals } from '@/lib/legacy-completed-approval-backfill'
import { toast } from 'sonner'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Inbox, CalendarDays, Package, Landmark, MessageCircle, User, Menu, PanelLeftClose, PanelLeft, Inbox as InboxIcon, BadgeCheck, UsersRound, Home as HomeIcon, RotateCcw, CheckCircle2, X as XIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { NotificationBell, type NotificationItem } from '@/components/shared/notification-bell'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useVendorScope } from '@/lib/vendor-scope'
import { useVendorLeadStages } from '@/lib/vendor-lead-stages'
import { NavBadge, type NavBadgeTone } from '@/components/layout/nav-badge'
import { NonCircumventionAgreementDialog } from '@/components/shared/non-circumvention-agreement-dialog'
import { CURRENT_AGREEMENT_VERSION } from '@/lib/non-circumvention-agreement'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/vendor', icon: LayoutDashboard, label: 'Dashboard' },
  // Ship #293 — Lead Workflow tab between Dashboard and Projects per
  // funnel-from-summary-to-detail mental model.
  { to: '/vendor/lead-workflow', icon: InboxIcon, label: 'Lead Workflow' },
  { to: '/vendor/leads', icon: Inbox, label: 'Projects' },
  // Ship #277 — Homeowners tab between Projects and Calendar per
  // customer-data-grouping cluster (Projects/Homeowners/Calendar are
  // all customer-facing surfaces; Account Reps/Membership are
  // internal-team config).
  { to: '/vendor/homeowners', icon: HomeIcon, label: 'Homeowners' },
  { to: '/vendor/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/vendor/catalog', icon: Package, label: 'Products' },
  { to: '/vendor/banking', icon: Landmark, label: 'Banking' },
  { to: '/vendor/account-reps', icon: UsersRound, label: 'Account Reps' },
  { to: '/vendor/membership', icon: BadgeCheck, label: 'Membership' },
  { to: '/vendor/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/vendor/profile', icon: User, label: 'Profile' },
]

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  // Ship #328 — nav-badges per Rodolfo "in projects how the number of
  // projects next to the name and on lead workflow show only new lead
  // number next to the name". Counts read from useVendorLeadStages
  // shared helper (#103 SoT — same hook backs the lead-workflow tile
  // counts + Performance Stats lead-flow row, so badge counts stay in
  // sync with on-page tile counts automatically).
  // - Projects badge: total leads count (all of vendor's projects in
  //   pipeline regardless of stage) — neutral tone since it's a total
  //   not an action-pending signal
  // - Lead Workflow badge: new-leads stage count only — amber tone
  //   matching the new-leads stage color (LEAD_STAGES[0].color
  //   bg-amber-500) for visual-association with the on-page tile
  // Hidden when sidebar collapsed (no label to be next-to per
  // #98 small-scope-clean; collapsed mode trades counts for icon-only
  // density).
  const { leads, counts } = useVendorLeadStages()

  const badgesByRoute: Record<string, { count: number; tone: NavBadgeTone }> = collapsed
    ? {}
    : {
        '/vendor/leads': { count: leads.length, tone: 'neutral' },
        '/vendor/lead-workflow': { count: counts.new ?? 0, tone: 'amber' },
      }

  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {navItems.map(({ to, icon: Icon, label }) => {
        const badge = badgesByRoute[to]
        return (
          <NavLink key={to} to={to} end={to === '/vendor'} onClick={onNavigate}>
            {({ isActive }) => (
              <div className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                collapsed && 'justify-center px-2'
              )}>
                <Icon className="h-4.5 w-4.5 shrink-0" />
                {!collapsed && <span className="flex-1">{label}</span>}
                {!collapsed && badge && (
                  <NavBadge count={badge.count} tone={badge.tone} isActive={isActive} />
                )}
              </div>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

export function VendorLayout() {
  const isMobile = useMobile()
  const profile = useAuthStore((s) => s.profile)
  const location = useLocation()
  const navigate = useNavigate()
  const { sidebarCollapsed, toggleSidebarCollapsed } = useUIStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Ship #318 — one-time backfill of legacy completedAt-set entries
  // that lack reviewStatus (pre-#317 sentProjects). Idempotent via
  // localStorage flag inside maybeBackfillLegacyApprovals().
  useEffect(() => {
    maybeBackfillLegacyApprovals()
  }, [])

  // Ship #250 — effective-fixture hook honors the demoDataHidden flag.
  const mockLeads = useEffectiveMockLeads()

  // Vendor notifications = pending leads awaiting action. Resolve the
  // current vendor's id via useVendorScope so the demo-alias LS override
  // (#222) and the DEMO_VENDOR_UUID_BY_MOCK_ID reverse-map both apply
  // — pre-#264 this layout had its own inline reverse-lookup that
  // missed the LS alias, so generic Vendor demo'd notification count
  // could fall through. task_1776835392387_106 fix.
  const { vendorId: vendorIdForLeads } = useVendorScope()
  const pendingLeads = mockLeads.filter(
    (l) => l.vendor_id === vendorIdForLeads && l.status === 'pending'
  )

  // Ship #240 — cross-role notification event derivations. Pattern is
  // "derive from state" (option A): each event-type filters the relevant
  // projects-store map and synthesizes NotificationItems. Scoped to this
  // vendor's leads via myLeadIds so cross-vendor events don't leak on
  // multi-vendor demo sessions. To extend with future event types
  // (new payment received, new review posted, etc.), add a new
  // filter-and-map block here and concat into `notifications`.
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const rescheduleRequestsMap = useProjectsStore((s) => s.rescheduleRequestsByLead)
  const cancellationRequestsMap = useProjectsStore((s) => s.cancellationRequestsByLead)
  const RECENT_RESOLVED_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h — resolved events surface briefly then drop off

  const myLeadIds = new Set<string>([
    ...mockLeads.filter((l) => l.vendor_id === vendorIdForLeads).map((l) => l.id),
    ...sentProjects
      .filter((p) => p.contractor?.vendor_id === vendorIdForLeads)
      .map((p) => `L-${p.id.slice(0, 4).toUpperCase()}`),
  ])

  const rescheduleNotifications: NotificationItem[] = Object.entries(rescheduleRequestsMap)
    .filter(([leadId]) => myLeadIds.has(leadId))
    .flatMap(([leadId, r]) => {
      // Homeowner-initiated pending reschedule — needs vendor action
      if (r.status === 'pending' && r.requestedBy === 'homeowner') {
        return [{
          id: `reschedule-${leadId}-h-pending`,
          title: 'Homeowner requested reschedule',
          description: `New time: ${r.proposedDate} · ${r.proposedTime}`,
          icon: RotateCcw,
          iconColor: 'text-amber-600',
          tint: 'bg-amber-50/50 dark:bg-amber-950/20',
        }]
      }
      // Vendor-initiated resolved recently — informational
      if (r.requestedBy === 'vendor' && r.resolvedAt) {
        const age = Date.now() - new Date(r.resolvedAt).getTime()
        if (age > RECENT_RESOLVED_WINDOW_MS) return []
        if (r.status === 'approved') {
          return [{
            id: `reschedule-${leadId}-v-approved`,
            title: 'Homeowner approved your new time',
            description: `${r.proposedDate} · ${r.proposedTime}`,
            icon: CheckCircle2,
            iconColor: 'text-emerald-600',
            tint: 'bg-emerald-50/50 dark:bg-emerald-950/20',
          }]
        }
        if (r.status === 'rejected') {
          return [{
            id: `reschedule-${leadId}-v-rejected`,
            title: 'Homeowner kept the original time',
            description: 'Your reschedule proposal was declined.',
            icon: XIcon,
            iconColor: 'text-muted-foreground',
            tint: 'bg-muted/30',
          }]
        }
      }
      return []
    })

  const cancellationNotifications: NotificationItem[] = Object.entries(cancellationRequestsMap)
    .filter(([leadId]) => myLeadIds.has(leadId))
    .flatMap(([leadId, c]) => {
      // Homeowner-initiated pending cancellation — needs vendor action
      if (c.status === 'pending') {
        return [{
          id: `cancel-${leadId}-pending`,
          title: 'Cancellation requested',
          description: c.reason ?? 'Homeowner wants to cancel this project.',
          icon: XIcon,
          iconColor: 'text-destructive',
          tint: 'bg-destructive/5',
        }]
      }
      return []
    })

  const notifications: NotificationItem[] = [
    ...pendingLeads.map((l) => ({
      id: l.id,
      title: 'New Lead',
      description: `${l.homeowner_name} — ${l.project}`,
      icon: InboxIcon,
      iconColor: 'text-primary',
      tint: 'bg-primary/5',
    })),
    ...rescheduleNotifications,
    ...cancellationNotifications,
  ]

  // New-lead toast delta detection (ship #108 Phase C per kratos msg
  // 1776718477775). Compare current notification IDs to last-seen set in
  // localStorage; fire a sonner toast for each new lead. On first render,
  // mark all as seen without firing — prevents spam on every layout
  // mount. Real SMS/email infra deferred to Tranche-2 (Supabase Edge
  // Function + Twilio / Resend).
  const LAST_SEEN_KEY = 'buildconnect-vendor-last-seen-lead-ids'
  const firstRenderRef = useRef(true)
  useEffect(() => {
    const currentIds = new Set(notifications.map((n) => n.id))
    let seenIds: Set<string>
    try {
      const raw = localStorage.getItem(LAST_SEEN_KEY)
      seenIds = new Set<string>(raw ? JSON.parse(raw) : [])
    } catch {
      seenIds = new Set<string>()
    }

    if (firstRenderRef.current) {
      firstRenderRef.current = false
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify([...currentIds]))
      return
    }

    const newOnes = notifications.filter((n) => !seenIds.has(n.id))
    for (const n of newOnes) {
      toast(n.title, {
        description: n.description,
        icon: <InboxIcon className="h-4 w-4 text-primary" />,
      })
    }
    if (newOnes.length > 0) {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify([...currentIds]))
    }
  }, [notifications])

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className={cn(
          'fixed inset-y-0 left-0 z-30 border-r bg-sidebar transition-all duration-200',
          sidebarCollapsed ? 'w-[4.5rem]' : 'w-64'
        )}>
          <div className="flex h-16 items-center justify-between border-b px-4">
            <Logo collapsed={sidebarCollapsed} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
            >
              {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
          <SidebarNav collapsed={sidebarCollapsed} />
        </aside>
      )}

      {/* Main area */}
      <div className={cn(!isMobile && (sidebarCollapsed ? 'ml-[4.5rem]' : 'ml-64'), 'transition-all duration-200')}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-12 sm:h-16 items-center justify-between border-b bg-background/80 backdrop-blur-lg px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open navigation menu"><Menu className="h-5 w-5" /></Button>
                </SheetTrigger>
                <SheetContent side="left" className="sheet-floating w-52 p-0 pt-4">
                  <div className="px-3 mb-3"><Logo /></div>
                  <SidebarNav collapsed={false} onNavigate={() => setMobileMenuOpen(false)} />
                </SheetContent>
              </Sheet>
            )}
            {isMobile && <Logo />}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell notifications={notifications} />
            <ThemeToggle />
            {profile && (
              <button
                onClick={() => navigate('/vendor/profile')}
                className="cursor-pointer"
                aria-label="Profile"
              >
                <AvatarInitials initials={profile.initials} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="sm" />
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="p-3 sm:p-6 w-full overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Ship #270 — Non-circumvention agreement gate. Single insertion
          point handles fresh-signup landing, login-resume, AND
          version-bump re-prompt. Dialog renders blocking when the
          authed vendor's signed-version doesn't match the current
          version constant. profile.role === 'vendor' guard prevents
          mid-redirect homeowner/admin flash from triggering the gate.
          When dismissible={false}, the only exits are Sign Agreement
          (updates profile + closes via state flip) or Sign Out
          (clears session). */}
      {profile?.role === 'vendor'
        && profile.noncircumvention_agreement_version !== CURRENT_AGREEMENT_VERSION
        && (
          <NonCircumventionAgreementDialog mode="sign" open />
        )}
    </div>
  )
}
