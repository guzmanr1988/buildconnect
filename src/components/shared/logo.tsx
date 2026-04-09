import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogoProps {
  collapsed?: boolean
  className?: string
}

export function Logo({ collapsed, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="h-5 w-5" />
      </div>
      {!collapsed && (
        <span className="text-lg font-bold tracking-tight font-heading">
          Build<span className="text-primary">Connect</span>
        </span>
      )}
    </div>
  )
}
