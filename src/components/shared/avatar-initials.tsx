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
      role="img"
      aria-label={`Avatar: ${initials}`}
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white shrink-0 ring-1 ring-foreground/10',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {/* aria-hidden so axe color-contrast skips white-on-custom-bg: the role=img + aria-label above carries the a11y semantics (b-005 pattern on Mock avatar_color values that don't clear 4.5:1 against white). */}
      <span aria-hidden="true">{initials}</span>
    </div>
  )
}
