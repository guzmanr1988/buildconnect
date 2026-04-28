import { cn } from '@/lib/utils'

// Ship #328 — shared sidebar nav badge primitive. Extracted at n=2
// consumers per banked #132 special-case-now-extract-at-n=2 trigger
// (admin Reviews from #315 was n=1; vendor Projects + Lead Workflow
// from #328 hits n=2+). Replaces the special-cased Reviews-only render
// in admin-layout SidebarNav.
//
// Per banked #103 format-SoT: single source-of-truth for badge styling
// across admin + vendor sidebars. tone discriminates color-treatment
// without exposing tailwind classes to consumers.
//
// isActive coupling: when the parent NavLink is active (route match),
// the badge inverts to bg-primary-foreground / text-primary so the
// badge contrasts against the active-state primary background. This
// matches the existing Reviews-badge inversion shape pre-extraction.
//
// Hides at 0-count per Decision D — don't add visual noise on nav
// entries that have nothing waiting.

export type NavBadgeTone = 'amber' | 'neutral'

interface NavBadgeProps {
  count: number
  tone?: NavBadgeTone
  isActive: boolean
}

export function NavBadge({ count, tone = 'amber', isActive }: NavBadgeProps) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full px-2 min-w-[1.25rem] h-5 text-[10px] font-bold shrink-0',
        isActive && 'bg-primary-foreground text-primary',
        !isActive && tone === 'amber' && 'bg-amber-500 text-white',
        !isActive && tone === 'neutral' && 'bg-muted-foreground/80 text-background',
      )}
    >
      {count}
    </span>
  )
}
