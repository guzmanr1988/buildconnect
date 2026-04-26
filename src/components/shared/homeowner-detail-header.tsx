import type { ReactNode } from 'react'
import { Phone, MapPin, Briefcase } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { AvatarInitials } from '@/components/shared/avatar-initials'

// Ship #280 — extracted from src/features/vendor/pages/homeowner-detail
// (#278) at n=2 consumers per banked format-SoT-shared-helper rule.
// Vendor side passes Message + Email actions; admin side passes
// Suspend/Reactivate + Message + Email. Header card structure (avatar
// + contact info + actions slot) is the deep-match piece; sections
// stay inline per page since their shapes diverge.

export interface HomeownerDetailHeaderProps {
  name: string
  email: string
  phone: string
  address: string
  avatar_color?: string
  initials?: string
  // Optional badge under the contact info — used by vendor side to
  // show "N projects with you" + admin side to show project-count
  // across all vendors. Both consumers want this prefix-customizable.
  projectsLabel?: string
  // Action buttons rendered on the right of the header card. Per-role
  // composition via slot — vendor passes Message/Email; admin passes
  // Suspend/Reactivate/Message/Email.
  actions: ReactNode
}

export function HomeownerDetailHeader({
  name,
  email,
  phone,
  address,
  avatar_color,
  initials,
  projectsLabel,
  actions,
}: HomeownerDetailHeaderProps) {
  const computedInitials =
    initials ?? name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()

  return (
    <Card className="rounded-xl">
      <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <AvatarInitials
          initials={computedInitials}
          color={avatar_color ?? '#3b82f6'}
          size="lg"
        />
        <div className="flex-1 min-w-0 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{phone}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{address}</span>
          </div>
          {projectsLabel && (
            <div className="flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              <span>{projectsLabel}</span>
            </div>
          )}
          {/* email lives in the page header (PageHeader description); not
              repeated here to avoid visual noise — admin page passes
              email separately to PageHeader, vendor page same. */}
          <span className="sr-only">{email}</span>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">{actions}</div>
      </CardContent>
    </Card>
  )
}
