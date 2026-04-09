import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Home, Palette, MessageCircle, User, Bell } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  { to: '/home', icon: Home, label: 'Home' },
  { to: '/home/design-lab', icon: Palette, label: 'Design Lab' },
  { to: '/home/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/home/profile', icon: User, label: 'Profile' },
]

export function HomeownerLayout() {
  const isMobile = useMobile()
  const profile = useAuthStore((s) => s.profile)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop top nav */}
      {!isMobile && (
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-lg">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <Logo />
            <nav className="flex items-center gap-1">
              {navItems.map(({ to, label }) => (
                <NavLink key={to} to={to} end={to === '/home'}>
                  {({ isActive }) => (
                    <Button variant={isActive ? 'secondary' : 'ghost'} size="sm" className={cn('rounded-full px-4', isActive && 'bg-primary/10 text-primary font-medium')}>
                      {label}
                    </Button>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="relative rounded-full">
                <Bell className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent" />
              </Button>
              <ThemeToggle />
              {profile && <AvatarInitials initials={profile.initials} color={profile.avatar_color} size="sm" />}
            </div>
          </div>
        </header>
      )}

      {/* Main content */}
      <main className={cn('mx-auto max-w-7xl px-4 sm:px-6 py-6', isMobile && 'pb-24')}>
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
                    <Icon className="h-5 w-5" />
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
