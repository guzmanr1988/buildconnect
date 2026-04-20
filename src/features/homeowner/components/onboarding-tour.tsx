import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Hammer, CheckCircle2, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const ONBOARDING_FLAG = 'buildconnect-onboarding-seen'

export function hasSeenOnboarding(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(ONBOARDING_FLAG) === '1'
}

export function markOnboardingSeen() {
  if (typeof window === 'undefined') return
  localStorage.setItem(ONBOARDING_FLAG, '1')
}

export function resetOnboarding() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ONBOARDING_FLAG)
}

const STEPS = [
  {
    icon: Home,
    title: 'Welcome to BuildConnect',
    body: "Start by telling us what you want to build — from roofing to pool installations, we match you with verified contractors in South Florida.",
    iconBg: 'from-cyan-400 to-blue-500',
  },
  {
    icon: Hammer,
    title: 'Pick a service',
    body: "Scroll through the service grid below. Each one walks you through a quick configurator to spec your project.",
    iconBg: 'from-amber-400 to-orange-500',
  },
  {
    icon: CheckCircle2,
    title: 'Book & track',
    body: "Send your project to a contractor, book a site visit, and track everything from your Projects tab.",
    iconBg: 'from-emerald-400 to-green-600',
  },
] as const

interface OnboardingTourProps {
  open: boolean
  onClose: () => void
}

export function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [step, setStep] = useState(0)

  // Reset to step 0 on open so re-opens start fresh
  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  const handleFinish = () => {
    markOnboardingSeen()
    onClose()
  }

  const handleNext = () => {
    if (isLast) {
      handleFinish()
    } else {
      setStep(step + 1)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleFinish() }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="p-6 space-y-4"
          >
            <div className={cn(
              'h-16 w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-md',
              current.iconBg,
            )}>
              <Icon className="h-8 w-8 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="text-xl font-bold font-heading text-foreground">
                {current.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {current.body}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="border-t border-border/40 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isLast && (
              <Button variant="ghost" size="sm" onClick={handleFinish}>
                Skip
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="gap-1">
              {isLast ? 'Get started' : 'Next'}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
