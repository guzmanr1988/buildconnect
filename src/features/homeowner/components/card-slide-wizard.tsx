import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CardSlideWizardProps {
  step: number
  totalSteps: number
  title: string
  subtitle?: string
  direction: 1 | -1
  onBack: () => void
  onNext: () => void
  onSkip?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  skipLabel?: string
  children: React.ReactNode
}

const variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? '60%' : '-60%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? '-60%' : '60%',
    opacity: 0,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  }),
}

export function CardSlideWizard({
  step,
  totalSteps,
  title,
  subtitle,
  direction,
  onBack,
  onNext,
  onSkip,
  nextLabel = 'Continue',
  nextDisabled = false,
  skipLabel = 'Skip',
  children,
}: CardSlideWizardProps) {
  const pct = ((step - 1) / (totalSteps - 1)) * 100

  return (
    <div className="flex flex-col gap-0 max-w-xl mx-auto min-h-[calc(100vh-8rem)]">
      {/* Progress + back header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted transition-colors shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground font-medium">
              Step {step} of {totalSteps}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      {/* Sliding card */}
      <div className="relative overflow-hidden flex-1">
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants as any}
            initial="enter"
            animate="center"
            exit="exit"
            className="flex flex-col gap-5"
          >
            <div>
              <h2 className="text-xl font-bold font-heading text-foreground">{title}</h2>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
              )}
            </div>

            <div>{children}</div>

            {/* Nav buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                size="lg"
                className="w-full h-12 rounded-xl font-semibold"
                disabled={nextDisabled}
                onClick={onNext}
              >
                {nextLabel}
              </Button>
              {onSkip && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={onSkip}
                >
                  {skipLabel}
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
