// Admin Rep-Visit Calendar — pin-75 surface.
//
// Lives at /admin/rep-requests/calendar (children-nav under Rep Requests).
// Plots BOOKED rep visits (appointment_status='accepted') in a single-
// timezone (America/New_York) month grid + agenda list. Click an event
// → opens that rep_request detail at /admin/rep-requests/:id.
//
// Pin-75 SCOPE per kratos 2026-06-30: admin-only, no employee gating,
// no assign-from-calendar. The page does NOT touch admin_employee
// parity (Rod-final 2026-06-25 stands). Pin-76 is fully deferred.
//
// Substrate dependency: mig 108 adds the appointment_status /
// requested_visit_at / proposed_visit_at columns. Until landed +
// accept-flow populates them, the calendar renders empty (no rows
// match accepted-only filter).

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import { Calendar as CalendarIcon, ChevronDown, ChevronUp } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import {
  MonthCalendarGrid,
  type MonthCalendarDay,
} from '@/components/calendar/month-calendar-grid'
import {
  useRepVisitsForMonth,
  type RepVisitEvent,
  BUSINESS_TZ,
} from '@/hooks/use-rep-visits-for-month'
import {
  STATUS_LABELS,
  STATUS_PILL_CLASSES,
} from '@/features/admin/rep-requests/rep-request-contract'
import { cn } from '@/lib/utils'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
} satisfies Variants

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: BUSINESS_TZ,
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatAgendaDay(iso: string): string {
  // iso is a 'YYYY-MM-DD' local-day key; build a Date at noon-UTC to
  // dodge tz edge cases when formatting the day label.
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default function AdminRepVisitCalendarPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [agendaOpen, setAgendaOpen] = useState(true)

  const { eventsByDay, events, isLoading, error } = useRepVisitsForMonth({ year, month })

  const handlePrev = () => {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }
  const handleNext = () => {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }
  const handleToday = () => {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
  }

  const onEventClick = (event: RepVisitEvent) => {
    navigate(`/admin/rep-requests/${event.id}`)
  }

  const agendaDays = useMemo(() => Object.keys(eventsByDay).sort(), [eventsByDay])

  const renderEvent = (event: RepVisitEvent, _day: MonthCalendarDay<RepVisitEvent>) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onEventClick(event)
      }}
      className={cn(
        'w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-tight ring-1 ring-inset transition-colors hover:brightness-95',
        STATUS_PILL_CLASSES[event.status],
      )}
      data-testid="rep-visit-event"
      data-rep-request-id={event.id}
      title={`${formatEventTime(event.effectiveVisitAt)} — ${event.homeownerName}`}
    >
      <span className="font-medium">{formatEventTime(event.effectiveVisitAt)}</span>
      <span className="ml-1 opacity-80">{event.homeownerName}</span>
    </button>
  )

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="space-y-6"
      data-testid="admin-rep-visit-calendar"
    >
      <PageHeader
        title="Visit Calendar"
        description="Booked rep visits across all requests. Click an event to open the request."
      />

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive" data-testid="rep-visit-cal-error">
            Failed to load visits: {error.message}
          </CardContent>
        </Card>
      )}

      <MonthCalendarGrid<RepVisitEvent>
        year={year}
        month={month}
        eventsByDay={eventsByDay}
        onPrevMonth={handlePrev}
        onNextMonth={handleNext}
        onToday={handleToday}
        renderEvent={renderEvent}
        timeZone={BUSINESS_TZ}
        toolbarRight={
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span data-testid="rep-visit-cal-tz">Times in ET</span>
            {isLoading && <span>Loading…</span>}
            <span data-testid="rep-visit-cal-count">
              {events.length} {events.length === 1 ? 'visit' : 'visits'} this month
            </span>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          <button
            type="button"
            onClick={() => setAgendaOpen((s) => !s)}
            className="flex w-full items-center justify-between text-sm font-semibold"
            data-testid="rep-visit-agenda-toggle"
          >
            <span className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Agenda — {events.length} {events.length === 1 ? 'visit' : 'visits'}
            </span>
            {agendaOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {agendaOpen && (
            <div className="mt-3" data-testid="rep-visit-agenda-body">
              {agendaDays.length === 0 ? (
                <EmptyState
                  icon={CalendarIcon}
                  title="No booked visits this month"
                  description="When a homeowner accepts a visit time, it'll appear here and on the calendar."
                />
              ) : (
                <ul className="space-y-3">
                  {agendaDays.map((dayKey) => {
                    const dayEvents = eventsByDay[dayKey]
                    return (
                      <li key={dayKey} className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {formatAgendaDay(dayKey)}
                        </div>
                        <ul className="space-y-1">
                          {dayEvents.map((event) => (
                            <li key={event.id}>
                              <button
                                type="button"
                                onClick={() => onEventClick(event)}
                                className="flex w-full items-center gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                                data-testid="rep-visit-agenda-item"
                                data-rep-request-id={event.id}
                              >
                                <span className="w-16 shrink-0 font-medium tabular-nums">
                                  {formatEventTime(event.effectiveVisitAt)}
                                </span>
                                <span className="truncate font-medium">{event.homeownerName}</span>
                                <span
                                  className={cn(
                                    'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                                    STATUS_PILL_CLASSES[event.status],
                                  )}
                                >
                                  {STATUS_LABELS[event.status]}
                                </span>
                                <Button type="button" variant="ghost" size="sm" className="ml-1 shrink-0 px-2">
                                  Open
                                </Button>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
