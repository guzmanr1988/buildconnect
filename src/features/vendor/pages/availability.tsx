// Vendor Availability tab — task_791 item (3) of the vendor-availability
// go-live blocker (see [task_1788185609456_791]). Replaces the frontend
// mock generator src/lib/mock-data.ts generateAvailableSlots() that
// manufactured today+3..today+14 in the browser for every homeowner.
//
// This page lets a contractor set:
//   1. RECURRING WEEKLY HOURS — one time-window per day-of-week (v1). The
//      migration (129_vendor_availability.sql) supports multiple windows
//      per DOW ("9-12, 14-17"); this v1 form models one window per DOW
//      because that's the shape 99% of contractors will use, and adding
//      the multi-window UI later is a pure additive follow-up. When a
//      contractor already has 2+ rows on the same DOW server-side (via
//      admin or later UI), this form shows the FIRST row and disables
//      edit on that DOW with a note pointing to support — never silently
//      collapses the extras.
//   2. TIME OFF / EXCEPTIONS — whole-day date-range unavailability
//      (holidays, PTO, sick). Intra-day partial exceptions
//      (vendor_schedule_exception.start_minute/end_minute) supported by
//      schema but out of scope for v1 form; admin-managed for now.
//   3. PREFERENCES — profiles.timezone (IANA zone, contractor's local
//      interpretation zone for the start_minute/end_minute values above)
//      + default_slot_length_min (used server-side when a schedule row
//      omits slot length — the row-level value still overrides).
//
// ISO 1-7 DOW convention (migration 129 Q2 kratos ruling): DB stores
// day_of_week 1..7 where 1=Mon..7=Sun (ISO 8601). JavaScript Date.getDay
// returns 0..6 where 0=Sunday. The conversion boundary is EXACTLY ONE
// call site in this file (isoDowFromLabel below); any unconverted JS
// value hitting the DB will fail the CHECK constraint LOUD instead of
// silently shifting every day by one under a 0..6 scheme.
//
// SLOT-LENGTH VALUES: migration 129 CHECK restricts to (15, 30, 60, 90,
// 120). The dropdown here mirrors that set exactly; a new value goes in
// the migration first, not this form.
//
// The homeowner-facing consumer (booking-calendar.tsx) reads the
// SECURITY DEFINER function vendor_availability_slots(vendor_id, from,
// to) which materializes this schedule minus exceptions minus booked
// appointments into concrete slots. This form writes the inputs to that
// function; it does not materialize slots itself.
//
// GATE: migration 129 APPLIED on BC prod (llybxugitrbgybplgpsi) —
// hephaestus 9iohx confirmation with prod pg_proc read of
// reap_expired_holds(p_vendor_id uuid) RETURNS void SECURITY DEFINER
// and vendor_availability_slots(p_vendor_id uuid, p_from_date date,
// p_to_date date) RETURNS TABLE(slot_start_at timestamptz, slot_end_at
// timestamptz) STABLE SECURITY DEFINER. Item-3 (this form) + item-4
// (booking-calendar reap+INSERT) + item-5 (mock delete + read rewires)
// ship together in ONE PR per kratos b2ct6 ruling — the earlier
// two-PR-split spec was CONDITIONAL on item-4 being gated; the gate
// lifted so the coherence-in-prod argument wins over blast-radius-per-
// PR (splitting would ship real reads + mock writes as an intermediate
// live state on BC where merge=publish).

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Clock, Calendar as CalendarIcon, Trash2, Plus, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ─── DOW convention: ISO 1..7 (Mon..Sun), JS Date.getDay is 0..6 (Sun..Sat)
// This array indexes 1..7 = Mon..Sun to match the DB column exactly.
const DOW_LABELS: readonly { iso: number; label: string; short: string }[] = [
  { iso: 1, label: 'Monday',    short: 'Mon' },
  { iso: 2, label: 'Tuesday',   short: 'Tue' },
  { iso: 3, label: 'Wednesday', short: 'Wed' },
  { iso: 4, label: 'Thursday',  short: 'Thu' },
  { iso: 5, label: 'Friday',    short: 'Fri' },
  { iso: 6, label: 'Saturday',  short: 'Sat' },
  { iso: 7, label: 'Sunday',    short: 'Sun' },
]

// Migration-129 CHECK: slot_length_min in (15, 30, 60, 90, 120).
const SLOT_LENGTH_OPTIONS = [15, 30, 60, 90, 120] as const

type VendorScheduleRow = {
  id: string
  vendor_id: string
  day_of_week: number
  start_minute: number
  end_minute: number
  slot_length_min: number
  effective_from: string | null
  effective_until: string | null
}

type VendorScheduleExceptionRow = {
  id: string
  vendor_id: string
  starts_on: string
  ends_on: string
  start_minute: number | null
  end_minute: number | null
  reason: string | null
}

type ProfilePrefs = {
  timezone: string | null
  default_slot_length_min: number | null
}

// Form model for the weekly grid — one row per DOW. `enabled=false` means
// "day off"; DB representation is simply the absence of a row for that DOW.
type WeeklyFormRow = {
  iso: number
  enabled: boolean
  startHHMM: string  // 'HH:MM' 24h
  endHHMM: string    // 'HH:MM' 24h
  slotLengthMin: number
  // Set true when the server has >=2 rows on this DOW; we can't safely
  // represent multi-window with this v1 form so we display first + disable.
  disabledMultiWindow: boolean
  serverRowId: string | null
}

function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10))
  if (isNaN(h) || isNaN(m)) return 0
  return h * 60 + m
}

function hhmmFromMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Best-effort IANA zone list. Modern browsers expose
// Intl.supportedValuesOf('timeZone'); fallback is a small curated US list
// good enough for BuildConnect's SoFla contractor base.
function useIanaTimeZones(): string[] {
  return useMemo(() => {
    try {
      const g = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      if (typeof g.supportedValuesOf === 'function') {
        return g.supportedValuesOf('timeZone')
      }
    } catch {
      /* fall through */
    }
    return [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Anchorage',
      'Pacific/Honolulu',
    ]
  }, [])
}

function initialWeeklyForm(): WeeklyFormRow[] {
  // Reasonable default: Mon-Fri 9-5, 60 min slots, weekends off. Contractor
  // edits from here rather than a blank grid — most will keep something
  // close to this.
  return DOW_LABELS.map(({ iso }) => ({
    iso,
    enabled: iso >= 1 && iso <= 5,
    startHHMM: '09:00',
    endHHMM: '17:00',
    slotLengthMin: 60,
    disabledMultiWindow: false,
    serverRowId: null,
  }))
}

// Server-rows → form: pick first row per DOW; flag disabledMultiWindow if
// more than one row lives on the same DOW. This is the SAFE-COLLAPSE point
// kratos j1fzy-flavor rule: never silently drop server data the UI can't
// represent — surface the fact and refuse to overwrite.
function serverToForm(rows: VendorScheduleRow[]): WeeklyFormRow[] {
  const byDow = new Map<number, VendorScheduleRow[]>()
  for (const r of rows) {
    const list = byDow.get(r.day_of_week) ?? []
    list.push(r)
    byDow.set(r.day_of_week, list)
  }
  return DOW_LABELS.map(({ iso }) => {
    const list = byDow.get(iso) ?? []
    if (list.length === 0) {
      return {
        iso,
        enabled: false,
        startHHMM: '09:00',
        endHHMM: '17:00',
        slotLengthMin: 60,
        disabledMultiWindow: false,
        serverRowId: null,
      }
    }
    const first = list[0]
    return {
      iso,
      enabled: true,
      startHHMM: hhmmFromMinutes(first.start_minute),
      endHHMM: hhmmFromMinutes(first.end_minute),
      slotLengthMin: first.slot_length_min,
      disabledMultiWindow: list.length > 1,
      serverRowId: first.id,
    }
  })
}

export default function VendorAvailabilityPage() {
  const user = useAuthStore((s) => s.session?.user ?? null)
  const vendorId = user?.id ?? null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weekly, setWeekly] = useState<WeeklyFormRow[]>(initialWeeklyForm())
  const [exceptions, setExceptions] = useState<VendorScheduleExceptionRow[]>([])
  const [prefs, setPrefs] = useState<ProfilePrefs>({ timezone: null, default_slot_length_min: null })

  // Add-exception form draft
  const [newExStart, setNewExStart] = useState('')
  const [newExEnd, setNewExEnd] = useState('')
  const [newExReason, setNewExReason] = useState('')

  const timeZones = useIanaTimeZones()

  useEffect(() => {
    if (!vendorId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const [scheduleRes, exceptionRes, profileRes] = await Promise.all([
        supabase
          .from('vendor_schedule')
          .select('id, vendor_id, day_of_week, start_minute, end_minute, slot_length_min, effective_from, effective_until')
          .eq('vendor_id', vendorId),
        supabase
          .from('vendor_schedule_exception')
          .select('id, vendor_id, starts_on, ends_on, start_minute, end_minute, reason')
          .eq('vendor_id', vendorId)
          .order('starts_on', { ascending: true }),
        supabase
          .from('profiles')
          .select('timezone, default_slot_length_min')
          .eq('id', vendorId)
          .maybeSingle(),
      ])
      if (cancelled) return
      if (scheduleRes.error) {
        setError(scheduleRes.error.message)
        setLoading(false)
        return
      }
      if (exceptionRes.error) {
        setError(exceptionRes.error.message)
        setLoading(false)
        return
      }
      if (profileRes.error) {
        setError(profileRes.error.message)
        setLoading(false)
        return
      }
      const schedRows = (scheduleRes.data as VendorScheduleRow[] | null) ?? []
      // If the contractor has any server rows, mirror them; else keep the
      // sensible defaults from initialWeeklyForm.
      setWeekly(schedRows.length > 0 ? serverToForm(schedRows) : initialWeeklyForm())
      setExceptions((exceptionRes.data as VendorScheduleExceptionRow[] | null) ?? [])
      const p = profileRes.data as ProfilePrefs | null
      setPrefs({
        timezone: p?.timezone ?? null,
        default_slot_length_min: p?.default_slot_length_min ?? null,
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [vendorId])

  async function handleSaveWeekly() {
    if (!vendorId) return
    // Validate: enabled rows must have end > start; disabled rows get
    // DELETE'd server-side (row absent = "off" per DB shape).
    for (const w of weekly) {
      if (!w.enabled) continue
      const s = minutesFromHHMM(w.startHHMM)
      const e = minutesFromHHMM(w.endHHMM)
      if (!(e > s)) {
        toast.error(`${DOW_LABELS.find((d) => d.iso === w.iso)?.label}: end time must be after start time.`)
        return
      }
      if (w.disabledMultiWindow) {
        // Should be impossible to reach — UI disables the fields. Guard.
        toast.error('Multiple existing windows on this day; contact support to edit.')
        return
      }
    }
    setSaving(true)
    // Strategy: full replace-per-DOW-set. Delete any existing rows for
    // this vendor that this form OWNS (the DOWs we modeled = all 7), then
    // insert the enabled ones. Multi-window server rows on ANY DOW are
    // NOT owned by this form and MUST be preserved — that's what
    // disabledMultiWindow protects; if we saw >=2 rows on some DOW, we
    // must NOT delete THAT DOW's rows or we'd wipe server data the form
    // couldn't render. Detect and split: delete only DOWs where we hold
    // full authority (disabledMultiWindow=false).
    const ownedDows = weekly.filter((w) => !w.disabledMultiWindow).map((w) => w.iso)
    if (ownedDows.length > 0) {
      const delRes = await supabase
        .from('vendor_schedule')
        .delete()
        .eq('vendor_id', vendorId)
        .in('day_of_week', ownedDows)
      if (delRes.error) {
        setSaving(false)
        toast.error(delRes.error.message)
        return
      }
    }
    const toInsert = weekly
      .filter((w) => w.enabled && !w.disabledMultiWindow)
      .map((w) => ({
        vendor_id: vendorId,
        day_of_week: w.iso,
        start_minute: minutesFromHHMM(w.startHHMM),
        end_minute: minutesFromHHMM(w.endHHMM),
        slot_length_min: w.slotLengthMin,
      }))
    if (toInsert.length > 0) {
      const insRes = await supabase.from('vendor_schedule').insert(toInsert)
      if (insRes.error) {
        setSaving(false)
        toast.error(insRes.error.message)
        return
      }
    }
    // Also persist prefs (timezone + default_slot_length_min) in the same
    // save action — a single button matches the mental model "save my
    // availability" rather than making the user hit two saves.
    const upRes = await supabase
      .from('profiles')
      .update({
        timezone: prefs.timezone,
        default_slot_length_min: prefs.default_slot_length_min,
      })
      .eq('id', vendorId)
    if (upRes.error) {
      setSaving(false)
      toast.error(upRes.error.message)
      return
    }
    setSaving(false)
    toast.success('Availability saved.')
  }

  async function handleAddException() {
    if (!vendorId) return
    if (!newExStart || !newExEnd) {
      toast.error('Both start and end dates are required.')
      return
    }
    if (newExEnd < newExStart) {
      toast.error('End date must be on or after start date.')
      return
    }
    const insRes = await supabase.from('vendor_schedule_exception').insert({
      vendor_id: vendorId,
      starts_on: newExStart,
      ends_on: newExEnd,
      start_minute: null,
      end_minute: null,
      reason: newExReason.trim() === '' ? null : newExReason.trim(),
    })
    if (insRes.error) {
      toast.error(insRes.error.message)
      return
    }
    // Refetch exceptions to include the new row (server assigns id + created_at).
    const listRes = await supabase
      .from('vendor_schedule_exception')
      .select('id, vendor_id, starts_on, ends_on, start_minute, end_minute, reason')
      .eq('vendor_id', vendorId)
      .order('starts_on', { ascending: true })
    if (!listRes.error) {
      setExceptions((listRes.data as VendorScheduleExceptionRow[] | null) ?? [])
    }
    setNewExStart('')
    setNewExEnd('')
    setNewExReason('')
    toast.success('Time off added.')
  }

  async function handleDeleteException(id: string) {
    if (!vendorId) return
    const delRes = await supabase.from('vendor_schedule_exception').delete().eq('id', id)
    if (delRes.error) {
      toast.error(delRes.error.message)
      return
    }
    setExceptions((prev) => prev.filter((e) => e.id !== id))
    toast.success('Time off removed.')
  }

  if (!vendorId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="My Availability" description="Set the days and times you're available for site visits and appointments." />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Please sign in as a contractor to manage your availability.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="My Availability" description="Set the days and times you're available for site visits and appointments." />
        <Card>
          <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your availability…
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="My Availability" description="Set the days and times you're available for site visits and appointments." />
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Couldn't load your availability: {error}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Availability"
        description="Set the days and times you're available for site visits and appointments. Homeowners only see slots that match your recurring hours minus your time off minus already-booked appointments."
      />

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" /> Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tz">Time zone</Label>
            <select
              id="tz"
              value={prefs.timezone ?? ''}
              onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value === '' ? null : e.target.value }))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">(Use default)</option>
              {timeZones.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Your recurring hours are interpreted in this time zone. Leave as (Use default) to inherit BuildConnect's business zone.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dsl">Default slot length</Label>
            <select
              id="dsl"
              value={prefs.default_slot_length_min ?? ''}
              onChange={(e) => setPrefs((p) => ({
                ...p,
                default_slot_length_min: e.target.value === '' ? null : parseInt(e.target.value, 10),
              }))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">(No default)</option>
              {SLOT_LENGTH_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} minutes</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Used when a specific day doesn't set its own slot length. Per-day slot length always wins.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Weekly hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-4 w-4 text-primary" /> Recurring weekly hours
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {weekly.map((w, i) => {
            const dowLabel = DOW_LABELS.find((d) => d.iso === w.iso)!
            return (
              <div
                key={w.iso}
                className={cn(
                  'flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center',
                  !w.enabled && 'bg-muted/30',
                )}
              >
                <div className="flex items-center gap-3 sm:min-w-[160px]">
                  <input
                    id={`enabled-${w.iso}`}
                    type="checkbox"
                    checked={w.enabled}
                    disabled={w.disabledMultiWindow}
                    onChange={(e) => {
                      const enabled = e.target.checked
                      setWeekly((prev) => prev.map((r, idx) => (idx === i ? { ...r, enabled } : r)))
                    }}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor={`enabled-${w.iso}`} className="text-sm font-medium">
                    {dowLabel.label}
                  </Label>
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`start-${w.iso}`} className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      id={`start-${w.iso}`}
                      type="time"
                      value={w.startHHMM}
                      disabled={!w.enabled || w.disabledMultiWindow}
                      onChange={(e) => {
                        const v = e.target.value
                        setWeekly((prev) => prev.map((r, idx) => (idx === i ? { ...r, startHHMM: v } : r)))
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`end-${w.iso}`} className="text-xs text-muted-foreground">End</Label>
                    <Input
                      id={`end-${w.iso}`}
                      type="time"
                      value={w.endHHMM}
                      disabled={!w.enabled || w.disabledMultiWindow}
                      onChange={(e) => {
                        const v = e.target.value
                        setWeekly((prev) => prev.map((r, idx) => (idx === i ? { ...r, endHHMM: v } : r)))
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`slot-${w.iso}`} className="text-xs text-muted-foreground">Slot length</Label>
                    <select
                      id={`slot-${w.iso}`}
                      value={w.slotLengthMin}
                      disabled={!w.enabled || w.disabledMultiWindow}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        setWeekly((prev) => prev.map((r, idx) => (idx === i ? { ...r, slotLengthMin: v } : r)))
                      }}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {SLOT_LENGTH_OPTIONS.map((n) => (
                        <option key={n} value={n}>{n} min</option>
                      ))}
                    </select>
                  </div>
                </div>
                {w.disabledMultiWindow && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Multiple windows on this day exist and can't be edited from this form yet. Contact support to change.
                  </p>
                )}
              </div>
            )
          })}
          <div className="flex justify-end">
            <Button onClick={handleSaveWeekly} disabled={saving} className="min-w-[140px]">
              {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>) : 'Save changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Time off */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-4 w-4 text-primary" /> Time off
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="ex-start" className="text-xs text-muted-foreground">Start date</Label>
              <Input id="ex-start" type="date" value={newExStart} onChange={(e) => setNewExStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ex-end" className="text-xs text-muted-foreground">End date</Label>
              <Input id="ex-end" type="date" value={newExEnd} onChange={(e) => setNewExEnd(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="ex-reason" className="text-xs text-muted-foreground">Reason (optional)</Label>
              <Input id="ex-reason" placeholder="Vacation, holiday, sick, etc." value={newExReason} onChange={(e) => setNewExReason(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleAddException} className="min-w-[140px]">
              <Plus className="mr-2 h-4 w-4" /> Add time off
            </Button>
          </div>
          {exceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming time off scheduled.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {exceptions.map((ex) => (
                <li key={ex.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {ex.starts_on === ex.ends_on ? ex.starts_on : `${ex.starts_on} → ${ex.ends_on}`}
                    </span>
                    {ex.reason && <span className="text-xs text-muted-foreground">{ex.reason}</span>}
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteException(ex.id)} aria-label="Remove time off">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
