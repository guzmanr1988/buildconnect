import { useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Home, Palette, MessageCircle, User, Bell, ShoppingCart, CheckCircle2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { useCartStore } from '@/stores/cart-store'
import { useProjectsStore } from '@/stores/projects-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const navItems = [
  { to: '/home', icon: Home, label: 'Home' },
  { to: '/home/cart', icon: ShoppingCart, label: 'Cart' },
  { to: '/home/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/home/profile', icon: User, label: 'Profile' },
]

export function HomeownerLayout() {
  const isMobile = useMobile()
  const profile = useAuthStore((s) => s.profile)
  const location = useLocation()
  const navigate = useNavigate()
  const cartCount = useCartStore((s) => s.items.length)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const approvedProjects = sentProjects.filter((p) => p.status === 'approved')
  const [notifOpen, setNotifOpen] = useState(false)

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
                    <Button variant={isActive ? 'secondary' : 'ghost'} size="sm" className={cn('rounded-full px-4', isActive && 'bg-primary/10 text-primary font-medium')}>
                      {label}
                    </Button>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <Popover open={notifOpen} onOpenChange={setNotifOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative rounded-full">
                    <Bell className="h-4 w-4" />
                    {approvedProjects.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                        {approvedProjects.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b">
                    <h3 className="text-sm font-semibold">Notifications</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {approvedProjects.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">No new notifications</div>
                    ) : (
                      approvedProjects.map((p) => (
                        <div key={p.id} className="flex items-start gap-3 p-3 border-b last:border-0 bg-emerald-50/50 dark:bg-emerald-950/20">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-foreground">Project Approved!</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Congratulations! The vendor has approved your {p.item.serviceName} request. Your project is booked.
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <ThemeToggle />
              {profile && (
                <button onClick={() => navigate('/home/profile')} className="cursor-pointer">
                  <AvatarInitials initials={profile.initials} color={profile.avatar_color} size="sm" />
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative rounded-full h-8 w-8">
                    <Bell className="h-4 w-4" />
                    {approvedProjects.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                        {approvedProjects.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b">
                    <h3 className="text-sm font-semibold">Notifications</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {approvedProjects.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">No new notifications</div>
                    ) : (
                      approvedProjects.map((p) => (
                        <div key={p.id} className="flex items-start gap-3 p-3 border-b last:border-0 bg-emerald-50/50 dark:bg-emerald-950/20">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-foreground">Project Approved!</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Congratulations! The vendor has approved your {p.item.serviceName} request. Your project is booked.
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <ThemeToggle />
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
