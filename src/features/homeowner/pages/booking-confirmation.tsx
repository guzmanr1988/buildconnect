import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, FileText, ArrowRight, Home, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCartStore } from '@/stores/cart-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useAuthStore } from '@/stores/auth-store'
import { useHomeownerDocsStore } from '@/stores/homeowner-documents-store'
import { generateSubmissionPdf } from '@/lib/generate-submission-pdf'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { getVendorPriceMap, getVendorPermitMap } from '@/lib/api/pricing'
import { computeRemodelLineItems } from '@/lib/remodel-pricing'
import { computeBathroomLineItems } from '@/lib/bathroom-pricing'
import { getVendorServiceRateMap } from '@/lib/api/vendor-service-rates'
import { buildRoofingBaseLines } from '@/lib/roofing-base-lines'
import { useCatalogStore } from '@/stores/catalog-store'
import type { PriceLineItem, ServiceConfig } from '@/types'
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

// pin-31 — async wrapper around the shared roofing base-line helper. The
// pure-sync core moved to src/lib/roofing-base-lines.ts so booking-time
// write, vendor-compare quote, and projects-store hydrate-time backfill
// all consume the SAME line-item math. See that module's header for the
// permit-gate doctrine.
async function buildRoofingLineItems(
  item: CartItem,
  vendorMockId: string,
  projectPermit?: 'yes' | 'no',
  services?: ServiceConfig[],
): Promise<PriceLineItem[] | null> {
  const uuid = DEMO_VENDOR_UUID_BY_MOCK_ID[vendorMockId]
  if (!uuid) return null

  try {
    const [priceMap, permitMap] = await Promise.all([
      getVendorPriceMap(uuid),
      getVendorPermitMap(uuid),
    ])
    return buildRoofingBaseLines(item, projectPermit, priceMap, permitMap, services)
  } catch {
    return null
  }
}

export function BookingConfirmationPage() {
  const navigate = useNavigate()
  const removeItem = useCartStore((s) => s.removeItem)
  const projectPermit = useCartStore((s) => s.projectPermit)
  const sendProject = useProjectsStore((s) => s.sendProject)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const profile = useAuthStore((s) => s.profile)
  const addDoc = useHomeownerDocsStore((s) => s.addDoc)
  // task_501: session-scoped hydration authority (mirrors task_869 gate on
  // service-detail). The roofing branch at L~170 reads
  // useCatalogStore.getState().services and feeds it to
  // buildRoofingLineItems — a cold refresh or deep-link landing here with
  // a persisted-from-last-session catalog would compute line items against
  // stale option shape and stamp the sent project with wrong money. Wait
  // until this session's hydrateFromServer resolves (or errors, in which
  // case buildRoofingLineItems' internal catch falls back to preset)
  // before firing the send flow.
  const hydratedThisSession = useCatalogStore((s) => s.hydratedThisSession)
  const lastFetchError = useCatalogStore((s) => s.lastFetchError)
  const firedRef = useRef(false)
  const [details, setDetails] = useState<BookingDetails | null>(null)
  const [state, setState] = useState<ConfirmationState>('loading')
  const [cashOnlyProject, setCashOnlyProject] = useState<string | null>(null) // service name when permit=no

  useEffect(() => {
    // task_501: single-fire guard + hydration gate. Effect deps include
    // hydratedThisSession + lastFetchError so it re-runs when the store
    // flips from unhydrated → hydrated/errored; firedRef ensures the
    // send flow (which consumes LS keys and calls sendProject) fires
    // exactly once even across multiple store-triggered re-renders.
    if (firedRef.current) return
    if (!hydratedThisSession && !lastFetchError) return
    firedRef.current = true

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
      // Final-step Photo ID gate. The cart button and handleSendToContractor
      // are gated upstream, but a deep-link / state-rehydrate path that
      // arrives here with all LS preconditions yet no Photo ID on the
      // profile must not fire sendProject. Read via getState so we don't
      // close over an in-flight profile load. Aborting redirects to the
      // documents page with an explicit reason — Rod directive is that the
      // customer must know why they cannot submit.
      if (!useAuthStore.getState().profile?.id_document_url) {
        logDiag('BRANCH=blocked-no-photo-id')
        toast.error('Photo ID required. Go to Documents to upload.')
        navigate('/home/documents')
        return
      }
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

          // PR #197 — ID is profile-level (profile.id_document_url) instead of
          // a per-send LS key. Server-authoritative; survives reloads/sessions.
          const idDoc = useAuthStore.getState().profile?.id_document_url || undefined
          logDiag('BRANCH=success (calling sendProject)', {
            serviceName: pendingItem.serviceName,
            vendor: contractor.company,
            vendor_id: contractor.vendor_id,
          })

          // For roofing: build computed $/sqft line items from vendor's
          // Supabase catalog. Falls back to preset on error or missing data.
          let computedLineItems: PriceLineItem[] | undefined
          if (pendingItem.serviceId === 'roofing' && contractor.vendor_id) {
            const services = useCatalogStore.getState().services
            const built = await buildRoofingLineItems(pendingItem, contractor.vendor_id, projectPermit ?? undefined, services)
            if (built) computedLineItems = built
          } else if (pendingItem.serviceId === 'remodel' && pendingItem.remodelMeasurements) {
            // Ship #475+1 — Interior Remodel: every line auto-computed from
            // L×W×H×numWalls via REMODEL_RATES (per-line rate + measurement-
            // derived qty stamped as preset_calculated, same snapshot
            // semantics as roofing).
            //
            // Mig 068 — per-vendor unit-rate overlay via vendor_service_rates.
            // When contractor.vendor_id maps to a real UUID, fetch the per-
            // vendor rate map and pass it to the compute engine; otherwise
            // the engine falls back to the in-code MEDIAN baseline.
            let remodelRateMap = undefined
            if (contractor.vendor_id) {
              const vendorUuid = DEMO_VENDOR_UUID_BY_MOCK_ID[contractor.vendor_id] ?? contractor.vendor_id
              try { remodelRateMap = await getVendorServiceRateMap(vendorUuid, 'remodel') } catch { /* silent fallback */ }
            }
            computedLineItems = computeRemodelLineItems(pendingItem.remodelMeasurements, remodelRateMap)
          } else if (pendingItem.serviceId === 'bathroom' && pendingItem.bathroomMeasurements) {
            // Ship #475+2 — Bathroom Remodel: line scope from L×W×H×tile-coverage
            // + tub toggle via BATHROOM_RATES. FIXTURES rows ($0 client-provided)
            // are included in the snapshot so the vendor inbox sees the full
            // scope, but contractor subtotal === grand total by construction.
            //
            // Mig 068 — per-vendor unit-rate overlay (same pattern as remodel).
            let bathroomRateMap = undefined
            if (contractor.vendor_id) {
              const vendorUuid = DEMO_VENDOR_UUID_BY_MOCK_ID[contractor.vendor_id] ?? contractor.vendor_id
              try { bathroomRateMap = await getVendorServiceRateMap(vendorUuid, 'bathroom') } catch { /* silent fallback */ }
            }
            computedLineItems = computeBathroomLineItems(pendingItem.bathroomMeasurements, bathroomRateMap)
          }
          // Rod 2026-06-09 rev5 (kratos GO via 1781036363641-kratos-qzxq1) —
          // PRESET-fallback assembly for non-roof/remodel/bath services is
          // KILLED. Rod rule: a lead appears WITH a real per-vendor price or
          // does NOT appear at all (no "Price pending", no "$0", no PRESET
          // fallback). Roofing / remodel / bathroom compute paths above are
          // UNTOUCHED (they pull real per-vendor catalog math). For everything
          // else, computedLineItems remains undefined — the rev4 display
          // filter on lead-inbox / lead-workflow / lead-stages then hides any
          // lead whose priceLineItems are empty / fall below total>0, matching
          // the marketplace-matching rule (coversAllServices && totalCents>0).

          // Ship #269 — pass profile.id as homeowner_id snapshot for admin
          // auditing. Optional on the SentProject side, so undefined here
          // (e.g. unauthed-flow regression) just falls back to display-only
          // homeowner fields.
          // Cash-only flag: project-level projectPermit is SoT; legacy
          // per-item roofPermit is the fallback for pre-PR-140 carts.
          const permitChoice = projectPermit ?? (pendingItem as any).roofPermit
          if (permitChoice === 'no') {
            setCashOnlyProject(pendingItem.serviceName)
          }
          const sentProjectId = sendProject(pendingItem, contractor, booking, homeowner, idDoc, profile?.id, computedLineItems)

          // Fire-and-forget PDF generation — never-block rule: errors are swallowed,
          // flow always reaches setState('success') regardless of PDF outcome.
          // Read profile at call-time via getState() — NOT the closure-captured
          // `profile` from render. AuthBootstrap calls setSession before getProfile
          // (Ship #275 defensive ordering), so RequireAuth can render this page while
          // profile is still null. The closure would freeze null; getState() reads
          // whatever has loaded by the time the async IIFE reaches this line.
          const liveProfile = useAuthStore.getState().profile
          if (liveProfile?.id) {
            generateSubmissionPdf({
              serviceName: pendingItem.serviceName,
              vendorCompany: contractor.company,
              vendorName: contractor.name,
              bookingDate: booking.date,
              bookingTime: booking.time,
              homeownerAddress: homeowner?.address,
              idDocDataUrl: idDoc,
              permitWaiver: (pendingItem as any).permitWaiver ?? null,
            }).then(async (dataUrl) => {
              const dateSlug = new Date().toISOString().slice(0, 10)
              const vendorSlug = contractor.company.replace(/\s+/g, '-').toLowerCase().slice(0, 20)
              // PR-242 — store now accepts a Blob (Supabase Storage upload).
              // generateSubmissionPdf still returns a base64 dataURI; convert
              // here rather than touching the generator (out of scope).
              const blobRes = await fetch(dataUrl)
              const blob = await blobRes.blob()
              await addDoc({
                homeownerId: liveProfile.id,
                category: 'project-submission',
                filename: `project-${vendorSlug}-${dateSlug}.pdf`,
                blob,
                vendorCompany: contractor.company,
                serviceName: pendingItem.serviceName,
                project_id: sentProjectId,
                address: homeowner?.address,
              })
            }).catch(() => { /* silent — never block flow */ })
          }

          removeItem(pendingItem.id)

          localStorage.removeItem('buildconnect-pending-item')
          localStorage.removeItem('buildconnect-selected-contractor')
          localStorage.removeItem('buildconnect-selected-booking')
          localStorage.removeItem('buildconnect-homeowner-info')
          // PR #197 — ID lives on profile.id_document_url, not LS. The
          // standalone buildconnect-id-document key removal stays defensive
          // for any pre-#197 cart that might still carry one through migrate.
          localStorage.removeItem('buildconnect-id-document')
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
  }, [hydratedThisSession, lastFetchError]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // task_501: while catalog hydration is in flight AND LS preconditions
  // suggest a booking is in progress, render a proper "finalizing" state
  // instead of the "No booking in progress" fallback below. Without this,
  // a cold refresh of /home/booking flashes the empty-state page for
  // 200-800ms during hydration — reads as "your booking was lost".
  if (
    !details &&
    state === 'loading' &&
    !hydratedThisSession &&
    !lastFetchError &&
    typeof window !== 'undefined' &&
    !!localStorage.getItem('buildconnect-pending-item') &&
    !!localStorage.getItem('buildconnect-selected-contractor') &&
    !!localStorage.getItem('buildconnect-selected-booking')
  ) {
    return (
      <div
        data-testid="booking-confirmation-hydrating"
        className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center gap-4"
      >
        <div
          className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin"
          aria-hidden="true"
        />
        <p className="text-muted-foreground">Finalizing your booking…</p>
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

        {/* Cash-only notice when permit=no */}
        {cashOnlyProject && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 text-left">
            <p className="font-medium mb-0.5">Payment: Cash, check, or wire only</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
              Financing is not available for this project — No Permit was selected. Your contractor will confirm accepted payment methods.
            </p>
          </div>
        )}

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
