import { ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ServiceConfig } from '@/types'
import { cn } from '@/lib/utils'
import { InlineConfigurator } from './inline-configurator'
import { AnimatePresence } from 'framer-motion'

interface ServiceCardProps {
  service: ServiceConfig
  isExpanded: boolean
  onToggle: () => void
}

export function ServiceCard({ service, isExpanded, onToggle }: ServiceCardProps) {
  const isPhase2 = !!service.phase2

  return (
    <div className="flex flex-col">
      <Card
        className={cn(
          'cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
          isExpanded && 'border-primary/30 shadow-md',
          isPhase2 && 'opacity-60 pointer-events-none'
        )}
        onClick={isPhase2 ? undefined : onToggle}
      >
        <CardContent className="flex flex-col gap-3">
          {/* Badge */}
          {service.badge && (
            <span
              className={cn(
                'inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                service.badgeColor
              )}
            >
              {service.badge}
            </span>
          )}

          {/* Name and tagline */}
          <div>
            <h3 className="text-base font-semibold font-heading text-foreground">
              {service.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {service.tagline}
            </p>
          </div>

          {/* Feature tags */}
          <div className="flex flex-wrap gap-1.5">
            {service.features.map((feature) => (
              <Badge
                key={feature}
                variant="secondary"
                className="rounded-full text-[10px] font-medium px-2 py-0.5 h-auto"
              >
                {feature}
              </Badge>
            ))}
          </div>

          {/* Stat + expand indicator */}
          <div className="flex items-center justify-between border-t border-border/50 pt-3">
            <div>
              <p className="text-xs text-muted-foreground">{service.stat.label}</p>
              <p className="text-lg font-bold font-heading text-foreground">
                {service.stat.value}
              </p>
            </div>
            {!isPhase2 && (
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )}
              >
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inline configurator */}
      <AnimatePresence>
        {isExpanded && !isPhase2 && (
          <InlineConfigurator service={service} />
        )}
      </AnimatePresence>
    </div>
  )
}
