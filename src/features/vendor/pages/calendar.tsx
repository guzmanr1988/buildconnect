import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar as CalendarIcon, Clock, MapPin, User, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { MOCK_LEADS } from '@/lib/mock-data'
import { useProjectsStore } from '@/stores/projects-store'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'

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

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function VendorCalendar() {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const now = new Date()
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const confirmedProjectLeads: Lead[] = useMemo(() => sentProjects
    .filter((p) => p.status === 'approved')
    .map((p) => ({
      id: `L-${p.id.slice(0, 4).toUpperCase()}`,
      homeowner_id: 'ho-current',
      vendor_id: VENDOR_ID,
      homeowner_name: p.homeowner?.name || 'Customer',
      project: p.item.serviceName,
      status: 'confirmed' as const,
      value: 0,
      address: p.homeowner?.address || 'Pending site visit',
      phone: p.homeowner?.phone || '—',
      email: p.homeowner?.email || '—',
      sq_ft: 0,
      service_category: p.item.serviceId as any,
      permit_choice: false,
      financing: false,
      pack_items: p.item.selections,
      slot: p.booking?.date ? `${p.booking.date}T${p.booking.time || '09:00'}` : p.sentAt,
      received_at: p.sentAt,
    })), [sentProjects])

  const mockConfirmed = useMemo(
    () => MOCK_LEADS.filter(
      (l) => l.vendor_id === VENDOR_ID && ['confirmed', 'rescheduled'].includes(l.status)
    ),
    []
  )

  const leads = useMemo(
    () => [...confirmedProjectLeads, ...mockConfirmed]
      .sort((a, b) => new Date(a.slot).getTime() - new Date(b.slot).getTime()),
    [confirmedProjectLeads, mockConfirmed]
  )

  // Group leads by date string
  const leadsByDate = useMemo(() => {
    const map: Record<string, Lead[]> = {}
    for (const lead of leads) {
      const dateKey = lead.slot.split('T')[0]
      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(lead)
    }
    return map
  }, [leads])

  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
    setSelectedDate(null)
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
    setSelectedDate(null)
  }

  const selectedLeads = selectedDate ? (leadsByDate[selectedDate] || []) : []

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } },
  }
  const item = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.15, ease: 'easeOut' } },
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Calendar" description="Your scheduled appointments">
        <Badge variant="outline" className="text-xs">
          <CalendarIcon className="h-3 w-3 mr-1" />
          {leads.length} appointments
        </Badge>
      </PageHeader>

      {/* Calendar Grid */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-base font-bold font-heading">
                {MONTH_NAMES[currentMonth]} {currentYear}
              </h2>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8" aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before the 1st */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dayLeads = leadsByDate[dateStr] || []
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDate
                const hasAppts = dayLeads.length > 0

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={cn(
                      'aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all',
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : isToday
                          ? 'bg-primary/10 text-primary font-bold'
                          : hasAppts
                            ? 'bg-muted/60 hover:bg-muted'
                            : 'hover:bg-muted/40'
                    )}
                  >
                    <span className={cn('text-sm', hasAppts && !isSelected && 'font-semibold')}>{day}</span>
                    {hasAppts && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayLeads.slice(0, 3).map((l) => (
                          <span
                            key={l.id}
                            className={cn(
                              'h-1 w-1 rounded-full',
                              isSelected ? 'bg-white/70' : STATUS_DOT[l.status]
                            )}
                          />
                        ))}
                        {dayLeads.length > 3 && (
                          <span className={cn('text-[7px] leading-none', isSelected ? 'text-white/70' : 'text-muted-foreground')}>+</span>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Selected Day Appointments */}
      {selectedDate && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-semibold text-muted-foreground px-1">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>
          {selectedLeads.length === 0 ? (
            <Card className="rounded-xl shadow-sm">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No appointments on this day
              </CardContent>
            </Card>
          ) : (
            selectedLeads.map((lead) => (
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
                      <p className="text-xs text-muted-foreground">{lead.id}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </motion.div>
      )}

      {/* Show upcoming if no date selected */}
      {!selectedDate && leads.length === 0 && (
        <EmptyState
          icon={CalendarIcon}
          title="No upcoming appointments"
          description="Confirmed appointments will appear here."
        />
      )}
    </motion.div>
  )
}
