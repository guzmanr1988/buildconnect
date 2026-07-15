import { useEffect } from 'react'
import { toast } from 'sonner'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Home, MessageCircle, User, ShoppingCart, CheckCircle2, HelpCircle, PlayCircle, RotateCcw, X as XIcon, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { NotificationBell, type NotificationItem } from '@/components/shared/notification-bell'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useCartStore } from '@/stores/cart-store'
import { useCatalogStore } from '@/stores/catalog-store'
import { useCatalogRealtime } from '@/lib/hooks/use-catalog-realtime'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Footer } from '@/components/layout/footer'

const navItems = [
  { to: '/home', icon: Home, label: 'Home' },
  { to: '/home/cart', icon: ShoppingCart, label: 'Projects' },
  { to: '/home/tutorials', icon: PlayCircle, label: 'Tutorials' },
  { to: '/home/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/home/documents', icon: FileText, label: 'Documents' },
  { to: '/home/profile', icon: User, label: 'Profile' },
]

export function HomeownerLayout() {
  // 1024 (lg) — desktop nav has 6 links + logo + 4 controls (bell/help/theme/
  // avatar). Below 1024 the row crowds and links collide with the wordmark on
  // tablet portrait + every mobile-landscape (iPhone 14 844, Pixel 915, Pro Max
  // 932 all <1024). Push those widths into the existing mobile shell (slim top
  // bar + bottom nav) instead of authoring a third layout.
  const isMobile = useMobile(1024)
  const profile = useAuthStore((s) => s.profile)
  const location = useLocation()
  const navigate = useNavigate()
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const rescheduleRequestsMap = useProjectsStore((s) => s.rescheduleRequestsByLead)
  const cancellationRequestsMap = useProjectsStore((s) => s.cancellationRequestsByLead)
  const projectsHydrated = useProjectsStore((s) => s._sentProjectsHydrated)
  const approvedProjects = sentProjects.filter((p) => p.status === 'approved')

  // Arc-32 — read-side catalog realtime. Admin/products + vendor/catalog
  // already mount this; homeowner side relied on the one-shot AuthBootstrap
  // hydrate, so admin edits didn't propagate until reload. Layout-level mount
  // covers every /home/* route via Outlet; RequireRole=homeowner gates double-
  // subscribe with admin/vendor sessions.
  const refetchCatalog = useCatalogStore((s) => s.hydrateFromServer)
  useCatalogRealtime(refetchCatalog)
  // PR-#426 — mirror admin/products triad (mount-fire + focus-refetch +
  // realtime). Without mount-fire, unauthed sessions OR AuthBootstrap timing
  // races leave the catalog on the bundled SERVICE_CATALOG fallback, so
  // consumer Door Types renders 6 stale items while admin substrate has 4.
  useEffect(() => {
    refetchCatalog()
  }, [refetchCatalog])
  useRefetchOnFocus(refetchCatalog)

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
  // key → toast fires on the transition.
  //
  // Hydration-gate + LS-seeded (apollo-diagnosed fresh-login re-fire, PR
  // #527): notifications derive from sentProjects, which populates async
  // via hydrateFromSupabase after AuthBootstrap resolves. Two guardrails:
  //   1. Gate the whole effect on _sentProjectsHydrated so we never diff
  //      against a pre-hydrate empty snapshot.
  //   2. Seed the seen-set from the persisted LAST_SEEN_KEY only — never
  //      from the hydrated server snapshot. Kratos-caught over-correction
  //      in the first draft: a firstRenderRef branch that wrote LS =
  //      currentIds on the first post-hydrate render folded genuinely-new
  //      cross-session approvals into the seed silently → no toast ever
  //      for approvals that landed while the homeowner was offline. That
  //      defeats the whole reason LAST_SEEN_KEY is persisted.
  // With both guardrails: already-seen ID in LS → no toast; new ID not
  // in LS → toast once + append; empty LS (first-ever login) → all
  // current notifications toast once as "here is your status."
  const LAST_SEEN_KEY = 'buildconnect-homeowner-last-seen-notification-ids'
  useEffect(() => {
    if (!projectsHydrated) return
    const currentIds = new Set(notifications.map((n) => n.id))
    let seenIds: Set<string>
    try {
      const raw = localStorage.getItem(LAST_SEEN_KEY)
      seenIds = new Set<string>(raw ? JSON.parse(raw) : [])
    } catch {
      seenIds = new Set<string>()
    }
    const newOnes = notifications.filter((n) => !seenIds.has(n.id))
    for (const n of newOnes) {
      toast(n.title, { description: n.description })
    }
    if (newOnes.length > 0) {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify([...currentIds]))
    }
  }, [notifications, projectsHydrated])

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop top nav — Rev10 (Rod-direct 2026-06-09 via kratos
          1781049111408-kratos-qkb4f): mirror the rev8.2 mobile + rev7 bottom-nav
          floating-pill + Apple-frosted glass to PC + iPad-landscape + iPad-Pro-
          portrait (>=1024 via useMobile(1024)). Rod verbatim: "On PC and iPad,
          view the menu where it has Build Connect. Do the same thing that you
          did for mobile: the floating menu that we just did on mobile. Do it on
          PC and iPad view too." Option C scope-resolution (kratos
          1781049253719-kratos-jhokh): iPad portrait (768-1023) already renders
          the mobile floating-pill, so this block covers every remaining surface.
          CRITICAL: h-20 + Logo h-11 + center nav + 4 right icons all UNCHANGED
          (Rod standing "Same size. Just the same style.") — chrome restyle only.
          fixed top-0 wrapper with px-4 pt-4 desktop breathing room; glass
          utilities identical to rev8.2 mobile + rev7 bottom-nav for visual
          consistency across surfaces. */}
      {!isMobile && (
        <div className="fixed top-0 left-0 right-0 z-50 px-2 xl:px-4 pt-4">
          <header
            data-homeowner-desktop-header-pill="true"
            data-homeowner-header-glass="true"
            data-nav-surface="desktop"
            className="mx-auto flex h-20 max-w-7xl items-center justify-between bg-background/65 dark:bg-background/85 backdrop-blur-xl backdrop-saturate-150 rounded-full shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_28px_-4px_rgba(0,0,0,0.7)] ring-1 ring-black/[0.06] dark:ring-white/15 px-4 xl:px-8"
          >
            <button onClick={() => navigate('/home')} className="cursor-pointer">
              <Logo className="[&_img]:h-11 [&_img]:w-11 [&_span]:text-xl" />
            </button>
            <nav className="flex items-center gap-1">
              {navItems.map(({ to, label }) => (
                <NavLink key={to} to={to} end={to === '/home'}>
                  {({ isActive }) => (
                    <div className="relative">
                      <Button variant={isActive ? 'secondary' : 'ghost'} className={cn('rounded-full px-3 xl:px-5', isActive && 'bg-primary/10 text-primary font-medium')}>
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
            <div className="flex items-center gap-3">
              <NotificationBell notifications={notifications} />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.dispatchEvent(new Event('buildconnect:open-onboarding'))}
                aria-label="Reopen onboarding tour"
                className="h-10 w-10"
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
                  <AvatarInitials initials={profile.initials} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="md" />
                </button>
              )}
            </div>
          </header>
        </div>
      )}

      {/* Mobile top header — Rev8 (Rod-direct 2026-06-09 via kratos
          1781045076790-kratos-wtkwt): mirror the rev7 bottom-nav floating-pill
          + Apple-frosted glass to the TOP header. Rod verbatim: "do the same
          thing you did to the bottom menu to the top one where BuildConnect is
          at. Same size. That it is now. Just the same style." CRITICAL: height
          + inner layout + control sizes UNCHANGED (h-16, Logo h-10 w-10, icon
          buttons h-10 w-10) — restyle only. fixed top-0 with safe-area-inset
          respected; main pt below bumped from py-6 to pt-24 landscape:pt-20
          on mobile so the floating header doesn't overlap the "Welcome back"
          block. Glass utilities (bg-background/65 + backdrop-blur-xl +
          backdrop-saturate-150 + ring-1 ring-black/[0.06] + soft shadow)
          identical to the rev7 bottom-nav for visual consistency. */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-50 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <header
            data-homeowner-top-header-pill="true"
            data-homeowner-header-glass="true"
            className="flex h-16 items-center justify-between bg-background/65 dark:bg-background/85 backdrop-blur-xl backdrop-saturate-150 rounded-full shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_28px_-4px_rgba(0,0,0,0.7)] ring-1 ring-black/[0.06] dark:ring-white/15 px-3"
          >
            <button onClick={() => navigate('/home')} className="cursor-pointer">
              <Logo className="[&_img]:h-10 [&_img]:w-10 [&_span]:text-xl" />
            </button>
            {/* Rev8.2 spacing nudge round-2 (kratos 1781045984703-kratos-p0y4y
                after apollo G9 portrait-390 logo-right ↔ bell-left = 0px on
                rev8.1): bar already at px-3, dropping right-cluster gap-1 → gap-0
                reclaims 12px in cluster (3 × 4px gaps), yielding a measured
                ~12px logo-button-right ↔ cluster-left gap on portrait 390
                (target >=8px). Icon sizes + button hit-targets unchanged
                (h-10 w-10 buttons retain their own internal padding so the
                icons aren't visually touching). Landscape (820/908px bar) has
                400+ px slack so the tighter cluster is fine there. Bottom-nav
                similarly uses no inter-tab gap (flex-1 with internal padding)
                so this is consistent with the rev6/7 pattern. */}
            <div className="flex items-center">
              <NotificationBell notifications={notifications} size="md" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.dispatchEvent(new Event('buildconnect:open-onboarding'))}
                aria-label="Reopen onboarding tour"
                className="h-10 w-10"
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
                  <AvatarInitials initials={profile.initials} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="md" />
                </button>
              )}
            </div>
          </header>
        </div>
      )}

      {/* Main content */}
      <main className={cn('mx-auto max-w-7xl px-4 sm:px-6 overflow-x-hidden', isMobile ? 'pt-24 landscape:pt-20 pb-28 landscape:pb-28' : 'pt-28 pb-6')}>
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

      {/* Footer — per-role shell mount, off App.tsx root so /login + /signup
          + admin do not leak. Mobile gets pb-24 wrapper so the last footer
          line is not hidden behind the fixed mobile bottom nav (h-16 + safe-
          area-inset). Desktop renders flush.
          Wave-8 (Rod 2026-06-10) — render ONLY on the role index page; all
          inner /home/* routes hide the marketing footer. */}
      {location.pathname === '/home' && (
        <div className={cn(isMobile && 'pb-32 landscape:pb-28')}>
          <Footer />
        </div>
      )}

      {/* Mobile bottom nav — Rev7 (Rod-direct 2026-06-09 via kratos
          1781040830890-kratos-bbmkt + glass addendum 1781040847668 + ref
          anchor 1781040864773): unified portrait+landscape on the SAME
          floating-pill chrome AND Apple-style frosted-glass surface. Rev6
          landscape collapsed to a flat edge-to-edge icon-only bar — Rod
          said "Terrible". Rev7 (a) drops the landscape:* override so the
          pill chrome (rounded-full, drop-shadow, ring, sliding layoutId
          active highlight, blue active icon+label, labels visible) renders
          in BOTH orientations at a slightly shorter landscape height
          (landscape:h-14 vs portrait h-[4.25rem]) to fit a 390-tall
          landscape viewport without overlapping content, and (b) applies
          subtle frosted glass: bg-background/65 (translucent so content
          shows through) + backdrop-blur-xl + backdrop-saturate-150 +
          ring-black/[0.06] for a gentle Apple-style frosted look matching
          the invoicing-app reference video (IMG_7653.MP4) — light + premium,
          NOT a heavy dark wash. Tab set unchanged (all 6 tabs). Projects
          openProjectsCount dot preserved. Tailwind v4 handles the
          -webkit-backdrop-filter prefix automatically for iOS Safari. */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 safe-area-inset-bottom">
          <nav
            data-homeowner-bottom-nav-pill="true"
            data-homeowner-nav-glass="true"
            className="flex items-center bg-background/65 dark:bg-background/85 backdrop-blur-xl backdrop-saturate-150 rounded-full shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_28px_-4px_rgba(0,0,0,0.7)] ring-1 ring-black/[0.06] dark:ring-white/15 h-[4.25rem] landscape:h-14 px-2"
          >
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/home'} className="relative flex-1 flex items-stretch justify-center">
                {({ isActive }) => (
                  <div className="relative flex flex-1 flex-col items-center justify-center py-1 px-0.5">
                    {isActive && (
                      <motion.div
                        layoutId="homeowner-bottom-nav-active-pill"
                        data-homeowner-nav-active-pill="true"
                        className="absolute inset-0 rounded-2xl bg-primary/10"
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      />
                    )}
                    <div className="relative z-10 flex flex-col items-center gap-0.5">
                      <div className="relative">
                        <Icon
                          className={cn(
                            'h-5 w-5 landscape:h-4 landscape:w-4 transition-colors',
                            isActive ? 'text-primary' : 'text-foreground',
                          )}
                        />
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
                      <span
                        className={cn(
                          'text-[10px] leading-tight transition-colors',
                          isActive ? 'text-primary font-semibold' : 'text-foreground font-medium',
                        )}
                      >
                        {label}
                      </span>
                    </div>
                  </div>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}
