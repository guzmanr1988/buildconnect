import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string
  change?: string
  trend?: 'up' | 'down'
  icon: LucideIcon
  iconColor?: string
  className?: string
  dense?: boolean
}

export function KpiCard({ title, value, change, trend, icon: Icon, iconColor, className, dense }: KpiCardProps) {
  return (
    <Card className={cn('relative overflow-hidden bg-[oklch(0.968_0.020_255)] dark:bg-[oklch(0.205_0.020_258)] shadow-sm transition-shadow hover:shadow-md', className)}>
      <CardContent className={cn(dense ? 'p-2.5' : 'p-3.5')}>
        <div className="flex items-center justify-between gap-2">
          <div className={cn('min-w-0', dense ? 'space-y-0' : 'space-y-0.5')}>
            <p className={cn('font-medium text-muted-foreground truncate', dense ? 'text-[11px] leading-snug' : 'text-[11px]')}>{title}</p>
            <p translate="no" className={cn('notranslate font-medium tracking-tight font-heading text-foreground', dense ? 'text-xl leading-tight' : 'text-2xl')}>{value}</p>
            {change && (
              <div translate="no" className={cn('notranslate flex items-center gap-1 font-medium', dense ? 'text-[10px] leading-snug' : 'text-[10px]', trend === 'up' ? 'text-success' : 'text-destructive')}>
                {trend === 'up' ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {change}
              </div>
            )}
          </div>
          <div className={cn('rounded-lg shrink-0', dense ? 'p-1.5' : 'p-2', iconColor || 'bg-primary/10')}>
            <Icon className={cn(dense ? 'h-3.5 w-3.5' : 'h-4 w-4', iconColor ? 'text-white' : 'text-primary')} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
