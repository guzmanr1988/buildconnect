import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Home, MessageCircle, User, ShoppingCart, CheckCircle2, HelpCircle, PlayCircle, RotateCcw, X as XIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { NotificationBell, type NotificationItem } from '@/components/shared/notification-bell'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useCartStore } from '@/stores/cart-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  { to: '/home', icon: Home, label: 'Home' },
  { to: '/home/cart', icon: ShoppingCart, label: 'Projects' },
  { to: '/home/tutorials', icon: PlayCircle, label: 'Tutorials' },
  { to: '/home/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/home/profile', icon: User, label: 'Profile' },
]

export function HomeownerLayout() {
  const isMobile = useMobile()
  const profile = useAuthStore((s) => s.profile)
  const location = useLocation()
  const navigate = useNavigate()
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const rescheduleRequestsMap = useProjectsStore((s) => s.rescheduleRequestsByLead)
  const cancellationRequestsMap = useProjectsStore((s) => s.cancellationRequestsByLead)
  const approvedProjects = sentProjects.filter((p) => p.status === 'approved')

  // Ship #262 / #265 — blinking indicator on Projects nav. Rodolfo-direct
  // task_1776795590596_638 (2026-04-21). Initial #262 only counted
  // sentProjects (post-vendor-send pending|approved), but the /home/cart
  // page is labeled "Projects" in the nav AND surfaces BOTH cart items
  // (configured drafts) + sent projects together. Rodolfo'd interpretation
  // of "I added a project" = added to cart, which left cart-items > 0
  // but sentProjects empty, so the dot didn't fire. #265 fix: include
  // cart items in the open-projects count so any in-progress work
  // (draft OR sent) lights the indicator. Lesson: nav-label semantics
  // dictate indicator semantics — match the user mental model of the
  // labeled tab, not the underlying store-name.
  const cartItemsCount = useCartStore((s) => s.items.length)
  const sentActiveCount = sentProjects.filter(
    (p) => p.status === 'pending' || p.status === 'approved',
  ).length
  const openProjectsCount = cartItemsCount + sentActiveCount

  // Ship #240 — cross-role notification event derivations (homeowner
  // perspective). Pattern is "derive from state" (option A): filter
  // projects-store maps to events relevant TO this homeowner (their
  // sentProjects). To extend with future event types, add a filter-and-
  // map block here and concat into `notifications`.
  const RECENT_RESOLVED_WINDOW_MS = 24 * 60 * 60 * 1000
  const myLeadIds = new Set<string>(
    sentProjects.map((p) => `L-${p.id.slice(0, 4).toUpperCase()}`),
  )

  const rescheduleNotifications: NotificationItem[] = Object.entries(rescheduleRequestsMap)
    .filter(([leadId]) => myLeadIds.has(leadId))
    .flatMap(([leadId, r]) => {
      // Vendor-initiated pending reschedule — needs homeowner action
      if (r.status === 'pending' && r.requestedBy === 'vendor') {
        return [{
          id: `reschedule-${leadId}-v-pending`,
          title: 'Vendor proposed a new time',
          description: `New time: ${r.proposedDate} · ${r.proposedTime}`,
          icon: RotateCcw,
          iconColor: 'text-amber-600',
          tint: 'bg-amber-50/50 dark:bg-amber-950/20',
        }]
      }
      // Homeowner-initiated resolved recently — informational
      if (r.requestedBy === 'homeowner' && r.resolvedAt) {
        const age = Date.now() - new Date(r.resolvedAt).getTime()
        if (age > RECENT_RESOLVED_WINDOW_MS) return []
        if (r.status === 'approved') {
          return [{
            id: `reschedule-${leadId}-h-approved`,
            title: 'Vendor approved your new time',
            description: `${r.proposedDate} · ${r.proposedTime}`,
            icon: CheckCircle2,
            iconColor: 'text-emerald-600',
            tint: 'bg-emerald-50/50 dark:bg-emerald-950/20',
          }]
        }
        if (r.status === 'rejected') {
          return [{
            id: `reschedule-${leadId}-h-rejected`,
            title: 'Vendor kept the original time',
            description: 'Your reschedule request was declined.',
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
      // Vendor decision on homeowner's cancellation request — informational
      if (c.status === 'approved' || c.status === 'denied') {
        // Treat as recent if no explicit timestamp — the cancellation
        // store shape doesn't carry resolvedAt yet, so we surface any
        // resolved cancellation until the homeowner sees it (cleared on
        // their navigation away from the project).
        return [{
          id: `cancel-${leadId}-${c.status}`,
          title: c.status === 'approved' ? 'Cancellation approved' : 'Cancellation denied',
          description: c.status === 'approved'
            ? 'Your cancellation was accepted — the project is closed.'
            : 'The vendor did not approve the cancellation.',
          icon: c.status === 'approved' ? CheckCircle2 : XIcon,
          iconColor: c.status === 'approved' ? 'text-emerald-600' : 'text-destructive',
          tint: c.status === 'approved' ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-destructive/5',
        }]
      }
      return []
    })

  const notifications: NotificationItem[] = [
    ...approvedProjects.map((p) => ({
      id: p.id,
      title: 'Project Approved!',
      description: `Congratulations! The vendor has approved your ${p.item.serviceName} request. Your project is booked.`,
      icon: CheckCircle2,
      iconColor: 'text-emerald-500',
      tint: 'bg-emerald-50/50 dark:bg-emerald-950/20',
    })),
    ...rescheduleNotifications,
    ...cancellationNotifications,
  ]

  // Ship #240 — delta-detection toast pattern extended from vendor-layout
  // (ship #108) to homeowner side per Rodolfo's "for both vendor and
  // homeowner" directive. Composite IDs (reschedule-<leadId>-<flag>,
  // cancel-<leadId>-<status>) mean a status flip creates a new seen-set
  // key → toast fires on the transition. Prevents spam on mount via
  // firstRenderRef.
  const LAST_SEEN_KEY = 'buildconnect-homeowner-last-seen-notification-ids'
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
      toast(n.title, { description: n.description })
    }
    if (newOnes.length > 0) {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify([...currentIds]))
    }
  }, [notifications])

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop top nav */}
      {!isMobile && (
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <button onClick={() => navigate('/home')} className="cursor-pointer">
              <Logo />
            </button>
            <nav className="flex items-center gap-1">
              {navItems.map(({ to, label }) => (
                <NavLink key={to} to={to} end={to === '/home'}>
                  {({ isActive }) => (
                    <div className="relative">
                      <Button variant={isActive ? 'secondary' : 'ghost'} size="sm" className={cn('rounded-full px-4', isActive && 'bg-primary/10 text-primary font-medium')}>
                        {label}
                      </Button>
                      {label === 'Projects' && openProjectsCount > 0 && (
                        <span
                          aria-label={`${openProjectsCount} open project${openProjectsCount > 1 ? 's' : ''}`}
                          className="pointer-events-none absolute right-1 top-1 flex h-2 w-2"
                        >
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                        </span>
                      )}
                    </div>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <NotificationBell notifications={notifications} />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.dispatchEvent(new Event('buildconnect:open-onboarding'))}
                aria-label="Reopen onboarding tour"
                className="h-9 w-9"
              >
                <HelpCircle className="h-5 w-5" />
              </Button>
              <ThemeToggle />
              {profile && (
                <button
                  onClick={() => navigate('/home/profile')}
                  className="cursor-pointer"
                  aria-label="Profile"
                >
                  <AvatarInitials initials={profile.initials} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="sm" />
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Mobile top bar */}
      {isMobile && (
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-14 items-center justify-between px-4">
            <button onClick={() => navigate('/home')} className="cursor-pointer">
              <Logo />
            </button>
            <div className="flex items-center gap-2">
              <NotificationBell notifications={notifications} size="sm" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.dispatchEvent(new Event('buildconnect:open-onboarding'))}
                aria-label="Reopen onboarding tour"
                className="h-8 w-8"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
              <ThemeToggle />
              {profile && (
                <button
                  onClick={() => navigate('/home/profile')}
                  className="cursor-pointer"
                  aria-label="Profile"
                >
                  <AvatarInitials initials={profile.initials} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="sm" />
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Main content */}
      <main className={cn('mx-auto max-w-7xl px-4 sm:px-6 py-6 overflow-x-hidden', isMobile && 'pb-24')}>
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

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg safe-area-inset-bottom">
          <div className="flex items-center justify-around h-16 px-2">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/home'} className="flex-1">
                {({ isActive }) => (
                  <div className={cn('flex flex-col items-center gap-0.5 py-1 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')}>
                    <div className="relative">
                      <Icon className="h-5 w-5" />
                      {label === 'Projects' && openProjectsCount > 0 && (
                        <span
                          aria-label={`${openProjectsCount} open project${openProjectsCount > 1 ? 's' : ''}`}
                          className="pointer-events-none absolute -right-1 -top-1 flex h-2 w-2"
                        >
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium">{label}</span>
                  </div>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
