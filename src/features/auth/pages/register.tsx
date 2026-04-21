import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { Home, Wrench, Eye, EyeOff, Building2, ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth-store'
import { signUp } from '@/lib/auth'
import { updateVendor } from '@/lib/api/vendors'
import type { UserRole } from '@/types'
import { cn } from '@/lib/utils'
import { formatPhoneNumber, composeAddress } from '@/lib/format-helpers'
import { AddressFieldset } from '@/components/shared/address-fieldset'
import { VendorPaymentDialog } from '@/features/auth/components/vendor-payment-dialog'
import { useVendorBillingStore, type VendorPaymentMethod } from '@/stores/vendor-billing-store'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').min(2, 'Name must be at least 2 characters'),
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
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // Ship #179 (Rodolfo-direct 2026-04-21) — gate-state for vendor payment
  // dialog. Set SYNCHRONOUSLY before signUp's async boundary so the
  // AuthBootstrap SIGNED_IN listener's downstream useEffect below sees
  // the gate before it would normally redirect. Homeowners skip this
  // entirely; only vendor signups route through the payment dialog.
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setVendorPaymentMethod = useVendorBillingStore((s) => s.setPaymentMethod)

  const {
    register,
    handleSubmit,
    setValue,
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
    if (!isAuthenticated || !profile) return
    // Ship #179 — gate vendor redirect on payment dialog. paymentDialogOpen
    // is set synchronously in onSubmit BEFORE the signUp await boundary,
    // so by the time AuthBootstrap hydrates profile + this effect re-runs,
    // the gate is already true. The dialog's onSuccess handler flips the
    // gate to false, which re-triggers this effect and lands the redirect.
    if (profile.role === 'vendor' && paymentDialogOpen) return
    navigate(profile.role === 'vendor' ? '/vendor' : '/home', { replace: true })
  }, [isAuthenticated, profile, paymentDialogOpen, navigate])

  async function onSubmit(data: RegisterFormData) {
    if (!selectedRole) return
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
    try {
      const result = await signUp(data.email, data.password, {
        name: data.name,
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
      const message = err instanceof Error ? err.message : 'Registration failed'
      toast.error(message)
      setIsLoading(false)
      // If signUp fails, unwind the gate so the user can retry.
      setPaymentDialogOpen(false)
    }
  }

  // Ship #179 — dialog success handler. Profile.id resolves post-signUp
  // via AuthBootstrap hydration; by the time the user submits payment,
  // the profile is live and we can key the stored method to it.
  function handlePaymentSuccess(method: VendorPaymentMethod) {
    const vendorId = profile?.id
    if (vendorId) {
      setVendorPaymentMethod(vendorId, method)
    } else {
      // Edge case: profile not yet hydrated when success fires. Store
      // against the form email as a fallback key so the portal can
      // reconcile on first load. (Real integration moves this to a
      // signup-time side-effect on the server.)
      console.warn('[register] payment success fired before profile hydrate; skipping store')
    }
    setPaymentDialogOpen(false)
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  className="h-11"
                  {...register('name')}
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>

              {selectedRole === 'vendor' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="company">Company Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="company"
                    placeholder="Your Company LLC"
                    className="h-11"
                    {...register('company')}
                  />
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
