import { ChevronRight, Home, Wind, Droplets, Car, Tent, Thermometer, UtensilsCrossed, Bath, PanelTop, Hammer, PaintRoller, Blinds, Fence, Wrench } from 'lucide-react'
import { motion } from 'framer-motion'
import type { ServiceConfig, ServiceCategory } from '@/types'
import { cn } from '@/lib/utils'

const SERVICE_ICONS: Record<ServiceCategory, React.ElementType> = {
  roofing: Home,
  windows_doors: Wind,
  pool: Droplets,
  driveways: Car,
  fencing: Fence,
  pergolas: Tent,
  air_conditioning: Thermometer,
  kitchen: UtensilsCrossed,
  bathroom: Bath,
  wall_paneling: PanelTop,
  garage: Hammer,
  house_painting: PaintRoller,
  blinds: Blinds,
  remodel: Wrench,
}

const ICON_GRADIENTS: Record<ServiceCategory, string> = {
  roofing: 'from-orange-400 to-red-500',
  windows_doors: 'from-sky-400 to-blue-500',
  pool: 'from-cyan-400 to-blue-500',
  driveways: 'from-stone-400 to-stone-600',
  fencing: 'from-amber-500 to-orange-600',
  pergolas: 'from-emerald-400 to-green-600',
  air_conditioning: 'from-indigo-400 to-violet-500',
  kitchen: 'from-amber-400 to-orange-500',
  bathroom: 'from-teal-400 to-cyan-600',
  wall_paneling: 'from-purple-400 to-violet-500',
  garage: 'from-slate-400 to-slate-600',
  house_painting: 'from-rose-400 to-pink-500',
  blinds: 'from-indigo-400 to-purple-500',
  remodel: 'from-fuchsia-400 to-pink-600',
}

interface ServiceCardProps {
  service: ServiceConfig
  isExpanded: boolean
  onToggle: () => void
}

// V1 — Premium polished baseline.
export function ServiceCard({ service, isExpanded, onToggle }: ServiceCardProps) {
  const isDraft = service.status === 'draft'
  const Icon = SERVICE_ICONS[service.id] || Home
  const iconGradient = ICON_GRADIENTS[service.id] || 'from-blue-400 to-blue-600'

  return (
    <motion.button
      type="button"
      disabled={isDraft}
      onClick={isDraft ? undefined : onToggle}
      whileHover={isDraft ? undefined : { y: -3 }}
      whileTap={isDraft ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn(
        'group relative flex h-full w-full flex-col text-left rounded-2xl border bg-card p-4 overflow-hidden',
        'shadow-sm hover:shadow-lg hover:shadow-black/[0.05] transition-shadow duration-300',
        'dark:hover:shadow-black/20 dark:hover:border-white/[0.08]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        isExpanded && 'shadow-lg shadow-primary/[0.06] border-primary/25 dark:border-primary/30 ring-1 ring-primary/10',
        isDraft && 'pointer-events-none',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <motion.div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-[12px] bg-gradient-to-br shadow-sm',
            iconGradient,
          )}
          whileHover={{ rotate: -4, scale: 1.06 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        >
          <Icon className="h-5 w-5 text-white" strokeWidth={1.8} />
        </motion.div>
        {isDraft ? (
          <span className="inline-flex items-center rounded-full px-2 py-[3px] text-[10px] font-semibold leading-none bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Coming Soon
          </span>
        ) : service.badge ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-[3px] text-[10px] font-semibold leading-none',
              service.badgeColor,
            )}
          >
            {service.badge}
          </span>
        ) : null}
      </div>

      <h3 className="text-[15px] font-semibold font-heading text-foreground leading-snug truncate">
        {service.name}
      </h3>

      <p className="text-[12px] text-muted-foreground leading-[1.55] line-clamp-2 mt-1 mb-3">
        {service.description}
      </p>

      <div className="flex flex-wrap items-center gap-x-1 text-[10px] text-muted-foreground mt-auto mb-3">
        {service.features.slice(0, 3).map((feature, i) => (
          <span key={feature} className="flex items-center gap-1">
            {i > 0 && <span className="text-border">·</span>}
            {feature}
          </span>
        ))}
      </div>

      {!isDraft && (
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <span className="text-[12px] font-medium text-primary">
            {isExpanded ? 'Selected' : 'Get started'}
          </span>
          <motion.div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full',
              isExpanded ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
            )}
            whileHover={{ x: 2 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </motion.div>
        </div>
      )}
    </motion.button>
  )
}
