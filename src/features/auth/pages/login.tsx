import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  ArrowRight,
  Star,
  Users,
  Zap,
  Home,
  Wrench,
  UserCheck,
  UserCog,
  Shield,
  Lock,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth-store'
import { signIn } from '@/lib/auth'
import { clearQAPersona } from '@/lib/qa-personas'
import { supabase } from '@/lib/supabase'

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

// Demo access (task_1780764924347_535 P2): the 5 demo roles are reachable
// via the demo-unlock Edge fn, which mints a single-use magic link AFTER
// the visitor supplies the DEMO_GATE_PASSCODE. Passwords no longer ship in
// the public bundle; the only client-side material is the passcode the
// user types, and the magic-link URL the server returns is single-use.
type DemoRole = 'homeowner' | 'vendor' | 'account_rep' | 'employee' | 'admin'

const demoRoles: { role: DemoRole; label: string; icon: typeof Home; desc: string }[] = [
  { role: 'homeowner', label: 'Homeowner', icon: Home, desc: 'Find & hire verified pros' },
  { role: 'vendor', label: 'Contractor', icon: Wrench, desc: 'Manage leads & quotes' },
  { role: 'account_rep', label: 'Account Rep', icon: UserCheck, desc: 'Vendor-rep dashboard' },
  { role: 'employee', label: 'Admin Employee', icon: UserCog, desc: 'Internal ops view' },
  { role: 'admin', label: 'Admin', icon: Shield, desc: 'Full admin console' },
]

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // PR-254 (Rod-direct 2026-05-17) — after 5s of isLoading, surface
  // "Still working..." copy so a slow CF→Supabase edge fetch doesn't
  // read as a dead button. Apollo PoP-walker measured ~24s total during
  // edge-pinning windows; the signIn timeout (12s, lib/auth.ts) is the
  // hard ceiling, this is the soft "we're still trying" reassurance.
  const [isStillWorking, setIsStillWorking] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [demoPasscode, setDemoPasscode] = useState('')
  const [demoUnlocked, setDemoUnlocked] = useState(false)
  const [demoSubmitting, setDemoSubmitting] = useState(false)
  const [demoLoadingRole, setDemoLoadingRole] = useState<DemoRole | null>(null)
  const [demoError, setDemoError] = useState<string | null>(null)
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isLoading) {
      setIsStillWorking(false)
      return
    }
    const handle = setTimeout(() => setIsStillWorking(true), 5_000)
    return () => clearTimeout(handle)
  }, [isLoading])

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
        profile.role === 'admin' || profile.role === 'admin_employee'
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
      // Real-credential login always clears the demo mock-vendor alias.
      // demoLogin() sets this key for vendor/account_rep demo sessions;
      // without this clear a prior Vendor Demo session leaves v-1 in LS
      // and the real vendor account inherits its mock scope — leaking
      // seed leads (L-0001 Maria, L-0005 James) into the real profile.
      localStorage.removeItem('buildconnect-demo-mock-vendor-id')
      await signIn(data.email, data.password)
      // AuthBootstrap's onAuthStateChange listener hydrates the store;
      // the useEffect above then navigates based on role.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid email or password'
      toast.error(message)
      setIsLoading(false)
    }
  }

  function resetDemoModal() {
    setDemoPasscode('')
    setDemoUnlocked(false)
    setDemoError(null)
    setDemoLoadingRole(null)
  }

  async function onDemoPasscodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Trim whitespace — paste from autocomplete/notes apps tends to drag
    // trailing spaces, which would silently fail the server-side timing-safe
    // equality check and look indistinguishable from a real typo.
    const passcode = demoPasscode.trim()
    if (!passcode || demoSubmitting) return
    if (passcode !== demoPasscode) setDemoPasscode(passcode)
    setDemoSubmitting(true)
    setDemoError(null)
    try {
      // Probe the gate with the lightest valid role so we get a 401 on
      // wrong passcode without minting a session. The role we pick here
      // is discarded — actual role selection happens after unlock.
      // FunctionsHttpError (non-2xx) puts the response in `error`, not
      // `data`, so we have to read the status off `error.context` to
      // distinguish a 401 (wrong passcode) from a 5xx / network failure.
      const { data, error } = await supabase.functions.invoke('demo-unlock', {
        body: { passcode, role: 'homeowner' },
      })
      if (error) {
        const status =
          (error as { context?: { status?: number } } | null)?.context?.status ?? 0
        setDemoError(status === 401 ? 'Wrong passcode.' : 'Could not unlock demo.')
        setDemoSubmitting(false)
        return
      }
      if (!data?.ok || !data?.magic_link) {
        setDemoError('Could not unlock demo.')
        setDemoSubmitting(false)
        return
      }
      setDemoUnlocked(true)
      setDemoSubmitting(false)
    } catch {
      setDemoError('Could not reach the demo gate. Try again.')
      setDemoSubmitting(false)
    }
  }

  async function onDemoRolePick(role: DemoRole) {
    if (demoLoadingRole) return
    setDemoLoadingRole(role)
    setDemoError(null)
    try {
      await clearQaBeforeAuth()
      localStorage.removeItem('buildconnect-demo-mock-vendor-id')
      const { data, error } = await supabase.functions.invoke('demo-unlock', {
        body: { passcode: demoPasscode.trim(), role },
      })
      if (error || !data?.ok) {
        setDemoError('Could not start the demo. Try again.')
        setDemoLoadingRole(null)
        return
      }
      // task_1780776051103_410 Chrome-hang fix — establish the session via
      // supabase.auth.verifyOtp({token_hash}) instead of navigating to the
      // magic-link URL. The redirect flow (action_link → /auth/v1/verify →
      // /home#access_token=...) was failing on Chromium: apollo's dual-engine
      // probe confirmed identical hash delivery in both engines but only
      // WebKit's detectSessionInUrl actually consumed the hash into
      // sb-llybxugitrbgybplgpsi-auth-token; Chromium dropped the parse and the
      // route guard bounced Rodolfo back to /login. verifyOtp does the same
      // session establish purely in-JS — no /verify redirect, no URL parsing,
      // no engine-specific race. SIGNED_IN fires → AuthBootstrap hydrate →
      // useEffect above navigates to the role's home.
      const tokenHash = data.token_hash as string | undefined
      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'magiclink',
        })
        if (verifyError) {
          setDemoError('Could not start the demo. Try again.')
          setDemoLoadingRole(null)
          return
        }
        return
      }
      // Fallback: if the Edge fn response omits token_hash (pre-fix deploy
      // still cached), fall back to the legacy magic-link navigation. Safe to
      // remove after a few hours once the new Edge fn deploy is universally
      // returned.
      if (data.magic_link) {
        window.location.href = data.magic_link as string
        return
      }
      setDemoError('Could not start the demo. Try again.')
      setDemoLoadingRole(null)
    } catch {
      setDemoError('Could not start the demo. Try again.')
      setDemoLoadingRole(null)
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
            <img
              src="/logo-v2.png"
              alt="BuildConnect"
              className="h-10 w-10 rounded-xl object-cover"
            />
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
            <img
              src="/logo-v2.png"
              alt="BuildConnect"
              className="h-9 w-9 rounded-lg object-cover"
            />
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

          {isStillWorking && (
            <p
              className="mt-4 text-center text-xs text-muted-foreground"
              data-loading-still-working
              role="status"
              aria-live="polite"
            >
              Still working... if this takes more than a few seconds, check your connection.
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-4 h-11 w-full text-sm font-medium gap-2"
            onClick={() => {
              resetDemoModal()
              setDemoOpen(true)
            }}
            data-demo-access-trigger
          >
            <Lock className="h-4 w-4" />
            Demo Access
          </Button>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create account
            </Link>
          </p>
        </motion.div>
      </div>

      <Dialog
        open={demoOpen}
        onOpenChange={(open) => {
          setDemoOpen(open)
          if (!open) resetDemoModal()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {demoUnlocked ? 'Choose a demo role' : 'Demo Access'}
            </DialogTitle>
            <DialogDescription>
              {demoUnlocked
                ? 'Pick a role to step into a live demo of that experience.'
                : 'Enter the demo passcode to reveal the demo roles.'}
            </DialogDescription>
          </DialogHeader>

          {!demoUnlocked ? (
            <form onSubmit={onDemoPasscodeSubmit} className="flex flex-col gap-3">
              <Label htmlFor="demo-passcode" className="text-sm font-medium">
                Demo passcode
              </Label>
              <Input
                id="demo-passcode"
                type="password"
                placeholder="Enter passcode"
                className="h-11"
                value={demoPasscode}
                onChange={(e) => setDemoPasscode(e.target.value)}
                autoFocus
                data-demo-passcode-input
              />
              {demoError && (
                <p className="text-xs text-destructive" data-demo-error>
                  {demoError}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                className="mt-1 h-11 w-full text-sm font-medium gap-2"
                disabled={demoSubmitting || !demoPasscode}
                data-demo-passcode-submit
              >
                {demoSubmitting ? (
                  <motion.div
                    className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                ) : (
                  <>Unlock demo <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-2" data-demo-role-grid>
              {demoRoles.map(({ role, label, icon: Icon, desc }) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => onDemoRolePick(role)}
                  disabled={!!demoLoadingRole}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                  data-demo-role={role}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {demoLoadingRole === role ? (
                      <motion.div
                        className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                      />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </button>
              ))}
              {demoError && (
                <p className="mt-1 text-xs text-destructive" data-demo-error>
                  {demoError}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
