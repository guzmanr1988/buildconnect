import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Home, Wrench, Eye, EyeOff, Building2, ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth-store'
import { signUp, friendlyAuthError } from '@/lib/auth'
import { updateVendor } from '@/lib/api/vendors'
import type { UserRole } from '@/types'
import { cn } from '@/lib/utils'
import { formatPhoneNumber, composeAddress } from '@/lib/format-helpers'
import { AddressFieldset } from '@/components/shared/address-fieldset'
import { VendorPaymentDialog } from '@/features/auth/components/vendor-payment-dialog'
import { useVendorBillingStore, type VendorPaymentMethod } from '@/stores/vendor-billing-store'
/* handlePaymentSuccess branches on add-vs-update via the store's new
 * addPaymentMethod action; signup always adds (fresh account, no prior
 * method). Ship #189 per Rodolfo pivot #11 data-model refactor. */
import { useVendorMembershipStore } from '@/stores/vendor-membership-store'

const registerSchema = z.object({
  // Ship #272 — split full-name capture into firstName + lastName.
  // Profile.name remains single-string SoT (downstream reads use
  // profile.name everywhere); the two-input UI concatenates at
  // submit time per banked widen-reads-narrow-writes.
  firstName: z.string().min(1, 'First name is required').min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(1, 'Last name is required').min(2, 'Last name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  phone: z.string().min(1, 'Phone is required').min(12, 'Enter a valid 10-digit phone'),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required').length(2, 'Use 2-letter state code'),
  zip: z.string().min(1, 'ZIP is required').regex(/^\d{5}$/, 'Use 5-digit ZIP'),
  company: z.string().optional(),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type RegisterFormData = z.infer<typeof registerSchema>

const roles: { role: UserRole; label: string; description: string; icon: typeof Home }[] = [
  {
    role: 'homeowner',
    label: 'Homeowner',
    description: 'Find verified contractors, get quotes, and manage your home projects.',
    icon: Home,
  },
  {
    role: 'vendor',
    label: 'Contractor / Vendor',
    description: 'Grow your business with qualified leads and project management tools.',
    icon: Wrench,
  },
]

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  // Ship #183 — Supabase-signup-bypass for testing. Gated behind
  // VITE_DEMO_MODE so it disappears in prod builds. /register?bypass=1
  // synthesizes a vendor auth session locally (no Supabase call) and
  // pre-opens the payment dialog so Rodolfo + QA can iterate the
  // signup → payment → portal flow without hitting the per-IP rate
  // limit. Seeded via useState initializer below so the gate is TRUE
  // on the first render, before any redirect useEffect can see
  // gate=false with profile=set — same race-proof pattern as #179s
  // sync-before-async, applied to initial state here.
  const bypassActive = (() => {
    const demoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
    return demoMode && searchParams.get('bypass') === '1'
  })()
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(bypassActive ? 'vendor' : null)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // Ship #182 — persistent form-level error banner. Toast clears too
  // quickly for rate-limit messages where the user needs to read + wait;
  // inline banner stays until the next submit attempt or role switch.
  const [formError, setFormError] = useState<string | null>(null)
  // Ship #179 (Rodolfo-direct 2026-04-21) — gate-state for vendor payment
  // dialog. Set SYNCHRONOUSLY before signUp's async boundary so the
  // AuthBootstrap SIGNED_IN listener's downstream useEffect below sees
  // the gate before it would normally redirect. Homeowners skip this
  // entirely; only vendor signups route through the payment dialog.
  // Ship #183 seeds this true when ?bypass=1 is present.
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(() => bypassActive)
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const addVendorPaymentMethod = useVendorBillingStore((s) => s.addPaymentMethod)
  const activateMembership = useVendorMembershipStore((s) => s.activateMembership)

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { state: 'FL' },
  })
  const phoneValue = watch('phone') ?? ''
  const streetValue = watch('street') ?? ''
  const cityValue = watch('city') ?? ''
  const stateValue = watch('state') ?? ''
  const zipValue = watch('zip') ?? ''

  useEffect(() => {
    // Ship #274 — diag telemetry on redirect useEffect re-fires.
    const isDemoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
    if (isDemoMode) {
      // eslint-disable-next-line no-console
      console.log('[#274 payment-stuck-diag]', 'redirect-useEffect:fire', {
        t: Date.now(),
        isAuthenticated,
        profile_id: profile?.id,
        profile_role: profile?.role,
        paymentDialogOpen,
      })
    }
    if (!isAuthenticated || !profile) {
      if (isDemoMode) console.log('[#274 payment-stuck-diag]', 'redirect-useEffect:returning-early (not-authed-or-no-profile)')
      return
    }
    // Ship #179 — gate vendor redirect on payment dialog. paymentDialogOpen
    // is set synchronously in onSubmit BEFORE the signUp await boundary,
    // so by the time AuthBootstrap hydrates profile + this effect re-runs,
    // the gate is already true. The dialog's onSuccess handler flips the
    // gate to false, which re-triggers this effect and lands the redirect.
    if (profile.role === 'vendor' && paymentDialogOpen) {
      if (isDemoMode) console.log('[#274 payment-stuck-diag]', 'redirect-useEffect:returning-early (vendor + paymentDialogOpen)')
      return
    }
    if (isDemoMode) console.log('[#274 payment-stuck-diag]', 'redirect-useEffect:about-to-navigate', { target: profile.role === 'vendor' ? '/vendor' : '/home' })
    navigate(profile.role === 'vendor' ? '/vendor' : '/home', { replace: true })
  }, [isAuthenticated, profile, paymentDialogOpen, navigate])

  // Ship #183 — bypass-mode auth synthesis. When mounted with
  // ?bypass=1 under VITE_DEMO_MODE, stand up a fake vendor session
  // locally (no Supabase round-trip) so the payment dialog flow can be
  // exercised end-to-end without hitting the signup rate-limit. Runs
  // once on mount; safe to re-navigate to the same URL because the
  // `isAuthenticated` guard short-circuits when a session already
  // exists. paymentDialogOpen is already TRUE from the useState
  // initializer above, so the redirect effect's gate observes that
  // synchronously on the render triggered by this effect's setState.
  useEffect(() => {
    if (!bypassActive || isAuthenticated) return
    const stamp = Date.now()
    const fakeId = `bypass-vendor-${stamp}`
    const fakeEmail = `bypass-${stamp}@buildconnect.local`
    useAuthStore.getState().setSession({
      access_token: `bypass-token-${stamp}`,
      user: { id: fakeId, email: fakeEmail },
    })
    useAuthStore.getState().setProfile({
      id: fakeId,
      email: fakeEmail,
      name: 'Bypass Vendor',
      role: 'vendor',
      phone: '(305) 555-0000',
      address: '123 Test Ln, Miami, FL 33131',
      company: 'Bypass Test Co',
      avatar_color: '#4f46e5',
      initials: 'BV',
      status: 'active',
      created_at: new Date().toISOString(),
    })
    // Suggestively show the form in a 'submitting' tail so Rodolfo
    // sees the dialog open without a manual Create-Account click.
  }, [bypassActive, isAuthenticated])

  async function onSubmit(data: RegisterFormData) {
    if (!selectedRole) return
    // Ship #272 — Company Name is mandatory for vendors only. Schema
    // keeps it optional so homeowner signup (where the field isn't
    // rendered) doesn't reject; the role-conditional gate fires here
    // at submit time. setError surfaces the message inline under the
    // Input via the existing aria-invalid + error-paragraph pattern.
    if (selectedRole === 'vendor' && !data.company?.trim()) {
      setError('company', { type: 'required', message: 'Company name is required' })
      return
    }
    // Clear any prior form error at retry — fresh attempt, fresh state.
    setFormError(null)
    // Ship #179 — gate-state SYNCHRONOUSLY before the signUp async
    // boundary. This runs in the same React batch as the button click so
    // the useEffect above sees paymentDialogOpen=true before AuthBootstrap
    // can hydrate the profile from the SIGNED_IN listener event. Without
    // the sync-first ordering, the redirect could fire before the dialog
    // mounts. Only vendors go through the payment dialog — homeowners'
    // gate stays false and they redirect as before.
    if (selectedRole === 'vendor') {
      setPaymentDialogOpen(true)
    }
    setIsLoading(true)
    // Compose the single-string address from the 4 split inputs (ship #113
    // Option A per kratos msg 1776720207707). Profile.address remains a
    // single string for back-compat; structured-shape migration is Tranche-2.
    const composedAddress = composeAddress({
      street: data.street,
      city: data.city,
      state: data.state,
      zip: data.zip,
    })
    // Ship #272 — concat firstName + lastName → single profile.name SoT.
    // Profile.name stays single-string downstream (read everywhere as
    // profile.name); the two-input UI is just the capture-side split
    // per banked widen-reads-narrow-writes.
    const composedName = `${data.firstName.trim()} ${data.lastName.trim()}`
    try {
      const result = await signUp(data.email, data.password, {
        name: composedName,
        role: selectedRole,
        phone: data.phone,
        address: composedAddress,
        company: data.company,
      })

      // handle_new_user trigger inserts id/email/name/role/initials on auth.users INSERT.
      // Phone/address/company come from the form — patch them onto the new profile row.
      const userId = result.user?.id
      if (userId) {
        try {
          await updateVendor(userId, {
            phone: data.phone,
            address: composedAddress,
            ...(data.company ? { company: data.company } : {}),
          })
        } catch (err) {
          console.error('[register] profile patch failed:', err)
        }
      }
      // For homeowners: AuthBootstrap hydrates, useEffect navigates to /home.
      // For vendors: dialog mounted via paymentDialogOpen=true; useEffect
      // redirect stays gated until the dialog's onSuccess flips the gate.
    } catch (err) {
      // Ship #182 — map raw Supabase errors to plain-English copy. Raw
      // messages like "email rate limit exceeded" read as broken; the
      // mapped message tells the user what happened AND whether retry
      // is useful. Persistent banner via formError lets the user read
      // at their pace instead of chasing a toast that dismisses.
      const message = friendlyAuthError(err)
      setFormError(message)
      toast.error(message)
      setIsLoading(false)
      // If signUp fails, unwind the gate so the user can retry.
      setPaymentDialogOpen(false)
    }
  }

  // Ship #179 — dialog success handler. Profile.id resolves post-signUp
  // via AuthBootstrap hydration; by the time the user submits payment,
  // the profile is live and we can key the stored method to it.
  function handlePaymentSuccess(method: Omit<VendorPaymentMethod, 'id'>) {
    // Ship #274 — diag telemetry on payment-success handler.
    const isDemoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
    const diagLog = (phase: string, extra: Record<string, unknown> = {}) => {
      if (!isDemoMode) return
      // eslint-disable-next-line no-console
      console.log('[#274 payment-stuck-diag]', phase, { t: Date.now(), ...extra })
    }
    diagLog('handlePaymentSuccess:start', {
      vendorId: profile?.id,
      profile_role: profile?.role,
      isAuthenticated,
      paymentDialogOpen_before: paymentDialogOpen,
      method_kind: method.kind,
      method_last4: method.last4,
    })
    const vendorId = profile?.id
    if (vendorId) {
      // Ship #189 — addPaymentMethod appends to the per-vendor array +
      // generates the id server-side (store). Fresh signup always adds
      // (no prior method). Purpose comes through from the dialog's
      // segmented toggle; defaults to 'both' in add-mode so first-time
      // setup covers membership + commissions without the user having
      // to think about routing.
      addVendorPaymentMethod(vendorId, method)
      // Ship #180 — activate the monthly membership atomically with the
      // payment-method commit. Billing day seeded from today so the
      // next charge lands one month from signup.
      activateMembership(vendorId)
    } else {
      // Edge case: profile not yet hydrated when success fires. Store
      // against the form email as a fallback key so the portal can
      // reconcile on first load. (Real integration moves this to a
      // signup-time side-effect on the server.)
      console.warn('[register] payment success fired before profile hydrate; skipping store')
    }
    setPaymentDialogOpen(false)
    diagLog('handlePaymentSuccess:end (setPaymentDialogOpen(false) called)')
    // The register.useEffect re-runs on gate flip → navigates to /vendor.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-lg"
      >
        {/* Logo */}
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight font-heading">
            Build<span className="text-primary">Connect</span>
          </span>
        </div>

        {!selectedRole ? (
          <>
            <h2 className="mb-1 text-2xl font-bold font-heading text-foreground">
              Create your account
            </h2>
            <p className="mb-8 text-sm text-muted-foreground">
              Choose how you want to use BuildConnect
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {roles.map((item) => (
                <motion.button
                  key={item.role}
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedRole(item.role)}
                  className={cn(
                    'flex flex-col items-center gap-4 rounded-xl border-2 border-border bg-card p-6 text-center transition-all duration-200',
                    'hover:border-primary/50 hover:shadow-md',
                    'min-h-[180px]'
                  )}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <item.icon className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold font-heading text-foreground">
                      {item.label}
                    </h3>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelectedRole(null)}
              className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to role selection
            </button>

            <h2 className="mb-1 text-2xl font-bold font-heading text-foreground">
              {selectedRole === 'homeowner' ? 'Homeowner' : 'Vendor'} Registration
            </h2>
            <p className="mb-8 text-sm text-muted-foreground">
              Fill in your details to get started
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="firstName">First Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    className="h-11"
                    {...register('firstName')}
                    aria-invalid={!!errors.firstName}
                  />
                  {errors.firstName && (
                    <p className="text-xs text-destructive">{errors.firstName.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="lastName">Last Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    className="h-11"
                    {...register('lastName')}
                    aria-invalid={!!errors.lastName}
                  />
                  {errors.lastName && (
                    <p className="text-xs text-destructive">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              {selectedRole === 'vendor' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="company">Company Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="company"
                    placeholder="Your Company LLC"
                    className="h-11"
                    {...register('company')}
                    aria-invalid={!!errors.company}
                  />
                  {errors.company && (
                    <p className="text-xs text-destructive">{errors.company.message}</p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="reg-email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="reg-email"
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Phone <span className="text-destructive">*</span></Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="305-555-0101"
                  className="h-11"
                  value={phoneValue}
                  onChange={(e) => setValue('phone', formatPhoneNumber(e.target.value), { shouldValidate: false })}
                  aria-invalid={!!errors.phone}
                  inputMode="tel"
                />
                {errors.phone && (
                  <p className="text-xs text-destructive">{errors.phone.message}</p>
                )}
              </div>

              <AddressFieldset
                idPrefix="reg-addr"
                required
                value={{ street: streetValue, city: cityValue, state: stateValue, zip: zipValue }}
                onChange={(next) => {
                  setValue('street', next.street, { shouldValidate: false })
                  setValue('city', next.city, { shouldValidate: false })
                  setValue('state', next.state, { shouldValidate: false })
                  setValue('zip', next.zip, { shouldValidate: false })
                }}
                errors={{
                  street: errors.street?.message,
                  city: errors.city?.message,
                  state: errors.state?.message,
                  zip: errors.zip?.message,
                }}
              />

              <div className="flex flex-col gap-2">
                <Label htmlFor="reg-password">Password <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">Confirm Password <span className="text-destructive">*</span></Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  className="h-11"
                  {...register('confirmPassword')}
                  aria-invalid={!!errors.confirmPassword}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>

              {/* Ship #182 — persistent form-level error banner. Shows
                  friendlyAuthError-mapped copy; stays visible until next
                  submit attempt so the user can read rate-limit / retry
                  guidance at their own pace. */}
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
                >
                  {formError}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="mt-2 h-11 w-full text-sm font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <motion.div
                    className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>
          </>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Login
          </Link>
        </p>
      </motion.div>

      {/* Ship #179 — vendor post-signup payment dialog. Mounted in every
          render branch per the dialog-mount-in-every-return discipline
          banked from prior state-flipped-dialog silent-no-op incidents.
          blocking=true so overlay/Escape don't dismiss; user must pick a
          method to enter the portal. onSuccess → navigate to /vendor. */}
      <VendorPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        onSuccess={handlePaymentSuccess}
        blocking
      />
    </div>
  )
}
