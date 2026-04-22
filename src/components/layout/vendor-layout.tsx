import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Inbox, CalendarDays, Package, Landmark, MessageCircle, User, Menu, PanelLeftClose, PanelLeft, Inbox as InboxIcon, BadgeCheck, UsersRound, RotateCcw, CheckCircle2, X as XIcon } from 'lucide-react'
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
import { MOCK_LEADS } from '@/lib/mock-data'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/vendor', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/vendor/leads', icon: Inbox, label: 'Projects' },
  { to: '/vendor/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/vendor/catalog', icon: Package, label: 'Products' },
  { to: '/vendor/banking', icon: Landmark, label: 'Banking' },
  { to: '/vendor/account-reps', icon: UsersRound, label: 'Account Reps' },
  { to: '/vendor/membership', icon: BadgeCheck, label: 'Membership' },
  { to: '/vendor/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/vendor/profile', icon: User, label: 'Profile' },
]

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/vendor'} onClick={onNavigate}>
          {({ isActive }) => (
            <div className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              collapsed && 'justify-center px-2'
            )}>
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </div>
          )}
        </NavLink>
      ))}
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

  // Vendor notifications = pending leads awaiting action. Reverse-map
  // profile.id → mock-vendor-id so the demo vendors see their MOCK_LEADS
  // rows; authed-but-unmapped vendors see an empty list.
  const mockVendorId = profile
    ? Object.entries(DEMO_VENDOR_UUID_BY_MOCK_ID).find(([, uuid]) => uuid === profile.id)?.[0]
    : null
  const vendorIdForLeads = mockVendorId ?? profile?.id ?? ''
  const pendingLeads = MOCK_LEADS.filter(
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
    ...MOCK_LEADS.filter((l) => l.vendor_id === vendorIdForLeads).map((l) => l.id),
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
    </div>
  )
}
