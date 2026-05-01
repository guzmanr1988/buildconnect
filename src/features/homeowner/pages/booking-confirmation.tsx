import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, FileText, ArrowRight, Home, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCartStore } from '@/stores/cart-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useAuthStore } from '@/stores/auth-store'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { getVendorPriceMap } from '@/lib/api/pricing'
import { getOptionMetadata, sqftToSquares } from '@/lib/option-metadata'
import { PRICE_LINE_ITEM_PRESETS } from '@/lib/price-line-item-presets'
import type { PriceLineItem } from '@/types'
import type { CartItem } from '@/stores/cart-store'

type BookingDetails = { service: string; vendor: string; date: string; time: string }
type ConfirmationState = 'loading' | 'success' | 'refreshed' | 'incomplete'

// Ship #335 — presentation-layer formatters. booking.date stored as
// canonical ISO 'YYYY-MM-DD'; booking.time as 24h 'HH:MM'. Display
// formats here at render-time per #103 SoT discipline.
function formatBookingDate(dateStr: string) {
  // Defensive: support both canonical ISO ('2026-04-28') and legacy
  // pre-#335 human-readable ('Tuesday, April 28, 2026') for back-compat
  // with persisted entries from before this ship.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr + 'T12:00:00' : dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatBookingTime(timeStr: string) {
  // Defensive: support canonical 24h 'HH:MM' AND legacy '2:30 PM'.
  if (/AM|PM/i.test(timeStr)) return timeStr
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr)
  if (!m) return timeStr
  const h = Number(m[1])
  const min = m[2]
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour12}:${min} ${suffix}`
}

// Ship #213 — refresh-window for post-send re-mount. If preconditions
// were already consumed by an earlier mount but a sentProject entry is
// fresh (< 5min old), we assume this is a browser refresh of a real
// successful confirmation, not a corrupted-flow fallback. Anything older
// than this is treated as stale and triggers the explicit error state.
const RECENT_SEND_WINDOW_MS = 5 * 60 * 1000

// Build computed roofing price-line-items from a vendor's Supabase catalog.
// Each selected material gets its own line ($X/square × squares, waste-included). Selected
// addons (gutters/soffit/fascia) get their own line ($X/lin ft × linFt).
// Other roofing lines (permit/tearoff/install) fall through to preset.
// Flat-roof option id for split detection
const FLAT_ROOF_OPTION_ID = 'flat_roof'

async function buildRoofingLineItems(
  item: CartItem,
  vendorMockId: string,
): Promise<PriceLineItem[] | null> {
  const uuid = DEMO_VENDOR_UUID_BY_MOCK_ID[vendorMockId]
  if (!uuid) return null

  let priceMap: ReturnType<typeof getVendorPriceMap> extends Promise<infer T> ? T : never
  try {
    priceMap = await getVendorPriceMap(uuid)
  } catch {
    return null
  }

  const areaSqft = item.roofMeasurement?.areaSqft ?? 0
  const pitchedAreaSqft = item.roofMeasurement?.pitchedAreaSqft
  const flatAreaSqft = item.roofMeasurement?.flatAreaSqft
  const hasFlatSection = item.roofMeasurement?.pitchedAreaSqft !== undefined && item.roofMeasurement?.flatAreaSqft !== undefined

  // Determine if this cart item has both a pitched material AND flat_roof selected.
  // When hasFlatSection, each material gets its own area slice.
  const allMaterialIds = Object.values(item.selections ?? {}).flat()
  const hasFlatRoofSelected = allMaterialIds.includes(FLAT_ROOF_OPTION_ID)
  const hasPitchedSelected = allMaterialIds.some((id) => id !== FLAT_ROOF_OPTION_ID && (getOptionMetadata(id).priceUnit === 'square' || getOptionMetadata(id).priceUnit === 'sqft'))
  const useSplit = hasFlatSection && hasFlatRoofSelected && hasPitchedSelected

  const presets = PRICE_LINE_ITEM_PRESETS['roofing']
  const lines: PriceLineItem[] = []
  let anyComputed = false

  for (const [groupId, optionIds] of Object.entries(item.selections ?? {})) {
    for (const optionId of optionIds) {
      const key = `roofing|${groupId}|${optionId}`
      const priceCents = priceMap.get(key)
      if (priceCents === undefined) continue

      const meta = getOptionMetadata(optionId)
      const unitRateDollars = priceCents / 100

      if (meta.priceUnit === 'square' || meta.priceUnit === 'sqft') {
        // Split mode: flat_roof material uses its own area slice; pitched uses the other.
        // Non-split mode (single material): use full area.
        const isFlat = optionId === FLAT_ROOF_OPTION_ID
        const useSquares = meta.priceUnit === 'square'
        let rawSqft: number
        let note: string | undefined
        if (useSplit) {
          if (isFlat) {
            rawSqft = flatAreaSqft ?? 0
            if (rawSqft === 0) note = 'No flat section detected by satellite imagery — confirm with vendor.'
          } else {
            rawSqft = pitchedAreaSqft ?? 0
            if (rawSqft === 0) note = 'No pitched section detected by satellite imagery — confirm with vendor.'
          }
        } else {
          rawSqft = areaSqft
        }
        // For square pricing: apply 12% waste then convert to squares.
        // For legacy sqft pricing: bill directly against raw sqft.
        const qty = useSquares ? sqftToSquares(Math.round(rawSqft * 1.12)) : rawSqft
        const amount = Math.round(unitRateDollars * qty * 100) / 100
        const labelName = optionId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        const areaLabel = useSplit ? (isFlat ? ' (flat section)' : ' (pitched section)') : ''
        lines.push({
          id: `roofing-material-${optionId}`,
          label: `Material — ${labelName}${areaLabel}`,
          amount,
          originalAmount: amount,
          source: 'preset_calculated',
          priceUnit: useSquares ? 'square' : 'sqft',
          unitRate: unitRateDollars,
          unitQuantity: qty,
          ...(note ? { note } : {}),
        } as PriceLineItem & { note?: string })
        anyComputed = true
      } else if (meta.priceUnit === 'linear_ft') {
        const linFt = item.roofAddonLinearFt?.[optionId] ?? 0
        if (linFt > 0) {
          const amount = Math.round(unitRateDollars * linFt * 100) / 100
          lines.push({
            id: `roofing-addon-${optionId}`,
            label: `${optionId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
            amount,
            originalAmount: amount,
            source: 'preset_calculated',
            priceUnit: 'linear_ft',
            unitRate: unitRateDollars,
            unitQuantity: linFt,
          })
          anyComputed = true
        }
      }
    }
  }

  if (!anyComputed) return null

  // Append non-material preset lines (permit, tearoff, install) unchanged
  for (const preset of presets) {
    if (preset.id === 'roofing-material') continue
    lines.push({ ...preset })
  }

  return lines
}

export function BookingConfirmationPage() {
  const navigate = useNavigate()
  const removeItem = useCartStore((s) => s.removeItem)
  const sendProject = useProjectsStore((s) => s.sendProject)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const profile = useAuthStore((s) => s.profile)
  const [details, setDetails] = useState<BookingDetails | null>(null)
  const [state, setState] = useState<ConfirmationState>('loading')

  useEffect(() => {
    const pendingItemStr = localStorage.getItem('buildconnect-pending-item')
    const contractorStr = localStorage.getItem('buildconnect-selected-contractor')
    const bookingStr = localStorage.getItem('buildconnect-selected-booking')

    // Ship #213 diagnostic — extends #212 telemetry with branch-level
    // logging on the confirmation useEffect. VITE_DEMO_MODE-gated.
    // Reveals which precondition is missing and which branch fires so
    // the Path-B flow gap maps to a specific failure signature.
    const isDemoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
    const logDiag = (phase: string, extra: Record<string, unknown> = {}) => {
      if (!isDemoMode) return
      // eslint-disable-next-line no-console
      console.log('[#212 leads-diag] booking-confirmation', phase, {
        has_pendingItem: !!pendingItemStr,
        has_selectedContractor: !!contractorStr,
        has_selectedBooking: !!bookingStr,
        sentProjects_length: sentProjects.length,
        ...extra,
      })
    }

    logDiag('MOUNT')

    if (pendingItemStr && contractorStr && bookingStr) {
      // async IIFE so we can await buildRoofingLineItems without restructuring
      // the outer useEffect (which must stay sync for the cleanup return).
      // On parse failure the IIFE falls through to the refresh-window
      // detection logic below via setState('loading') remaining (incomplete
      // state fires after IIFE resolves via the else branch).
      ;(async () => {
        try {
          const pendingItem = JSON.parse(pendingItemStr)
          const contractor = JSON.parse(contractorStr)
          const booking = JSON.parse(bookingStr)
          const homeownerStr = localStorage.getItem('buildconnect-homeowner-info')
          const homeowner = homeownerStr ? JSON.parse(homeownerStr) : undefined

          setDetails({
            service: pendingItem.serviceName,
            vendor: contractor.company,
            date: booking.date,
            time: booking.time,
          })

          const idDoc = localStorage.getItem('buildconnect-id-document') || undefined
          logDiag('BRANCH=success (calling sendProject)', {
            serviceName: pendingItem.serviceName,
            vendor: contractor.company,
            vendor_id: contractor.vendor_id,
          })

          // For roofing: build computed $/sqft line items from vendor's
          // Supabase catalog. Falls back to preset on error or missing data.
          let computedLineItems: PriceLineItem[] | undefined
          if (pendingItem.serviceId === 'roofing' && contractor.vendor_id) {
            const built = await buildRoofingLineItems(pendingItem, contractor.vendor_id)
            if (built) computedLineItems = built
          }

          // Ship #269 — pass profile.id as homeowner_id snapshot for admin
          // auditing. Optional on the SentProject side, so undefined here
          // (e.g. unauthed-flow regression) just falls back to display-only
          // homeowner fields.
          sendProject(pendingItem, contractor, booking, homeowner, idDoc, profile?.id, computedLineItems)
          removeItem(pendingItem.id)

          localStorage.removeItem('buildconnect-pending-item')
          localStorage.removeItem('buildconnect-selected-contractor')
          localStorage.removeItem('buildconnect-selected-booking')
          localStorage.removeItem('buildconnect-homeowner-info')
          setState('success')
        } catch (err) {
          logDiag('BRANCH=parse-failure', { error: String(err) })
          // Parse failed — fall through to refresh-window detection
          const latest = sentProjects[sentProjects.length - 1]
          const latestAge = latest ? Date.now() - new Date(latest.sentAt).getTime() : Infinity
          const isRecent = latest && latestAge < RECENT_SEND_WINDOW_MS
          if (isRecent && latest) {
            setDetails({
              service: latest.item.serviceName,
              vendor: latest.contractor.company,
              date: latest.booking.date,
              time: latest.booking.time,
            })
            setState('refreshed')
          } else {
            setState('incomplete')
          }
        }
      })()
      return
    }

    // Preconditions missing (or parse failed). Distinguish:
    // (a) Browser-refresh-after-successful-send: latest sentProject is
    //     fresh — show "refreshed" confirmation.
    // (b) Incomplete flow: no recent sentProject — show explicit error
    //     instead of silent stale-sentProject fallback that misleads
    //     users into thinking the flow completed when it didn't (ship
    //     #213 root-cause fix).
    const latest = sentProjects[sentProjects.length - 1]
    const latestAge = latest ? Date.now() - new Date(latest.sentAt).getTime() : Infinity
    const isRecent = latest && latestAge < RECENT_SEND_WINDOW_MS

    if (isRecent && latest) {
      logDiag('BRANCH=refreshed (recent sentProject within window)', {
        latestAgeMinutes: Math.round(latestAge / 60000),
      })
      setDetails({
        service: latest.item.serviceName,
        vendor: latest.contractor.company,
        date: latest.booking.date,
        time: latest.booking.time,
      })
      setState('refreshed')
    } else {
      logDiag('BRANCH=incomplete (preconditions missing, no recent send)', {
        latestAgeMinutes: latest ? Math.round(latestAge / 60000) : null,
      })
      setState('incomplete')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Ship #213 — explicit error state when preconditions are missing
  // AND there's no recent successful send to fall back to. Prior code
  // silently fell through to showing the LAST sentProject (stale), which
  // masked the real-bug class where a user walks a partial flow and
  // sees a confirmation-looking page for a project that never actually
  // got sent. Now we surface the gap explicitly with a clear path to
  // retry from the cart.
  if (state === 'incomplete') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <AlertTriangle className="h-10 w-10 text-amber-700 dark:text-amber-400" />
        </div>
        <h1 className="mb-2 text-2xl font-bold font-heading text-foreground">
          Booking didn't complete
        </h1>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          Your project wasn't sent to a contractor — looks like a step was missed. Start again from Projects: pick a contractor, then book a site visit.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={() => navigate('/home/cart')} className="h-11 px-6">
            Go to Projects
          </Button>
          <Button variant="outline" size="lg" onClick={() => navigate('/home')} className="h-11 px-6">
            Browse services
          </Button>
        </div>
      </div>
    )
  }

  if (!details) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <Home className="h-10 w-10 text-muted-foreground/60" />
        </div>
        <h1 className="mb-2 text-2xl font-bold font-heading text-foreground">
          No booking in progress
        </h1>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          Pick a service and walk through the booking flow to land back here with a confirmed appointment.
        </p>
        <Button size="lg" onClick={() => navigate('/home')} className="h-11 px-6">
          Browse services
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md text-center"
      >
        {/* Animated checkmark */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15, type: 'spring', stiffness: 200, damping: 15 }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"
        >
          <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        </motion.div>

        <h1 className="mb-2 text-2xl font-bold font-heading text-foreground">
          Booking Confirmed
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your site visit has been scheduled successfully.
        </p>

        {/* Summary card */}
        <Card className="mb-6 text-left">
          <CardContent className="flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Service</span>
              <span className="font-medium text-foreground">{details.service}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vendor</span>
              <span className="font-medium text-foreground">{details.vendor}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium text-foreground">{formatBookingDate(details.date)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Time</span>
              <span className="font-medium text-foreground">{formatBookingTime(details.time)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Project Pack notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="mb-6 flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/10 p-4"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          {/* Ship #211 — vocabulary bridge per Rodolfo's mental model:
              homeowner says "project", vendor nav says "Projects tab",
              Rodolfo's framing says "lead". Using all three in one
              sentence so the moment-of-lead-creation is unambiguous
              regardless of which mental model the user holds. */}
          <p className="text-sm text-foreground text-left">
            <span className="font-medium">Project Pack</span>{' '}
            <span className="text-muted-foreground">has been sent to {details.vendor} — it appears in their Projects tab as a new lead they'll review and confirm.</span>
          </p>
        </motion.div>

        {/* Actions — side-by-side, big-CTA sizing matching Add to Project elsewhere */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-12 gap-2 text-sm font-semibold rounded-xl"
            onClick={() => {
              // Ship #324 — navigate to the actual just-booked sentProject's
              // appointment URL instead of the hardcoded L-0001 fixture
              // (which can be undefined when demoDataHidden=true). Banked
              // hardcoded-fixture-shape-assumption — fix at the producer
              // side so consumers (AppointmentStatusPage) never receive an
              // ID that resolves to no entity.
              const latest = sentProjects[sentProjects.length - 1]
              if (latest) {
                navigate(`/home/appointments/L-${latest.id.slice(0, 4).toUpperCase()}`)
              } else {
                navigate('/home/cart')
              }
            }}
          >
            View Status
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            className="flex-1 h-12 gap-2 text-sm font-semibold rounded-xl"
            onClick={() => navigate('/home/cart')}
          >
            <Home className="h-4 w-4" />
            View Projects
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
