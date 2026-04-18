import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Inbox, CalendarDays, Package, Landmark, MessageCircle, User, Bell, Menu, PanelLeftClose, PanelLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/vendor', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/vendor/leads', icon: Inbox, label: 'Projects' },
  { to: '/vendor/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/vendor/catalog', icon: Package, label: 'Products' },
  { to: '/vendor/banking', icon: Landmark, label: 'Banking' },
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
  const { sidebarCollapsed, toggleSidebarCollapsed } = useUIStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
            <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent" />
            </Button>
            <ThemeToggle />
            {profile && <AvatarInitials initials={profile.initials} color={profile.avatar_color} size="sm" />}
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
