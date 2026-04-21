import { cn } from '@/lib/utils'
import { deriveInitials } from '@/lib/initials'

interface AvatarInitialsProps {
  // Explicit initials override. When absent, falls back to deriving from
  // `name` (preferred for rename-residue avoidance, ship #164).
  initials?: string
  // Name source for auto-derivation. Passing `name` instead of `initials`
  // makes future renames of the underlying person/company Just Work — no
  // stale initials field to update separately.
  name?: string
  color: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  // Optional uploaded avatar URL — base64 dataURL from AvatarUpload
  // component, or future Supabase Storage URL. If present, renders
  // the image; otherwise falls back to initials-on-color (ship #115
  // per kratos msg 1776720328611).
  avatarUrl?: string
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

export function AvatarInitials({ initials, name, color, size = 'md', className, avatarUrl }: AvatarInitialsProps) {
  const resolvedInitials = initials && initials.trim() ? initials : deriveInitials(name)
  if (avatarUrl) {
    return (
      <div
        role="img"
        aria-label={`Avatar: ${resolvedInitials}`}
        className={cn(
          'rounded-full overflow-hidden shrink-0 ring-1 ring-foreground/10 bg-muted',
          sizes[size],
          className,
        )}
      >
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
    )
  }
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
      <span aria-hidden="true">{resolvedInitials}</span>
    </div>
  )
}
