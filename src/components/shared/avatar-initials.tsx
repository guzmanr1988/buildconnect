import { cn } from '@/lib/utils'

interface AvatarInitialsProps {
  initials: string
  color: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

export function AvatarInitials({ initials, color, size = 'md', className }: AvatarInitialsProps) {
  return (
    <div
      className={cn('rounded-full flex items-center justify-center font-bold text-white shrink-0', sizes[size], className)}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  )
}
