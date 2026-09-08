// Homeowner booking calendar — task_791 item 4 (real INSERT via reap+
// hold) and item 5 (mock reads rewired to real RPC). Reads availability
// via SECURITY DEFINER function vendor_availability_slots(vendor_id,
// from_date, to_date) added in migration 129; on Confirm Booking calls
// reap_expired_holds(vendor_id) then INSERTs a homeowner_hold row into
// vendor_appointment. See migration 129 for the WRITE-side protocol and
// exclusion-constraint reasoning; the reap has to run BEFORE the INSERT
// or an expired hold in the table still holds its (starts_at, ends_at)
// slot in the overlap-exclusion index.
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Clock, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Hold TTL: gives the homeowner time to finish the confirm flow on
// /home/booking/confirmed before the hold expires and the slot becomes
// available again. Not user-configurable; 15 minutes matches a typical
// booking-confirmation flow duration.
const HOLD_TTL_MINUTES = 15

// Availability fetch window (days from today). Balances RPC cost vs
// UX for a homeowner flipping calendar months forward. Fetches once
// per contractor; re-fetch only on contractor change.
const FETCH_WINDOW_DAYS = 60

type BookingSlot = { starts_at: string; ends_at: string } // ISO timestamptz from RPC

// UTC-date substring for bucketing slots by calendar day. Vendor and
// homeowner in the same US region is the assumed case; a homeowner in
// a very different zone from a vendor's TZ could see slots grouped on
// the UTC day rather than the local day at midnight-edges. Multi-TZ
// display is a follow-up when the class of that mismatch shows up.
function isoDateOnly(iso: string): string {
  return iso.slice(0, 10)
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export function BookingCalendarPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.session?.user ?? null)
  const homeownerId = user?.id ?? null

  const [contractorId, setContractorId] = useState<string | null>(null)
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth())
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null)

  // Ship #213 — flow-guard. Homeowner must reach this page via the cart
  // → vendor-compare → book flow. Missing pending-item or selected-
  // contractor LS keys means the flow was skipped; route back to /home/
  // cart so it can re-enter cleanly.
  useEffect(() => {
    const hasPendingItem = !!localStorage.getItem('buildconnect-pending-item')
    const contractor = localStorage.getItem('buildconnect-selected-contractor')
    if (!hasPendingItem || !contractor) {
      if ((import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false') {
        // eslint-disable-next-line no-console
        console.log('[#212 leads-diag] booking-calendar GUARD redirect', {
          hasPendingItem,
          hasContractor: !!contractor,
        })
      }
      toast.info('Pick a contractor first — then choose a date.')
      navigate('/home/cart', { replace: true })
      return
    }
    setContractorId(contractor)
  }, [navigate])

  // Fetch real availability from the SECURITY DEFINER RPC. Range =
  // today .. today + FETCH_WINDOW_DAYS. Slots come back ORDER BY
  // slot_start_at ASC per migration 129 vendor_availability_slots
  // definition, so slots[0] is the earliest without a min() reduce.
  useEffect(() => {
    if (!contractorId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const fromDate = new Date()
      const toDate = new Date()
      toDate.setDate(fromDate.getDate() + FETCH_WINDOW_DAYS)
      const fromStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`
      const toStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`
      const res = await supabase.rpc('vendor_availability_slots', {
        p_vendor_id: contractorId,
        p_from_date: fromStr,
        p_to_date: toStr,
      })
      if (cancelled) return
      if (res.error) {
        toast.error(`Couldn't load availability: ${res.error.message}`)
        setSlots([])
        setLoading(false)
        return
      }
      const rows = (res.data as { slot_start_at: string; slot_end_at: string }[] | null) ?? []
      setSlots(rows.map((r) => ({ starts_at: r.slot_start_at, ends_at: r.slot_end_at })))
      // task_643 — open the calendar on a month that actually contains
      // selectable days. Empty slots array is possible (vendor has no
      // schedule set yet, or all slots blocked by exceptions/bookings);
      // in that case fall through to the default (today).
      if (rows.length > 0) {
        const first = new Date(rows[0].slot_start_at)
        setCurrentMonth(first.getMonth())
        setCurrentYear(first.getFullYear())
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [contractorId])

  // Slots keyed by UTC date substring. Memo prevents Map rebuild on
  // every render (calendar cell iteration hits this every day cell).
  const slotsByDate = useMemo(() => {
    const m = new Map<string, BookingSlot[]>()
    for (const s of slots) {
      const key = isoDateOnly(s.starts_at)
      const list = m.get(key) ?? []
      list.push(s)
      m.set(key, list)
    }
    return m
  }, [slots])

  const availableDates = useMemo(() => new Set(slotsByDate.keys()), [slotsByDate])
  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
  const selectedDaySlots = selectedDate ? (slotsByDate.get(selectedDate) ?? []) : []

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  async function handleConfirmBooking() {
    if (!homeownerId || !contractorId || !selectedSlot) return
    setBooking(true)
    // Reap the vendor's expired homeowner_hold rows first so our INSERT
    // doesn't collide with a dead reservation still holding the (starts,
    // ends) slot in the overlap-exclusion index. Migration 129 comment:
    // "Callers running the hold-insert path invoke this in the same txn
    // as the new hold INSERT." We can't open a txn from the client so
    // this is two sequential HTTP calls — the exclusion constraint
    // catches any legitimate collision from a different homeowner
    // racing us for the same slot in the ~ms window between calls.
    const reapRes = await supabase.rpc('reap_expired_holds', {
      p_vendor_id: contractorId,
    })
    if (reapRes.error) {
      setBooking(false)
      toast.error(`Couldn't reserve slot: ${reapRes.error.message}`)
      return
    }
    const holdExpiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60 * 1000).toISOString()
    const insRes = await supabase.from('vendor_appointment').insert({
      vendor_id: contractorId,
      homeowner_id: homeownerId,
      kind: 'homeowner_hold',
      starts_at: selectedSlot.starts_at,
      ends_at: selectedSlot.ends_at,
      hold_expires_at: holdExpiresAt,
    })
    if (insRes.error) {
      setBooking(false)
      // 23P01 = exclusion_violation. Someone else's hold or booking
      // won the race for this slot in the ms between our reap and our
      // insert (or the slot was never truly free — the availability
      // RPC excludes overlaps but a same-second race can bypass that).
      if (insRes.error.code === '23P01') {
        toast.error('That slot was just taken. Please pick another time.')
      } else {
        toast.error(`Couldn't reserve slot: ${insRes.error.message}`)
      }
      return
    }
    // Ship #335 — canonical ISO date + 24h time for the downstream
    // /home/booking/confirmed summary card (matches pre-real-RPC shape
    // so no changes needed in confirmation-page rendering).
    const startsAt = new Date(selectedSlot.starts_at)
    const dateStr = `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}-${String(startsAt.getDate()).padStart(2, '0')}`
    const timeStr = `${String(startsAt.getHours()).padStart(2, '0')}:${String(startsAt.getMinutes()).padStart(2, '0')}`
    localStorage.setItem('buildconnect-selected-booking', JSON.stringify({
      date: dateStr,
      time: timeStr,
    }))
    setBooking(false)
    navigate('/home/booking/confirmed')
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

      {loading ? (
        <Card className="flex items-center justify-center p-12">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading availability…</span>
        </Card>
      ) : (
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
                      setSelectedSlot(null)
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
                      setSelectedSlot(null)
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
                        setSelectedSlot(null)
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
            {selectedDate && selectedDaySlots.length > 0 ? (
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
                      {selectedDaySlots.map((slot) => (
                        <button
                          key={slot.starts_at}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={cn(
                            'inline-flex min-h-[44px] min-w-[90px] items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-150',
                            selectedSlot?.starts_at === slot.starts_at
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                              : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted'
                          )}
                        >
                          {formatTime(slot.starts_at)}
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
                    {selectedDate ? 'No open times on this day.' : 'Select an available date to view time slots'}
                  </p>
                </div>
              </Card>
            )}

            {/* Booking summary */}
            {selectedDate && selectedSlot && (
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
                        <span className="font-medium text-foreground">{formatTime(selectedSlot.starts_at)}</span>
                      </div>
                    </div>
                    <Button
                      size="lg"
                      className="mt-2 h-11 w-full text-sm font-medium"
                      disabled={booking}
                      onClick={handleConfirmBooking}
                    >
                      {booking ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reserving…</>
                      ) : 'Confirm Booking'}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
