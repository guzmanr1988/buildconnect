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
}

export function KpiCard({ title, value, change, trend, icon: Icon, iconColor, className }: KpiCardProps) {
  return (
    <Card className={cn('relative overflow-hidden transition-shadow hover:shadow-md', className)}>
      <CardContent className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-medium tracking-tight font-heading text-foreground">{value}</p>
            {change && (
              <div className={cn('flex items-center gap-1 text-[10px] font-medium', trend === 'up' ? 'text-success' : 'text-destructive')}>
                {trend === 'up' ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {change}
              </div>
            )}
          </div>
          <div className={cn('rounded-lg p-2 shrink-0', iconColor || 'bg-primary/10')}>
            <Icon className={cn('h-4 w-4', iconColor ? 'text-white' : 'text-primary')} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
