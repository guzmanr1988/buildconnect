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
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight font-heading">{value}</p>
            {change && (
              <div className={cn('flex items-center gap-1 text-xs font-medium', trend === 'up' ? 'text-success' : 'text-destructive')}>
                {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {change}
              </div>
            )}
          </div>
          <div className={cn('rounded-xl p-2.5', iconColor || 'bg-primary/10')}>
            <Icon className={cn('h-5 w-5', iconColor ? 'text-white' : 'text-primary')} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
