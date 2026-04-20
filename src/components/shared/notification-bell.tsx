import { Bell, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface NotificationItem {
  id: string
  title: string
  description: string
  icon?: LucideIcon
  iconColor?: string
  tint?: string
}

/**
 * Uniform notification bell — same interaction shape across homeowner /
 * vendor / admin headers. Pass the role-relevant notifications in; empty
 * array renders the no-notifications empty state.
 *
 * Before this component existed, homeowner had a full Popover + list,
 * vendor had a static bell with no popover, and admin had no bell at all.
 * Rod-direct via kratos msg 1776651738075.
 */
export function NotificationBell({
  notifications,
  size = 'default',
}: {
  notifications: NotificationItem[]
  size?: 'default' | 'sm'
}) {
  const count = notifications.length
  const btnClass = size === 'sm' ? 'relative rounded-full h-8 w-8' : 'relative rounded-full'
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={btnClass}
          aria-label={count > 0 ? `Notifications, ${count} new` : 'Notifications'}
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {count === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No new notifications</div>
          ) : (
            notifications.map((n) => {
              const Icon = n.icon
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 p-3 border-b last:border-0 ${n.tint ?? ''}`}
                >
                  {Icon && (
                    <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${n.iconColor ?? 'text-primary'}`} />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
