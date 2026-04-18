import { ChevronRight, Home, Wind, Droplets, Car, Tent, Thermometer, UtensilsCrossed, Bath, PanelTop, Hammer, PaintRoller } from 'lucide-react'
import type { ServiceConfig, ServiceCategory } from '@/types'
import { cn } from '@/lib/utils'

const SERVICE_ICONS: Record<ServiceCategory, React.ElementType> = {
  roofing: Home,
  windows_doors: Wind,
  pool: Droplets,
  driveways: Car,
  pergolas: Tent,
  air_conditioning: Thermometer,
  kitchen: UtensilsCrossed,
  bathroom: Bath,
  wall_paneling: PanelTop,
  garage: Hammer,
  house_painting: PaintRoller,
}

const ICON_GRADIENTS: Record<ServiceCategory, string> = {
  roofing: 'from-orange-400 to-red-500',
  windows_doors: 'from-sky-400 to-blue-500',
  pool: 'from-cyan-400 to-blue-500',
  driveways: 'from-stone-400 to-stone-600',
  pergolas: 'from-emerald-400 to-green-600',
  air_conditioning: 'from-indigo-400 to-violet-500',
  kitchen: 'from-amber-400 to-orange-500',
  bathroom: 'from-teal-400 to-cyan-600',
  wall_paneling: 'from-purple-400 to-violet-500',
  garage: 'from-slate-400 to-slate-600',
  house_painting: 'from-rose-400 to-pink-500',
}

interface ServiceCardProps {
  service: ServiceConfig
  isExpanded: boolean
  onToggle: () => void
}

export function ServiceCard({ service, isExpanded, onToggle }: ServiceCardProps) {
  const isPhase2 = !!service.phase2
  const Icon = SERVICE_ICONS[service.id] || Home
  const iconGradient = ICON_GRADIENTS[service.id] || 'from-blue-400 to-blue-600'

  return (
    <button
      type="button"
      disabled={isPhase2}
      onClick={isPhase2 ? undefined : onToggle}
      className={cn(
        'group relative flex h-full w-full flex-col text-left rounded-2xl border bg-card p-5 transition-all duration-300 ease-out',
        'hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-[2px]',
        'dark:hover:shadow-black/20 dark:hover:border-white/[0.08]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        isExpanded && 'shadow-lg shadow-primary/[0.06] border-primary/25 dark:border-primary/30 ring-1 ring-primary/10',
        isPhase2 && 'opacity-45 pointer-events-none'
      )}
    >
      {/* Badge — top right */}
      {service.badge && (
        <div className="absolute top-4 right-4">
          <span className={cn(
            'inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-semibold leading-none',
            service.badgeColor
          )}>
            {service.badge}
          </span>
        </div>
      )}

      {/* Icon */}
      <div className={cn(
        'mb-4 flex h-11 w-11 items-center justify-center rounded-[12px] bg-gradient-to-br shadow-sm transition-transform duration-300',
        iconGradient,
        'group-hover:scale-105'
      )}>
        <Icon className="h-5 w-5 text-white" strokeWidth={1.8} />
      </div>

      {/* Title */}
      <h3 className="text-[15px] font-semibold font-heading text-foreground leading-snug mb-1 pr-14">
        {service.name}
      </h3>

      {/* Description — exactly 2 lines */}
      <p className="text-[12px] text-muted-foreground leading-[1.65] line-clamp-2 mb-auto">
        {service.description}
      </p>

      {/* Features — quiet dot-separated text */}
      <div className="flex flex-wrap items-center gap-x-1 text-[10px] text-muted-foreground mt-4 mb-4">
        {service.features.slice(0, 3).map((feature, i) => (
          <span key={feature} className="flex items-center gap-1">
            {i > 0 && <span className="text-border">·</span>}
            {feature}
          </span>
        ))}
      </div>

      {/* Bottom CTA — always at bottom thanks to flex + mb-auto above */}
      {!isPhase2 && (
        <div className="flex items-center gap-2 pt-3 border-t border-border/40">
          <span className={cn(
            'text-[12px] font-medium transition-colors duration-200 text-primary'
          )}>
            {isExpanded ? 'Selected' : 'Get started'}
          </span>
          <div className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300 ml-auto',
            isExpanded
              ? 'bg-primary text-white'
              : 'bg-primary/8 text-primary group-hover:bg-primary/15'
          )}>
            <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
          </div>
        </div>
      )}
    </button>
  )
}
