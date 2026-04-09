import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar as CalendarIcon, Clock, MapPin, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { MOCK_LEADS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import type { Lead, LeadStatus } from '@/types'

const VENDOR_ID = 'v-1'

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20',
  pending: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20',
  rescheduled: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20',
  completed: 'border-l-slate-400 bg-slate-50/50 dark:bg-slate-950/20',
  rejected: 'border-l-red-400 bg-red-50/50 dark:bg-red-950/20',
}

const STATUS_DOT: Record<string, string> = {
  confirmed: 'bg-emerald-500',
  pending: 'bg-amber-500',
  rescheduled: 'bg-blue-500',
  completed: 'bg-slate-400',
  rejected: 'bg-red-400',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDayHeader(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return {
    dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
    dayNum: d.getDate(),
    monthStr: d.toLocaleDateString('en-US', { month: 'short' }),
    full: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  }
}

export default function VendorCalendar() {
  const leads = useMemo(
    () =>
      MOCK_LEADS.filter(
        (l) => l.vendor_id === VENDOR_ID && ['confirmed', 'pending', 'rescheduled'].includes(l.status)
      ).sort((a, b) => new Date(a.slot).getTime() - new Date(b.slot).getTime()),
    []
  )

  // Build 5-day week view starting Mon Apr 13, 2026
  const weekDays = ['2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17']
  const today = '2026-04-09'

  // Group leads by date
  const leadsByDate = useMemo(() => {
    const map: Record<string, Lead[]> = {}
    for (const day of weekDays) {
      map[day] = []
    }
    for (const lead of leads) {
      const dateKey = lead.slot.split('T')[0]
      if (map[dateKey]) {
        map[dateKey].push(lead)
      }
    }
    return map
  }, [leads])

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  }
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Calendar" description="Your upcoming appointments this week">
        <Badge variant="outline" className="text-xs">
          <CalendarIcon className="h-3 w-3 mr-1" />
          Apr 13 - 17, 2026
        </Badge>
      </PageHeader>

      {/* 5-Day Week Header */}
      <motion.div variants={item}>
        <div className="grid grid-cols-5 gap-2">
          {weekDays.map((day) => {
            const { dayName, dayNum } = fmtDayHeader(day)
            const hasAppts = (leadsByDate[day] || []).length > 0
            return (
              <div
                key={day}
                className={cn(
                  'flex flex-col items-center rounded-xl py-3 transition',
                  day === today
                    ? 'bg-primary text-primary-foreground'
                    : hasAppts
                      ? 'bg-muted/60'
                      : 'bg-muted/30'
                )}
              >
                <span className="text-xs font-medium uppercase">{dayName}</span>
                <span className="text-lg font-bold font-heading mt-0.5">{dayNum}</span>
                {hasAppts && (
                  <div className="flex gap-0.5 mt-1">
                    {(leadsByDate[day] || []).map((l) => (
                      <span key={l.id} className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[l.status])} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Appointments List */}
      {leads.length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title="No upcoming appointments"
          description="Confirmed and pending appointments will appear here."
        />
      ) : (
        <div className="space-y-3">
          {weekDays.map((day) => {
            const dayLeads = leadsByDate[day] || []
            if (dayLeads.length === 0) return null
            const { full } = fmtDayHeader(day)
            return (
              <motion.div key={day} variants={item} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground px-1">{full}</h3>
                {dayLeads.map((lead) => (
                  <Card
                    key={lead.id}
                    className={cn(
                      'rounded-xl shadow-sm hover:shadow-md transition border-l-4',
                      STATUS_COLORS[lead.status]
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-bold">{fmtTime(lead.slot)}</span>
                            <StatusBadge status={lead.status} />
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">{lead.homeowner_name}</span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate pl-6">{lead.project}</p>
                          <div className="flex items-center gap-2 pl-6">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs text-muted-foreground truncate">{lead.address}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(lead.value)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{lead.id}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
