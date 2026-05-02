import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MOCK_AVAILABLE_SLOTS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export function BookingCalendarPage() {
  const navigate = useNavigate()
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)

  // Ship #213 — flow-guard. The booking flow requires the pending-item
  // + selected-contractor LS keys to be populated BEFORE this page is
  // reached (set by /home/cart handleSendToContractor and /home/vendor-
  // compare respectively). If either is missing, the user skipped a
  // step — route them back to /home/cart with a toast so the flow can
  // re-enter cleanly instead of silently completing a bookings-without-
  // contractor state that fails at /home/booking/confirmed.
  useEffect(() => {
    const hasPendingItem = !!localStorage.getItem('buildconnect-pending-item')
    const hasContractor = !!localStorage.getItem('buildconnect-selected-contractor')
    if (!hasPendingItem || !hasContractor) {
      if ((import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false') {
        // eslint-disable-next-line no-console
        console.log('[#212 leads-diag] booking-calendar GUARD redirect', {
          hasPendingItem,
          hasContractor,
        })
      }
      toast.info('Pick a contractor first — then choose a date.')
      navigate('/home/cart', { replace: true })
    }
  }, [navigate])

  const availableDates = new Set(MOCK_AVAILABLE_SLOTS.map((s) => s.date))
  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth)

  const selectedSlot = MOCK_AVAILABLE_SLOTS.find((s) => s.date === selectedDate)

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  function formatTime(time: string) {
    const [h, m] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'PM' : 'AM'
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h
    return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Book a Site Visit
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a date and time that works for you.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Calendar */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                {MONTHS[currentMonth]} {currentYear}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1) }
                    else setCurrentMonth((m) => m - 1)
                    setSelectedDate(null)
                  }}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1) }
                    else setCurrentMonth((m) => m + 1)
                    setSelectedDate(null)
                  }}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map((day) => (
                <div key={day} className="py-1 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for offset */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const isAvailable = availableDates.has(dateStr)
                const isSelected = selectedDate === dateStr

                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => {
                      setSelectedDate(dateStr)
                      setSelectedTime(null)
                    }}
                    className={cn(
                      'flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium transition-all duration-150',
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : isAvailable
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : 'text-muted-foreground/40 cursor-not-allowed'
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Time slots + summary */}
        <div className="flex flex-col gap-4">
          {selectedDate && selectedSlot ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Available Times
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {formatDate(selectedDate)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedSlot.times.map((time) => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setSelectedTime(time)}
                        className={cn(
                          'inline-flex min-h-[44px] min-w-[90px] items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-150',
                          selectedTime === time
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted'
                        )}
                      >
                        {formatTime(time)}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <Card className="flex items-center justify-center p-12">
              <div className="text-center">
                <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Select an available date to view time slots
                </p>
              </div>
            </Card>
          )}

          {/* Booking summary */}
          {selectedDate && selectedTime && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="border-primary/20">
                <CardContent className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold font-heading text-foreground">
                    Booking Summary
                  </h3>
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium text-foreground">{formatDate(selectedDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time</span>
                      <span className="font-medium text-foreground">{formatTime(selectedTime)}</span>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="mt-2 h-11 w-full text-sm font-medium"
                    onClick={() => {
                      // Ship #335 — write canonical ISO date + 24h time per
                      // #103 format-SoT discipline. Pre-#335 wrote
                      // formatDate(selectedDate) ('Tuesday, April 28, 2026')
                      // + formatTime(selectedTime) ('2:30 PM') as the LS
                      // values, which propagated to sentProject.booking.date.
                      // Vendor /vendor/calendar synthesized slot as
                      // `${booking.date}T${booking.time}` → malformed-ISO
                      // → dateKey didn't match grid's ISO lookup → leads
                      // never appeared on the calendar grid.
                      // Post-#335: store canonical 'YYYY-MM-DD' + 'HH:MM'
                      // (24h); presentation-layer formats at render-time
                      // (booking-confirmation summary card formats via
                      // toLocaleDateString + AM/PM converter).
                      localStorage.setItem('buildconnect-selected-booking', JSON.stringify({
                        date: selectedDate,
                        time: selectedTime,
                      }))
                      navigate('/home/booking/confirmed')
                    }}
                  >
                    Confirm Booking
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
