import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  Building2,
  ArrowRight,
  Star,
  Users,
  Zap,
  Home,
  Wrench,
  Shield,
  ChevronRight,
  UserCheck,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectsStore } from '@/stores/projects-store'
import { MOCK_VENDOR_IDS } from '@/lib/vendor-scope'
import { signIn } from '@/lib/auth'
import { clearQAPersona } from '@/lib/qa-personas'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Minimum 6 characters'),
})

type LoginFormData = z.infer<typeof loginSchema>

const stats = [
  { icon: Users, label: 'Verified Contractors', value: '500+' },
  { icon: Star, label: 'Avg. Rating', value: '4.8' },
  { icon: Zap, label: 'Projects Delivered', value: '12K+' },
]

// Demo accounts created via Supabase admin API (2026-04-18). Passwords are
// injected at build time from VITE_DEMO_*_PW env vars. These are pre-launch
// dev accounts; tracked for teardown in task_1776553659810_972.
const demoAccounts = [
  {
    role: 'homeowner' as const,
    email: 'homeowner@buildc.net',
    password: import.meta.env.VITE_DEMO_HOMEOWNER_PW as string | undefined,
    label: 'Homeowner',
    desc: 'Browse & book services',
    icon: Home,
    gradient: 'from-blue-500 to-blue-600',
  },
  // Ship #216 — rolled back the Apex/Shield/Paradise vendor-specific
  // demo buttons added in #214. Rodolfo: "the demo login have a bunch
  // of vendors outside" — vendor-specific demos shouldn't sit on the
  // public-facing login. Generic Vendor button retained for role-based
  // demo access; per-vendor leads-flow testing via email/password form
  // with actual Supabase creds (Apex/Shield/Paradise backend accounts
  // still exist, just not button-exposed).
  {
    role: 'vendor' as const,
    email: 'vendor@buildc.net',
    password: import.meta.env.VITE_DEMO_VENDOR_PW as string | undefined,
    label: 'Vendor',
    desc: 'Manage leads & sales',
    icon: Wrench,
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    role: 'admin' as const,
    email: 'admin@buildc.net',
    password: import.meta.env.VITE_DEMO_ADMIN_PW as string | undefined,
    label: 'Admin',
    desc: 'Platform overview',
    icon: Shield,
    gradient: 'from-emerald-500 to-emerald-600',
  },
  {
    role: 'account_rep' as const,
    email: 'account_rep@buildc.net',
    password: import.meta.env.VITE_DEMO_ACCOUNT_REP_PW as string | undefined,
    label: 'Account Rep',
    desc: 'Rep portal (vendor team)',
    icon: UserCheck,
    gradient: 'from-sky-500 to-sky-600',
  },
]

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  useEffect(() => {
    if (isAuthenticated && profile) {
      // Ship #333 Phase A — account_rep is vendor-family; lands on
      // /vendor (with rep-scoped sidebar + render-layer dashboard
      // filter per banked CHAIN IS GOD).
      const dest =
        profile.role === 'admin'
          ? '/admin'
          : profile.role === 'vendor' || profile.role === 'account_rep'
            ? '/vendor'
            : '/home'
      navigate(dest, { replace: true })
    }
  }, [isAuthenticated, profile, navigate])

  // Ship #210 (Rodolfo-direct pivot #28): QA persona flag must be cleared
  // before real-auth signIn. AuthBootstrap's isQaPersonaActive() guards
  // bypass the SIGNED_IN event to protect persona state — correct
  // contract for QA mode, but it swallows the hydration of a real login
  // if the flag lingers past logout. Awaiting clearQAPersona serializes
  // SIGNED_OUT→SIGNED_IN so the new session lands cleanly.
  async function clearQaBeforeAuth() {
    if (typeof window !== 'undefined' && localStorage.getItem('buildconnect-qa-persona-active')) {
      await clearQAPersona()
    }
  }

  async function onSubmit(data: LoginFormData) {
    setIsLoading(true)
    try {
      await clearQaBeforeAuth()
      await signIn(data.email, data.password)
      // AuthBootstrap's onAuthStateChange listener hydrates the store;
      // the useEffect above then navigates based on role.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid email or password'
      toast.error(message)
      setIsLoading(false)
    }
  }

  async function demoLogin(email: string, password: string | undefined, role: 'homeowner' | 'vendor' | 'admin' | 'account_rep') {
    if (!password) {
      toast.error('Demo credentials not configured for this build')
      return
    }
    setIsLoading(true)
    try {
      await clearQaBeforeAuth()
      // Ship #222 — Vendor demo button aliases to mock vendor 'v-1' (Apex)
      // for the session so useVendorScope resolves → strict filter matches
      // homeowner-created sentProjects whose contractor.vendor_id was
      // stamped at vendor-compare pick-time.
      //
      // Ship #334 — auto-alias resolution per Rodolfo "demo must work as
      // real ... see if everything is populating on all 3 all info".
      // Pre-#334 the Vendor demo button HARDWIRED alias to 'v-1' (Apex),
      // which meant homeowner picking ANY non-Apex mock-vendor (Shield
      // v-2 / Paradise v-3 / etc) at vendor-compare wouldn't be visible
      // on the Vendor demo session (alias mismatch → strict-filter
      // rejects on badge + Projects page).
      //
      // Post-#334: Vendor demo button reads the latest sentProject and
      // aliases to whichever mock-vendor was last booked-with (must be
      // a real mock-vendor-id from MOCK_VENDOR_IDS set; falls back to
      // 'v-1' otherwise). Auto-routes Rodolfo's vendor view to the
      // vendor identity matching his most-recent homeowner-side booking
      // — single-button UX preserved; e2e demo flow closes the loop
      // regardless of which mock-vendor he picked as homeowner.
      // Cleared on Homeowner/Admin login so roles don't leak the alias.
      if (role === 'vendor') {
        const sentProjects = useProjectsStore.getState().sentProjects
        const latestBookingVendorId = sentProjects.length > 0
          ? sentProjects[sentProjects.length - 1].contractor?.vendor_id
          : undefined
        const aliasMockId =
          latestBookingVendorId && MOCK_VENDOR_IDS.has(latestBookingVendorId)
            ? latestBookingVendorId
            : 'v-1'
        localStorage.setItem('buildconnect-demo-mock-vendor-id', aliasMockId)
      } else if (role === 'account_rep') {
        // Account rep demo scoped to v-1 (Apex Roofing) — the canonical
        // featured mock vendor for demo sessions.
        localStorage.setItem('buildconnect-demo-mock-vendor-id', 'v-1')
      } else {
        localStorage.removeItem('buildconnect-demo-mock-vendor-id')
      }
      await signIn(email, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Demo sign-in failed'
      toast.error(message)
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left hero panel */}
      <div className="relative hidden w-[55%] overflow-hidden lg:block">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/95 to-primary/80" />

        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }} />

        {/* Decorative shapes */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/[0.04]" />
        <div className="absolute top-1/2 -right-12 h-64 w-64 rounded-full bg-white/[0.03]" />
        <div className="absolute -bottom-16 -left-16 h-80 w-80 rounded-full bg-white/[0.04]" />

        {/* Content */}
        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight font-heading text-white">
              BuildConnect
            </span>
          </motion.div>

          {/* Main copy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="max-w-lg"
          >
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight font-heading text-white leading-[1.15]">
              Build your dream home with confidence
            </h1>
            <p className="mt-5 text-lg text-white/70 leading-relaxed max-w-md">
              South Florida's trusted marketplace connecting homeowners with verified construction professionals.
            </p>

            {/* Stats row */}
            <div className="mt-10 flex gap-8">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <stat.icon className="h-4 w-4 text-amber-400" />
                    <span className="text-2xl font-bold text-white font-heading">{stat.value}</span>
                  </div>
                  <span className="text-xs text-white/50">{stat.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Testimonial */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="rounded-2xl bg-white/[0.08] backdrop-blur-sm border border-white/[0.08] p-6 max-w-md"
          >
            <p className="text-sm text-white/80 leading-relaxed italic">
              "BuildConnect made finding a reliable roofer so easy. Within 2 days I had 3 verified quotes and a site visit booked."
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-amber-400/20 flex items-center justify-center text-sm font-bold text-amber-400">
                MR
              </div>
              <div>
                <p className="text-sm font-medium text-white">Maria Rodriguez</p>
                <p className="text-xs text-white/50">Homeowner, Coral Way</p>
              </div>
              <div className="ml-auto flex gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-[45%]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-[380px]"
        >
          {/* Mobile logo */}
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight font-heading">
              Build<span className="text-primary">Connect</span>
            </span>
          </div>

          <h2 className="text-2xl font-bold font-heading text-foreground">
            Sign in
          </h2>
          <p className="mt-1 mb-8 text-sm text-muted-foreground">
            Enter your credentials to access your account
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="h-11"
                {...register('email')}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <button type="button" className="text-xs text-primary hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="h-11 pr-11"
                  {...register('password')}
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="mt-2 h-11 w-full text-sm font-medium gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <motion.div
                  className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                <>Sign in <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          </form>

          {/* Demo-account one-click sign-in. Pre-launch dev shortcut (see
              task_1776553659810_972 for teardown). */}
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">Try a demo</span>
              <Separator className="flex-1" />
            </div>

            {/* Ship #216 — reverted #215's 2-col grid now that the tile
                count is back to 3 (Homeowner / Vendor / Admin). Vertical
                flex stack fits cleanly in the form panel without the
                6-tile overflow that motivated the grid. */}
            <div className="flex flex-col gap-2">
              {demoAccounts.map((demo, i) => (
                <motion.div
                  key={demo.role}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 + i * 0.08 }}
                >
                  <Card
                    className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20"
                    onClick={() => !isLoading && demoLogin(demo.email, demo.password, demo.role)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (!isLoading && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        demoLogin(demo.email, demo.password, demo.role)
                      }
                    }}
                    aria-label={`Sign in as demo ${demo.label}`}
                  >
                    <CardContent className="flex items-center gap-4 p-3.5">
                      <div className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shrink-0',
                        demo.gradient
                      )}>
                        <demo.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{demo.label}</p>
                        <p className="text-xs text-muted-foreground">{demo.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create account
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
