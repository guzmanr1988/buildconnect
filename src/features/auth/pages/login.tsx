import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Building2, Home, Wrench, Shield } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth-store'
import { MOCK_HOMEOWNERS, MOCK_VENDORS, MOCK_ADMIN } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { setSession, setProfile } = useAuthStore()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  function performLogin(profile: typeof MOCK_HOMEOWNERS[0]) {
    setIsLoading(true)
    setTimeout(() => {
      setSession({
        access_token: `mock-token-${profile.id}`,
        user: { id: profile.id, email: profile.email },
      })
      setProfile(profile)
      const dest =
        profile.role === 'admin'
          ? '/admin'
          : profile.role === 'vendor'
            ? '/vendor'
            : '/home'
      navigate(dest)
      setIsLoading(false)
    }, 400)
  }

  function onSubmit(data: LoginFormData) {
    const allUsers = [...MOCK_HOMEOWNERS, ...MOCK_VENDORS, MOCK_ADMIN]
    const found = allUsers.find((u) => u.email === data.email)
    if (found) {
      performLogin(found)
    }
  }

  function demoLogin(role: 'homeowner' | 'vendor' | 'admin') {
    const profile =
      role === 'homeowner'
        ? MOCK_HOMEOWNERS[0]
        : role === 'vendor'
          ? MOCK_VENDORS[0]
          : MOCK_ADMIN
    setValue('email', profile.email)
    setValue('password', 'demo1234')
    performLogin(profile)
  }

  return (
    <div className="flex min-h-screen">
      {/* Left hero panel - hidden on mobile */}
      <div className="relative hidden w-1/2 items-center justify-center bg-gradient-to-br from-primary to-primary/80 lg:flex">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djZoLTJ2LTZoLTZ2LTJoNnYtNmgydjZoNnYyaC02eiIvPjwvZz48L2c+PC9zdmc+')] opacity-40" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative z-10 max-w-md px-12 text-white"
        >
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
            <Building2 className="h-8 w-8" />
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight font-heading">
            Build Your Dream Home
          </h1>
          <p className="text-lg text-white/80 leading-relaxed">
            South Florida's premier construction marketplace. Connect with verified contractors, get instant quotes, and bring your vision to life.
          </p>
          <div className="mt-10 flex flex-col gap-4">
            {[
              { label: 'Verified Contractors', value: '500+' },
              { label: 'Projects Completed', value: '12,000+' },
              { label: 'Customer Satisfaction', value: '4.8/5' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-white/70">{stat.label}:</span>
                <span className="font-semibold">{stat.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right login form */}
      <div className="flex w-full flex-col items-center justify-center bg-background px-6 py-12 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight font-heading">
              Build<span className="text-primary">Connect</span>
            </span>
          </div>

          <h2 className="mb-1 text-2xl font-bold font-heading text-foreground">
            Welcome back
          </h2>
          <p className="mb-8 text-sm text-muted-foreground">
            Sign in to your BuildConnect account
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
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

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
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
              className="h-11 w-full text-sm font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <motion.div
                  className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">Quick Demo Login</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Demo login buttons */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { role: 'homeowner' as const, label: 'Homeowner', icon: Home, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20' },
              { role: 'vendor' as const, label: 'Vendor', icon: Wrench, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20' },
              { role: 'admin' as const, label: 'Admin', icon: Shield, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20' },
            ].map((demo) => (
              <button
                key={demo.role}
                type="button"
                onClick={() => demoLogin(demo.role)}
                disabled={isLoading}
                className={cn(
                  'flex min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border p-3 transition-all duration-200',
                  demo.color,
                  'disabled:opacity-50'
                )}
              >
                <demo.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{demo.label}</span>
              </button>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Register
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
