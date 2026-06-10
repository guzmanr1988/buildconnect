import { useState, useMemo, useEffect } from 'react'
import { maybeBackfillLegacyApprovals } from '@/lib/legacy-completed-approval-backfill'
import { maybeSeedSampleReview } from '@/lib/sample-review-seed'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, DollarSign, Users, Receipt, Landmark, Settings, Bug as BugIcon, Menu, Package, Home, User, GitBranch, MessageSquare, FileText, AlertCircle, UserCog, PlayCircle, RotateCcw, X as XIcon, Activity as ActivityIcon, ChevronDown, ChevronRight, ShieldCheck, Wallet, LifeBuoy } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { NotificationBell, type NotificationItem } from '@/components/shared/notification-bell'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useAgreementEventsStore } from '@/stores/agreement-events-store'
import { supabase } from '@/lib/supabase'
import type { Bug } from '@/types'
import { NavBadge, type NavBadgeTone } from '@/components/layout/nav-badge'
import { Footer } from '@/components/layout/footer'
import { cn } from '@/lib/utils'

type NavLeaf = { to: string; icon: typeof LayoutDashboard; label: string }
type NavGroup = NavLeaf & { children: NavLeaf[] }
type NavEntry = NavLeaf | NavGroup

// Ship #298 — Banking nav-item is a dropdown group; Transactions +
// Reports nest under it per Rodolfo "in admin menu in banking have a
// drop menu and include transactions and reports under". Parent click
// still navigates to /admin/banking (label-as-contract); chevron
// toggles expand. Auto-expand when parent-route or any child-route is
// active.
const navItems: NavEntry[] = [
  { to: '/admin/profile', icon: User, label: 'Profile' },
  { to: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/vendors', icon: Users, label: 'Vendors' },
  { to: '/admin/messages', icon: MessageSquare, label: 'Messages' },
  // Wave-18 #3 — Platform Support v1 inbox. Admin-only (admin_employee
  // route guard skipped — not in ADMIN_EMPLOYEE_ALLOWED_ROUTES).
  { to: '/admin/support', icon: LifeBuoy, label: 'Support' },
  { to: '/admin/homeowners', icon: Home, label: 'Homeowners' },
  // Ship #314 — BuildConnect contract review queue. Cross-functional
  // surface (vendor + homeowner + financial all touch) so top-level
  // rather than nested under Banking.
  { to: '/admin/reviews', icon: ShieldCheck, label: 'Reviews' },
  { to: '/admin/employees', icon: UserCog, label: 'Employees' },
  { to: '/admin/revenue', icon: DollarSign, label: 'Revenue' },
  {
    to: '/admin/banking',
    icon: Landmark,
    label: 'Banking',
    children: [
      { to: '/admin/transactions', icon: Receipt, label: 'Transactions' },
      { to: '/admin/reports', icon: FileText, label: 'Reports' },
    ],
  },
  { to: '/admin/financing', icon: Wallet, label: 'Financing' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
  { to: '/admin/workflow', icon: GitBranch, label: 'Workflow' },
  { to: '/admin/activity', icon: ActivityIcon, label: 'Activity' },
  { to: '/admin/products', icon: Package, label: 'Products' },
  { to: '/admin/tutorials', icon: PlayCircle, label: 'Video Tutorials' },
  { to: '/admin/bugs', icon: BugIcon, label: 'Bug Tracker' },
]

function isNavGroup(item: NavEntry): item is NavGroup {
  return 'children' in item
}

// Slim sidebar for admin_employee: only Profile, Overview, Vendors, Users,
// Messages — no Banking dropdown, Bug Tracker, Settings, etc.
const ADMIN_EMPLOYEE_ALLOWED_ROUTES = new Set<string>([
  '/admin/profile',
  '/admin',
  '/admin/vendors',
  '/admin/users',
  '/admin/messages',
])

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation()
  const profile = useAuthStore((s) => s.profile)
  const isAdminEmployee = profile?.role === 'admin_employee'
  const visibleNavItems = isAdminEmployee
    ? navItems.filter((item): item is NavLeaf => !isNavGroup(item) && ADMIN_EMPLOYEE_ALLOWED_ROUTES.has(item.to))
    : navItems
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // Ship #315 — pending-review count badge on the Reviews nav entry.
  // Ship #328 — refactored to use shared NavBadge primitive + badges-by-
  // route lookup map per #132 n=2-extraction trigger. Reads sentProjects
  // + filters status='sold' AND reviewStatus pending (default-undefined
  // treated as pending per #314 schema-extension default).
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const pendingReviewCount = useMemo(() => {
    return sentProjects.filter((p) => {
      if (p.status !== 'sold') return false
      if (!(p.saleAmount && p.saleAmount > 0)) return false
      const status = p.reviewStatus ?? 'pending'
      return status === 'pending'
    }).length
  }, [sentProjects])

  // Per #103 format-SoT: badges-by-route lookup keeps navItems static
  // metadata + count derivations co-located with their store reads.
  const badgesByRoute: Record<string, { count: number; tone: NavBadgeTone }> = {
    '/admin/reviews': { count: pendingReviewCount, tone: 'amber' },
  }

  return (
    <nav className="flex flex-col gap-1 px-3 py-2" data-admin-nav-employee-filtered={isAdminEmployee ? 'true' : undefined}>
      {visibleNavItems.map((item) => {
        const Icon = item.icon
        if (isNavGroup(item)) {
          const childActive = item.children.some((c) => location.pathname === c.to)
          const parentActive = location.pathname === item.to
          const isExpanded = expanded[item.label] ?? (parentActive || childActive)
          return (
            <div key={item.to}>
              <NavLink to={item.to} end={item.to === '/admin'} onClick={() => onNavigate?.()}>
                {({ isActive }) => (
                  <div className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}>
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setExpanded((prev) => ({ ...prev, [item.label]: !isExpanded }))
                      }}
                      className={cn(
                        '-mr-1 rounded p-0.5 transition-colors',
                        isActive ? 'hover:bg-primary-foreground/10' : 'hover:bg-foreground/5'
                      )}
                      aria-label={isExpanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </NavLink>
              {isExpanded && (
                <div className="mt-1 ml-3 flex flex-col gap-1 border-l border-border pl-3">
                  {item.children.map((child) => {
                    const ChildIcon = child.icon
                    return (
                      <NavLink key={child.to} to={child.to} onClick={() => onNavigate?.()}>
                        {({ isActive }) => (
                          <div className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}>
                            <ChildIcon className="h-4 w-4 shrink-0" />
                            <span>{child.label}</span>
                          </div>
                        )}
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }
        // Ship #328 — generic NavBadge via badges-by-route lookup
        // (extracted from #315 special-case at n=2-consumer trigger).
        const badge = badgesByRoute[item.to]
        return (
          <NavLink key={item.to} to={item.to} end={item.to === '/admin'} onClick={() => onNavigate?.()}>
            {({ isActive }) => (
              <div className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}>
                <Icon className="h-4.5 w-4.5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badge && <NavBadge count={badge.count} tone={badge.tone} isActive={isActive} />}
              </div>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

export function AdminLayout() {
  const isMobile = useMobile()
  const profile = useAuthStore((s) => s.profile)
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Ship #318 — one-time backfill of legacy completedAt-set entries
  // that lack reviewStatus (pre-#317 sentProjects). Idempotent via
  // localStorage flag inside maybeBackfillLegacyApprovals().
  useEffect(() => {
    maybeBackfillLegacyApprovals()
    maybeSeedSampleReview()
  }, [])

  // admin_employee route guard: redirect any non-allowed admin/* surface
  // back to /admin. Allowed paths = sidebar set + /admin/vendors/<id> for
  // vendor-detail drill-down. Server-side authz still enforced by RLS on
  // the data layer; this is UX scoping only.
  useEffect(() => {
    if (profile?.role !== 'admin_employee') return
    const path = location.pathname
    const isAllowed =
      ADMIN_EMPLOYEE_ALLOWED_ROUTES.has(path) ||
      path.startsWith('/admin/vendors/')
    if (!isAllowed) {
      navigate('/admin', { replace: true })
    }
  }, [profile?.role, location.pathname, navigate])

  // Admin notifications = open bugs + cross-role activity (god-view).
  // Ship #240 — extended beyond bug-only to surface platform-wide
  // reschedule + cancellation activity. No scoping filter since admin
  // sees ALL vendors + homeowners by design. To extend with future
  // event-types, add a filter-and-map block and concat into
  // `notifications`.
  // Bugs wired to Supabase 2026-05-21 (Rod-direct ship-now). Filter to
  // status='open' on the server so the sidebar badge count is authoritative.
  const [openBugs, setOpenBugs] = useState<Bug[]>([])
  useEffect(() => {
    let cancelled = false
    async function loadOpenBugs() {
      const { data } = await supabase
        .from('bugs')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
      if (cancelled) return
      setOpenBugs((data ?? []) as Bug[])
    }
    loadOpenBugs()
    return () => {
      cancelled = true
    }
  }, [])
  const rescheduleRequestsMap = useProjectsStore((s) => s.rescheduleRequestsByLead)
  const cancellationRequestsMap = useProjectsStore((s) => s.cancellationRequestsByLead)
  // Ship #276 — non-circumvention agreement signings as cross-role
  // notifications. 48h window — once-per-vendor-lifetime events get
  // longer fade than per-lead reschedule/cancel churn (24h).
  const agreementEvents = useAgreementEventsStore((s) => s.events)
  const RECENT_AGREEMENT_WINDOW_MS = 48 * 60 * 60 * 1000

  const rescheduleNotifications: NotificationItem[] = Object.entries(rescheduleRequestsMap)
    .filter(([, r]) => r.status === 'pending')
    .map(([leadId, r]) => ({
      id: `admin-reschedule-${leadId}-${r.requestedBy}`,
      title: r.requestedBy === 'vendor' ? 'Vendor proposed reschedule' : 'Homeowner proposed reschedule',
      description: `${leadId} · ${r.proposedDate} · ${r.proposedTime}`,
      icon: RotateCcw,
      iconColor: 'text-amber-600',
      tint: 'bg-amber-50/50 dark:bg-amber-950/20',
    }))

  const cancellationNotifications: NotificationItem[] = Object.entries(cancellationRequestsMap)
    .filter(([, c]) => c.status === 'pending')
    .map(([leadId, c]) => ({
      id: `admin-cancel-${leadId}`,
      title: 'Cancellation pending review',
      description: `${leadId}${c.reason ? ' · ' + c.reason : ''}`,
      icon: XIcon,
      iconColor: 'text-destructive',
      tint: 'bg-destructive/5',
    }))

  // Ship #276 — recent agreement signings, ordered most-recent-first.
  // Click navigates to /admin/vendors (matches reschedule/cancel
  // notification idiom — informational, no deep-link). Per-vendor
  // detail lives on the always-on vendors page View button.
  const agreementSignNotifications: NotificationItem[] = agreementEvents
    .filter((e) => Date.now() - new Date(e.signedAt).getTime() < RECENT_AGREEMENT_WINDOW_MS)
    .slice()
    .reverse()
    .map((e) => ({
      id: `admin-agreement-signed-${e.vendorId}-${e.signedAt}`,
      title: `Vendor ${e.vendorName} signed Non-Circumvention Agreement (${e.version})`,
      description: `${e.vendorEmail} · ${new Date(e.signedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
      icon: FileText,
      iconColor: 'text-primary',
      tint: 'bg-primary/5',
    }))

  const notifications: NotificationItem[] = [
    ...openBugs.map((b) => ({
      id: b.id,
      title: `Open bug · ${b.priority}`,
      description: b.description,
      icon: AlertCircle,
      iconColor: b.priority === 'high' ? 'text-red-500' : b.priority === 'medium' ? 'text-amber-500' : 'text-muted-foreground',
    })),
    ...agreementSignNotifications,
    ...rescheduleNotifications,
    ...cancellationNotifications,
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r bg-sidebar">
          {/* Ship #207 — flex column + scroll container on nav area so
              sidebars with 16+ entries don't overflow the viewport on
              shorter laptops. h-16 header pinned via shrink-0; nav
              region takes remaining height and scrolls internally. */}
          <div className="flex h-16 shrink-0 items-center border-b px-4">
            <Logo />
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav />
          </div>
        </aside>
      )}

      <div className={cn(!isMobile && 'ml-64')}>
        {/* Mobile floating-pill top header — Rev13 (Rod-direct 2026-06-09 via
            kratos 1781053014662): port the homeowner rev8.2 mobile pill chrome
            to admin role for cross-role parity. Mobile-only; desktop keeps the
            sidebar-offset sticky bar with Admin Dashboard heading. */}
        {isMobile && (
          <div className="fixed top-0 left-0 right-0 z-50 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <header
              data-admin-top-header-pill="true"
              data-admin-header-glass="true"
              className="flex h-16 items-center justify-between bg-background/65 dark:bg-background/85 backdrop-blur-xl backdrop-saturate-150 rounded-full shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_28px_-4px_rgba(0,0,0,0.7)] ring-1 ring-black/[0.06] dark:ring-white/15 px-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Open navigation menu" className="h-10 w-10 shrink-0"><Menu className="h-5 w-5" /></Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="sheet-floating flex data-[side=left]:w-64 flex-col p-0 pt-4">
                    <div className="px-3 mb-3 shrink-0"><Logo /></div>
                    <div className="flex-1 overflow-y-auto">
                      <SidebarNav onNavigate={() => setMobileMenuOpen(false)} />
                    </div>
                  </SheetContent>
                </Sheet>
                <Logo />
              </div>
              <div className="flex items-center">
                <NotificationBell notifications={notifications} />
                <ThemeToggle />
                {profile && (
                  <button
                    onClick={() => navigate('/admin/profile')}
                    className="cursor-pointer"
                    aria-label="Profile"
                  >
                    <AvatarInitials initials={profile.initials} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="md" />
                  </button>
                )}
              </div>
            </header>
          </div>
        )}

        {/* Desktop sticky top bar — unchanged; pairs with sidebar aside */}
        {!isMobile && (
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b dark:border-white/15 bg-background/80 dark:bg-background/90 backdrop-blur-lg dark:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.5)] px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold font-heading">Admin Dashboard</h2>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell notifications={notifications} />
              <ThemeToggle />
              {profile && (
                <button
                  onClick={() => navigate('/admin/profile')}
                  className="cursor-pointer"
                  aria-label="Profile"
                >
                  <AvatarInitials initials={profile.initials} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="sm" />
                </button>
              )}
            </div>
          </header>
        )}

        <main className={cn(isMobile ? 'px-4 pt-24 pb-4' : 'p-6')}>
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

        {/* Wave-8 (Rod 2026-06-10) — render marketing Footer ONLY on the
            admin main page (canonical /admin index + /admin/overview alias
            that renders the same OverviewPage). All inner /admin/* routes
            hide the footer. */}
        {['/admin', '/admin/overview'].includes(location.pathname) && <Footer />}
      </div>
    </div>
  )
}
