import { cn } from '@/lib/utils'

interface LogoProps {
  collapsed?: boolean
  className?: string
}

export function Logo({ collapsed, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src="/logo.png"
        alt="BuildConnect"
        className="h-9 w-9 rounded-lg object-cover"
      />
      {!collapsed && (
        <span className="text-lg font-bold tracking-tight font-heading">
          Build<span className="text-primary">Connect</span>
        </span>
      )}
    </div>
  )
}
