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

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  phone: z.string().min(1, 'Phone is required'),
  address: z.string().min(1, 'Address is required'),
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
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  useEffect(() => {
    if (isAuthenticated && profile) {
      navigate(profile.role === 'vendor' ? '/vendor' : '/home', { replace: true })
    }
  }, [isAuthenticated, profile, navigate])

  async function onSubmit(data: RegisterFormData) {
    if (!selectedRole) return
    setIsLoading(true)
    try {
      const result = await signUp(data.email, data.password, {
        name: data.name,
        role: selectedRole,
        phone: data.phone,
        address: data.address,
        company: data.company,
      })

      // handle_new_user trigger inserts id/email/name/role/initials on auth.users INSERT.
      // Phone/address/company come from the form — patch them onto the new profile row.
      const userId = result.user?.id
      if (userId) {
        try {
          await updateVendor(userId, {
            phone: data.phone,
            address: data.address,
            ...(data.company ? { company: data.company } : {}),
          })
        } catch (err) {
          console.error('[register] profile patch failed:', err)
        }
      }
      // AuthBootstrap hydrates the store via onAuthStateChange; useEffect navigates.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed'
      toast.error(message)
      setIsLoading(false)
    }
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
                  placeholder="(305) 555-0000"
                  className="h-11"
                  {...register('phone')}
                  aria-invalid={!!errors.phone}
                />
                {errors.phone && (
                  <p className="text-xs text-destructive">{errors.phone.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="address">Address <span className="text-destructive">*</span></Label>
                <Input
                  id="address"
                  placeholder="1234 Main St, Miami, FL 33101"
                  className="h-11"
                  {...register('address')}
                  aria-invalid={!!errors.address}
                />
                {errors.address && (
                  <p className="text-xs text-destructive">{errors.address.message}</p>
                )}
              </div>

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
    </div>
  )
}
