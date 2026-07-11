// MonthCalendarGrid — generic 6-row Sun-start month grid extracted to
// be reusable across admin/vendor/employee calendars. The vendor
// calendar at features/vendor/pages/calendar.tsx still owns its own
// inlined grid in this arc (extraction is opt-in, not a vendor
// refactor — per kratos pin-75 scope).
//
// Timezone: callers supply a `timeZone` (default America/New_York for
// BuildConnect — Florida business tz) and pre-bucketed `eventsByDay`
// keyed by 'YYYY-MM-DD' local-day strings. The grid never touches raw
// ISO timestamps directly; bucketing happens upstream so the same
// derived effective-visit-time used for the window filter is also
// used for the cell placement (FLAG-B consistency).

import React from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface MonthCalendarDay<E> {
  iso: string
  year: number
  month: number
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  events: E[]
}

export interface MonthCalendarGridProps<E> {
  year: number
  month: number
  eventsByDay: Record<string, E[]>
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onSelectDate?: (day: MonthCalendarDay<E>) => void
  renderEvent: (event: E, day: MonthCalendarDay<E>) => React.ReactNode
  renderEmptyDay?: (day: MonthCalendarDay<E>) => React.ReactNode
  timeZone?: string
  className?: string
  toolbarRight?: React.ReactNode
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoDayKey(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`
}

function todayKey(timeZone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone })
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

function firstWeekdayOfMonth(year: number, month0: number): number {
  return new Date(year, month0, 1).getDay()
}

export function MonthCalendarGrid<E>(props: MonthCalendarGridProps<E>) {
  const {
    year,
    month,
    eventsByDay,
    onPrevMonth,
    onNextMonth,
    onToday,
    onSelectDate,
    renderEvent,
    renderEmptyDay,
    timeZone = 'America/New_York',
    className,
    toolbarRight,
  } = props

  const totalDays = daysInMonth(year, month)
  const startWeekday = firstWeekdayOfMonth(year, month)
  const prevMonthYear = month === 0 ? year - 1 : year
  const prevMonth0 = month === 0 ? 11 : month - 1
  const nextMonthYear = month === 11 ? year + 1 : year
  const nextMonth0 = month === 11 ? 0 : month + 1
  const prevTotal = daysInMonth(prevMonthYear, prevMonth0)
  const today = todayKey(timeZone)

  // Always render 42 cells (6 rows × 7 days) so the grid height is
  // stable across months.
  const cells: MonthCalendarDay<E>[] = []
  for (let i = 0; i < 42; i++) {
    let cellYear = year
    let cellMonth0 = month
    let cellDay: number
    let isCurrentMonth = true
    if (i < startWeekday) {
      cellYear = prevMonthYear
      cellMonth0 = prevMonth0
      cellDay = prevTotal - (startWeekday - 1 - i)
      isCurrentMonth = false
    } else if (i >= startWeekday + totalDays) {
      cellYear = nextMonthYear
      cellMonth0 = nextMonth0
      cellDay = i - (startWeekday + totalDays) + 1
      isCurrentMonth = false
    } else {
      cellDay = i - startWeekday + 1
    }
    const iso = isoDayKey(cellYear, cellMonth0, cellDay)
    cells.push({
      iso,
      year: cellYear,
      month: cellMonth0,
      day: cellDay,
      isCurrentMonth,
      isToday: iso === today,
      events: eventsByDay[iso] ?? [],
    })
  }

  return (
    <div className={cn('rounded-2xl border bg-card', className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPrevMonth}
            aria-label="Previous month"
            data-testid="month-cal-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[10rem] text-center text-sm font-semibold" data-testid="month-cal-title">
            {MONTH_NAMES[month]} {year}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNextMonth}
            aria-label="Next month"
            data-testid="month-cal-next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToday}
            data-testid="month-cal-today"
          >
            Today
          </Button>
        </div>
        {toolbarRight}
      </div>
      <div className="grid grid-cols-7 border-b bg-muted/30 text-center text-xs font-medium text-muted-foreground">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const cellClickable = !!onSelectDate
          return (
            <motion.div
              key={`${cell.iso}-${idx}`}
              className={cn(
                'min-h-[6rem] border-b border-r p-1.5 text-left',
                idx % 7 === 6 && 'border-r-0',
                idx >= 35 && 'border-b-0',
                cell.isCurrentMonth ? 'bg-card' : 'bg-muted/20',
                cellClickable && 'cursor-pointer hover:bg-accent/40',
              )}
              onClick={cellClickable ? () => onSelectDate?.(cell) : undefined}
              data-testid="month-cal-cell"
              data-iso={cell.iso}
              data-current-month={cell.isCurrentMonth}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                    cell.isToday
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : cell.isCurrentMonth
                        ? 'text-foreground'
                        : 'text-muted-foreground',
                  )}
                >
                  {cell.day}
                </span>
              </div>
              <div className="space-y-1">
                {cell.events.length === 0
                  ? renderEmptyDay?.(cell) ?? null
                  : cell.events.map((evt, eidx) => (
                      <React.Fragment key={eidx}>
                        {renderEvent(evt, cell)}
                      </React.Fragment>
                    ))}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

export const __MONTH_CAL_TZ_DEFAULT__ = 'America/New_York'
