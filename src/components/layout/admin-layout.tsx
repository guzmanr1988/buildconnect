import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, DollarSign, Users, Receipt, Landmark, Settings, Bug, Menu } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { to: '/admin/revenue', icon: DollarSign, label: 'Revenue' },
  { to: '/admin/vendors', icon: Users, label: 'Vendors' },
  { to: '/admin/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/admin/banking', icon: Landmark, label: 'Banking' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
  { to: '/admin/bugs', icon: Bug, label: 'Bug Tracker' },
]

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/admin'} onClick={onNavigate}>
          {({ isActive }) => (
            <div className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}>
              <Icon className="h-4.5 w-4.5 shrink-0" />
              <span>{label}</span>
            </div>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function AdminLayout() {
  const isMobile = useMobile()
  const profile = useAuthStore((s) => s.profile)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="fixed inset-y-0 left-0 z-30 w-64 border-r bg-sidebar">
          <div className="flex h-16 items-center border-b px-4">
            <Logo />
          </div>
          <SidebarNav />
        </aside>
      )}

      <div className={cn(!isMobile && 'ml-64')}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 backdrop-blur-lg px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0 pt-4">
                  <div className="px-4 mb-4"><Logo /></div>
                  <SidebarNav />
                </SheetContent>
              </Sheet>
            )}
            {isMobile && <Logo />}
            {!isMobile && <h2 className="text-lg font-semibold font-heading">Admin Dashboard</h2>}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {profile && <AvatarInitials initials={profile.initials} color={profile.avatar_color} size="sm" />}
          </div>
        </header>

        <main className="p-4 sm:p-6">
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
