import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Calendar, MapPin, Phone, Mail, Clock, FileText, Shield, ChevronLeft, ChevronRight, UserCheck, RefreshCw, Check, X, DollarSign, AlertTriangle, Circle, Hourglass } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { resolveLeadStatusLabel } from '@/lib/lead-status-label'
import { ReschedulePickerDialog } from '@/components/shared/reschedule-picker-dialog'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { PRICE_LINE_ITEM_PRESETS } from '@/lib/price-line-item-presets'
import { SERVICE_CATALOG } from '@/lib/constants'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useProjectsStore } from '@/stores/projects-store'
import { useFeatureFlag } from '@/lib/financing/hooks/use-feature-flag'
import { ApplyFinancingDialog } from '@/features/financing/components/apply-financing-dialog'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import type { CartItem } from '@/stores/cart-store'
import type { Lead, LeadStatus } from '@/types'

const statusPulse: Record<string, string> = {
  pending: 'bg-amber-500 animate-pulse',
  confirmed: 'bg-emerald-500',
  rejected: 'bg-red-500',
  rescheduled: 'bg-blue-500',
  completed: 'bg-slate-500',
  // Ship #171 — mutual-cancellation outcome; softer tone than red 'rejected'.
  cancelled: 'bg-zinc-500',
}

export function AppointmentStatusPage() {
  const { id } = useParams<{ id: string }>()
  const financingEnabled = useFeatureFlag('financing_enabled')
  const profile = useAuthStore((s) => s.profile)
  // Homeowner-level financing state — if cfp shows an active envelope OR
  // any in-flight application, suppress the per-project Apply-CTA so the
  // /home ApprovedAmountBanner stays the single source of truth. Without
  // this, /home/leads/<id> renders "Apply for financing" while /home shows
  // "You have $15,000 available from GoodLeap" — the two-surface confusion
  // Rod flagged 2026-05-22.
  const [homeownerHasFinancing, setHomeownerHasFinancing] = useState(false)
  // PR-330 — envelope state for the Apply Financing dialog. approved
  // applicationId + envelope cents + sum of allocations on OTHER projects
  // (excluded from server-side cap re-check). Slot-availability is the
  // CTA gate, not status.
  const [approvedAppId, setApprovedAppId] = useState<string | null>(null)
  const [envelopeCents, setEnvelopeCents] = useState<number>(0)
  const [otherAllocatedCents, setOtherAllocatedCents] = useState<number>(0)
  useEffect(() => {
    if (!financingEnabled || !profile?.id) return
    let cancelled = false
    void Promise.allSettled([
      supabase
        .from('customer_financing_profile')
        .select('has_financing,last_known_status,last_known_amount_cents')
        .eq('customer_id', profile.id)
        .maybeSingle(),
      supabase
        .from('financing_applications')
        .select('id,status,estimated_amount_cents')
        .eq('homeowner_id', profile.id)
        .in('status', ['applied', 'pending', 'approved', 'terms_accepted'])
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([cfpRes, appRes]) => {
      if (cancelled) return
      const cfpData = cfpRes.status === 'fulfilled' && !cfpRes.value.error ? cfpRes.value.data : null
      const appData = appRes.status === 'fulfilled' && !appRes.value.error ? appRes.value.data : null
      const cfpHit =
        cfpData?.has_financing === true &&
        (cfpData?.last_known_status === 'approved' || cfpData?.last_known_status === 'terms_accepted')
      const appHit = !!appData
      if (cfpHit || appHit) setHomeownerHasFinancing(true)
      if (appData && (appData.status === 'approved' || appData.status === 'terms_accepted')) {
        setApprovedAppId(appData.id)
        const envelope = (cfpData?.last_known_amount_cents as number | null) ?? (appData.estimated_amount_cents as number | null) ?? 0
        setEnvelopeCents(envelope)
      }
    })
    return () => {
      cancelled = true
    }
  }, [financingEnabled, profile?.id])

  const [applyDialogOpen, setApplyDialogOpen] = useState(false)
  // Ship #250 — effective-fixture hook honors the demoDataHidden flag.
  const mockLeads = useEffectiveMockLeads()
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const sentProjects = useProjectsStore((s) => s.sentProjects)

  // PR-330 — sum of allocations under the approved application across the
  // homeowner's OTHER sent_projects (excluded from envelope-cap math so
  // update-allocation flows aren't blocked by their own existing entry).
  useEffect(() => {
    if (!approvedAppId) {
      setOtherAllocatedCents(0)
      return
    }
    const matchedSp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === id)
    const sum = sentProjects.reduce((acc, sp) => {
      if (sp.applied_financing_application_id !== approvedAppId) return acc
      if (matchedSp && sp.id === matchedSp.id) return acc
      return acc + (sp.applied_financing_amount_cents ?? 0)
    }, 0)
    setOtherAllocatedCents(sum)
  }, [approvedAppId, sentProjects, id])
  // Ship #191 — reschedule negotiation state. Key lookup stays lean
  // (raw map-entry selector returns undefined or the entity — stable
  // either way per the banked zustand-selector-stable-reference rule).
  const rescheduleRequest = useProjectsStore((s) => s.rescheduleRequestsByLead[id ?? ''])
  const requestReschedule = useProjectsStore((s) => s.requestReschedule)
  const approveReschedule = useProjectsStore((s) => s.approveReschedule)
  const counterReschedule = useProjectsStore((s) => s.counterReschedule)
  const rejectReschedule = useProjectsStore((s) => s.rejectReschedule)
  const updateBooking = useProjectsStore((s) => s.updateBooking)

  // Ship #191 — dialog open-state. Separate flags for request (pre-
  // approval simple update OR post-approval homeowner propose) and
  // counter (homeowner counter-propose in response to vendor's
  // proposal). Both use the same picker dialog component.
  const [reschedulePickerOpen, setReschedulePickerOpen] = useState(false)
  const [counterPickerOpen, setCounterPickerOpen] = useState(false)

  // Two lookup paths:
  // 1. MOCK_LEADS (static fixtures L-0001..L-0005) — read by id match.
  // 2. sentProjects (cart-created leads with id pattern L-${first4-of-uuid}) —
  //    lookup by matching the URL id against the computed L-XXXX key and
  //    converting SentProject status to Lead.status via the vendor-dashboard
  //    statusMap (pending→pending, approved→confirmed, declined→rejected,
  //    sold→completed). Without this path, cart-created URLs fell through to
  //    MOCK_LEADS[0] (L-0001 confirmed) so the homeowner never saw their
  //    lead's actual yellow/pending state.
  const sentProjectStatusMap: Record<string, LeadStatus> = {
    pending: 'pending',
    approved: 'confirmed',
    declined: 'rejected',
    sold: 'completed',
  }
  const mockLead = mockLeads.find((l) => l.id === id)
  const sentProject = !mockLead
    ? sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === id)
    : undefined

  // Ship #355 — frozen price SoT. Priority: saleAmount (post-sale) →
  // quotedPriceCents (vendor-compare price frozen at booking) → preset
  // fallback (legacy / no catalog price). Removes the catalog-store
  // recompute (#352) that diverged from vendor-compare's Supabase path.
  const sentProjectValue: number = sentProject
    ? sentProject.saleAmount
      ?? (sentProject.quotedPriceCents && sentProject.quotedPriceCents > 0
          ? Math.round(sentProject.quotedPriceCents / 100)
          : (() => {
              const lineItems = (sentProject.priceLineItems && sentProject.priceLineItems.length > 0)
                ? sentProject.priceLineItems
                : (PRICE_LINE_ITEM_PRESETS[sentProject.item.serviceId as keyof typeof PRICE_LINE_ITEM_PRESETS] ?? [])
              return lineItems.reduce((sum, l) => sum + l.amount, 0)
            })())
    : 0

  const baseLead = mockLead
    ?? (sentProject && {
      id: `L-${sentProject.id.slice(0, 4).toUpperCase()}`,
      homeowner_id: 'ho-current',
      vendor_id: 'v-1', // display-only fallback; real vendor lookup lives on sentProject.contractor
      project: sentProject.item.serviceName,
      value: sentProjectValue,
      status: sentProjectStatusMap[sentProject.status] ?? 'pending',
      slot: sentProject.sentAt,
      permit_choice: Object.values(sentProject.item.selections ?? {}).flat().includes('permit'),
      service_category: sentProject.item.serviceId as LeadStatus & string,
      pack_items: sentProject.item.selections,
      sq_ft: 0,
      financing: Object.values(sentProject.item.selections ?? {}).flat().includes('financed'),
      address: sentProject.homeowner?.address || 'Pending site visit',
      phone: sentProject.homeowner?.phone || '',
      email: sentProject.homeowner?.email || '',
      homeowner_name: sentProject.homeowner?.name || 'You',
      received_at: sentProject.sentAt,
    } as unknown as Lead)
    ?? mockLeads[0]

  // Ship #324 — defensive empty-state. baseLead can resolve to undefined
  // when demoDataHidden=true empties useEffectiveMockLeads AND no matching
  // sentProject exists for the URL id (legacy hardcoded L-0001 link from
  // booking-confirmation pre-#324 cause-fix; or stale bookmark; or admin-
  // cleared demo data while a tab held an old appointment URL). Banked
  // hardcoded-fixture-shape-assumption parent-class — guard at consumer
  // since fixture-shape can shrink at runtime via the demo-clear flag.
  if (!baseLead) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <Calendar className="h-10 w-10 text-muted-foreground/60" />
        </div>
        <h1 className="mb-2 text-2xl font-bold font-heading text-foreground">
          Appointment not found
        </h1>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          We couldn't find an appointment with this link. It may have been removed, or the link is from an older booking.
        </p>
        <Button asChild size="lg" className="h-11 px-6">
          <Link to="/home/cart">Go to Projects</Link>
        </Button>
      </div>
    )
  }

  // Apply lead-status override (Phase C persist) on top of whatever we resolved.
  const lead = leadStatusOverrides[baseLead.id]
    ? { ...baseLead, status: leadStatusOverrides[baseLead.id] }
    : baseLead
  // Ship #165: prefer contractor.vendor_id FK over company-name match.
  const vendor = sentProject
    ? (sentProject.contractor?.vendor_id
        ? MOCK_VENDORS.find((v) => v.id === sentProject.contractor!.vendor_id)
        : MOCK_VENDORS.find((v) => v.company === sentProject.contractor?.company))
    : MOCK_VENDORS.find((v) => v.id === lead.vendor_id)
  // Assigned rep (Phase C): vendor picks at Confirm, homeowner sees here.
  const assignedRep =
    assignedRepByLead[lead.id] ??
    sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === lead.id)?.assignedRep

  const matchedSentProject = sentProjects.find(
    (p) => `L-${p.id.slice(0, 4).toUpperCase()}` === lead.id,
  )

  // Photo 314 polish — horizontal stepper happy-path lifecycle. Off-path
  // statuses return null and the existing Status pill + reschedule banners
  // carry the off-path semantics instead.
  const statusSteps = deriveStatusSteps({
    status: lead.status,
    hasAssignedRep: !!assignedRep,
  })

  function formatSlot(slot: string) {
    const d = new Date(slot)
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="self-start -ml-2 h-9 gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <Link to="/home">
          <ChevronLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Appointment Status
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lead {lead.id} — {lead.project}
        </p>
      </div>

      {/* Status header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('h-3 w-3 rounded-full', statusPulse[lead.status])} />
              <StatusBadge
                status={lead.status}
                className="text-sm"
                label={
                  lead.status === 'pending'
                    ? 'Scheduled - Pending Approval'
                    : lead.status === 'confirmed'
                      ? 'Approved'
                      : resolveLeadStatusLabel({ status: lead.status, soldAt: sentProject?.soldAt })
                }
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {formatSlot(lead.slot)}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Ship #191 — reschedule banner + action row. Vendor-proposed
          banner surfaces when there's a pending request with
          requestedBy='vendor'. Request-Reschedule action is available
          pre-approval (simple update) and post-approval (request entity).
          Status=pending + no existing request → simple picker updates
          booking directly (no negotiation since vendor hasn't accepted).
          Status=confirmed + no existing request → propose new slot via
          request entity (two-party negotiation). Rescheduled + rejected
          + cancelled lifecycle states hide the action entirely. */}
      {rescheduleRequest && rescheduleRequest.status === 'pending' && rescheduleRequest.requestedBy === 'vendor' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <Card className="border-sky-300/60 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-700/40">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-400">
                  <RefreshCw className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    Your vendor proposed a new time
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {rescheduleRequest.proposedDate} · {rescheduleRequest.proposedTime}
                    </span>
                    <span className="text-xs ml-2">
                      (was {rescheduleRequest.originalDate} · {rescheduleRequest.originalTime})
                    </span>
                  </p>
                  {rescheduleRequest.reason && (
                    <p className="mt-1.5 text-xs text-muted-foreground italic">
                      "{rescheduleRequest.reason}"
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    approveReschedule(lead.id)
                    // Apply the proposed slot to the booking.
                    updateBooking(matchedSentProject?.id ?? lead.id, {
                      date: rescheduleRequest.proposedDate,
                      time: rescheduleRequest.proposedTime,
                    })
                    toast.success('New time approved — your vendor is notified.')
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve new time
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setCounterPickerOpen(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Counter-propose
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => {
                    rejectReschedule(lead.id)
                    toast.success('Keeping the original time.')
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Keep original
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Ship #191 — homeowner's own pending reschedule awaiting vendor */}
      {rescheduleRequest && rescheduleRequest.status === 'pending' && rescheduleRequest.requestedBy === 'homeowner' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <Card className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700/40">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    Reschedule request pending
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You proposed{' '}
                    <span className="font-medium text-foreground">
                      {rescheduleRequest.proposedDate} · {rescheduleRequest.proposedTime}
                    </span>
                    . Waiting for your vendor to confirm or suggest another time.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Ship #191 — Request Reschedule action. Hidden once negotiation
          is in flight (show banner above instead) or lead is in a
          terminal state. */}
      {!rescheduleRequest && (lead.status === 'pending' || lead.status === 'confirmed') && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setReschedulePickerOpen(true)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Request reschedule
          </Button>
        </div>
      )}

      {financingEnabled === true && matchedSentProject && !lead.financing && !homeownerHasFinancing && (
        <Card data-testid="homeowner-project-financing-cta" data-financing-project-cta>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <DollarSign className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Need financing for this project?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Apply with one of our partner lenders. Approvals typically come back within one business day.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="shrink-0" data-testid="homeowner-project-financing-apply">
              <Link to={`/home/financing/apply?project_id=${matchedSentProject.id}`}>
                Apply for financing
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {financingEnabled === true && matchedSentProject && approvedAppId && (
        <Card
          data-testid="homeowner-project-apply-financing-cta"
          data-apply-financing-cta
          data-apply-financing-slot={matchedSentProject.applied_financing_application_id ? 'filled' : 'empty'}
        >
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <DollarSign className="h-4 w-4" />
              </div>
              <div>
                {matchedSentProject.applied_financing_application_id ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      Financing applied: ${((matchedSentProject.applied_financing_amount_cents ?? 0) / 100).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Adjust how much of your approved envelope is allocated to this project.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-foreground">Apply financing to this project</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You have an approved envelope. Allocate some or all of it to this project.
                    </p>
                  </>
                )}
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              data-testid="homeowner-project-apply-financing-open"
              onClick={() => setApplyDialogOpen(true)}
            >
              {matchedSentProject.applied_financing_application_id ? 'Update Allocation' : 'Apply Financing'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Photo 314 polish — horizontal stepper renders only on happy-path
          statuses (pending/confirmed/completed). For rejected/cancelled the
          stepper hides and OffPathStatusBanner takes its place; rescheduled
          uses the existing vendor/homeowner reschedule banners above. */}
      {statusSteps && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <StatusStepper steps={statusSteps} />
        </motion.div>
      )}
      <OffPathStatusBanner status={lead.status} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Project Details — heavier card lives left col, balanced by the
            stacked Homeowner Info + Representative on the right. Project Items
            renders as section-grouped (Service Type / Materials / Add-Ons /
            Roof Details / Permits / Attachments) per delta F. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Project Details
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <DetailRow icon={FileText} label="Project" value={lead.project} />
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Price
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground tabular-nums">
                  ${lead.value.toLocaleString()}
                </p>
              </div>
              {vendor && (
                <DetailRow
                  icon={FileText}
                  label="Vendor"
                  value={vendor.company}
                />
              )}

              {/* Project Items — itemized breakdown of every wizard pick
                  with quantity. Section-grouped per delta F. Falls back to
                  legacy pack_items badge list for MOCK_LEADS fixtures. */}
              <div className="mt-2 border-t border-border pt-3">
                <p className="mb-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Project Items
                </p>
                {sentProject?.item ? (
                  <ProjectItemsList
                    item={sentProject.item}
                    projectPermit={sentProject.projectPermit}
                  />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(lead.pack_items).map(([, items]) =>
                      items.map((item) => (
                        <Badge key={item} variant="secondary" className="text-[10px]">
                          {humanizeId(item)}
                        </Badge>
                      ))
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right column — Homeowner Info on top + Representative below
            (when assigned). Stacked in a flex column so the right col reads
            as one logical "people + contact" unit, paired against the left
            col Project Details "what + how much" unit. */}
        <div className="flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.22 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Homeowner Info
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <DetailRow
                  icon={MapPin}
                  label="Address"
                  value={placeholderAware(lead.address, ADDRESS_PLACEHOLDERS)}
                />
                <DetailRow
                  icon={Phone}
                  label="Phone"
                  value={placeholderAware(lead.phone, PHONE_PLACEHOLDERS)}
                />
                <DetailRow
                  icon={Mail}
                  label="Email"
                  value={placeholderAware(lead.email, EMAIL_PLACEHOLDERS)}
                />
                <DetailRow
                  icon={Shield}
                  label="Permit required"
                  value={lead.permit_choice ? 'Yes' : 'No'}
                />
              </CardContent>
            </Card>
          </motion.div>

          {assignedRep && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.26 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    Representative
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-base font-semibold text-foreground">{assignedRep.name}</p>
                  {assignedRep.role && (
                    <p className="text-sm text-muted-foreground">{assignedRep.role}</p>
                  )}
                  {assignedRep.phone && (
                    <DetailRow icon={Phone} label="Phone" value={assignedRep.phone} />
                  )}
                  {assignedRep.email && (
                    <DetailRow icon={Mail} label="Email" value={assignedRep.email} />
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>

      {/* Ship #191 — reschedule picker + counter picker mounted
          unconditionally per dialog-mount-in-every-return-branch
          discipline. Pre-approval (lead.status='pending', no request
          entity) simple path: updateBooking directly; no negotiation
          needed since vendor hasn't accepted. Post-approval
          (lead.status='confirmed') creates the request entity so the
          vendor can approve/counter/reject. */}
      <ReschedulePickerDialog
        open={reschedulePickerOpen}
        onOpenChange={setReschedulePickerOpen}
        mode="request"
        currentDate={lead.slot.split('T')[0]}
        currentTime={lead.slot.split('T')[1]?.slice(0, 5) ?? ''}
        otherPartyLabel={vendor?.company}
        onSubmit={(proposedDate, proposedTime, reason) => {
          if (lead.status === 'pending') {
            // Pre-approval: skip request entity, update booking
            // directly. Vendor sees the new time on next view.
            const targetId = matchedSentProject?.id ?? lead.id
            updateBooking(targetId, { date: proposedDate, time: proposedTime })
            toast.success('New time sent to your vendor.')
          } else {
            // Post-approval: two-party negotiation via request entity.
            requestReschedule(
              lead.id,
              'homeowner',
              proposedDate,
              proposedTime,
              lead.slot.split('T')[0],
              lead.slot.split('T')[1]?.slice(0, 5) ?? '',
              reason,
            )
            toast.success("Reschedule request sent to your vendor.")
          }
          setReschedulePickerOpen(false)
        }}
      />

      <ReschedulePickerDialog
        open={counterPickerOpen}
        onOpenChange={setCounterPickerOpen}
        mode="counter"
        currentDate={rescheduleRequest?.proposedDate}
        currentTime={rescheduleRequest?.proposedTime}
        otherPartyLabel={vendor?.company}
        onSubmit={(proposedDate, proposedTime, reason) => {
          counterReschedule(lead.id, proposedDate, proposedTime, reason)
          toast.success('Counter-proposal sent to your vendor.')
          setCounterPickerOpen(false)
        }}
      />

      {matchedSentProject && approvedAppId && (
        <ApplyFinancingDialog
          open={applyDialogOpen}
          onOpenChange={setApplyDialogOpen}
          sentProjectId={matchedSentProject.id}
          sentProjectName={lead.project}
          projectValueCents={Math.round((lead.value ?? 0) * 100)}
          envelopeCents={envelopeCents}
          otherAllocatedCents={otherAllocatedCents}
          applicationId={approvedAppId}
          currentAllocationCents={matchedSentProject.applied_financing_amount_cents ?? null}
          onSuccess={() => {
            if (profile?.id) {
              void useProjectsStore.getState().hydrateFromSupabase(profile.id, 'homeowner')
            }
          }}
        />
      )}
    </div>
  )
}

// Photo 314 polish — placeholder discipline. Empty / sentinel-default values
// render as italic muted "Not on file" instead of a blank slot or sentinel
// leaking through (e.g. address "Pending site visit", phone "—", email
// "homeowner@buildc.net"). Caller passes the sentinel list per field.
const ADDRESS_PLACEHOLDERS = ['', 'Pending site visit']
const PHONE_PLACEHOLDERS = ['', '—', '-']
const EMAIL_PLACEHOLDERS = ['', 'homeowner@buildc.net']

function placeholderAware(value: string | null | undefined, sentinels: readonly string[]): ReactNode {
  const trimmed = (value ?? '').trim()
  if (sentinels.includes(trimmed)) {
    return <span className="italic text-muted-foreground/60">Not on file</span>
  }
  return trimmed
}

// Photo 314 polish — horizontal stepper. 4-step happy-path lifecycle. Past
// steps render filled + check; current is filled + bold; future is hollow +
// muted. Off-path statuses (rejected/cancelled/rescheduled) hide the
// stepper entirely — the existing Status pill + reschedule banners carry
// the off-path semantics; surfacing the stepper there would clutter.
type StepState = 'done' | 'current' | 'upcoming'
type StatusStep = { key: string; label: string; state: StepState }

function deriveStatusSteps(args: {
  status: LeadStatus
  hasAssignedRep: boolean
}): StatusStep[] | null {
  const { status, hasAssignedRep } = args
  if (status === 'rejected' || status === 'cancelled' || status === 'rescheduled') {
    return null
  }
  const stepKeys = ['submitted', 'confirmed', 'rep_assigned', 'completed'] as const
  const labels: Record<typeof stepKeys[number], string> = {
    submitted: 'Lead submitted',
    confirmed: 'Vendor confirmed',
    rep_assigned: 'Representative assigned',
    completed: 'Project completed',
  }
  const completedIndex = (() => {
    if (status === 'completed') return 3
    if (status === 'confirmed' && hasAssignedRep) return 2
    if (status === 'confirmed') return 1
    return 0
  })()
  return stepKeys.map((key, i) => ({
    key,
    label: labels[key],
    state: i < completedIndex ? 'done' : i === completedIndex ? 'current' : 'upcoming',
  }))
}

function StatusStepper({ steps }: { steps: StatusStep[] }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1
            const isDone = step.state === 'done'
            const isCurrent = step.state === 'current'
            const dotClass = cn(
              'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              isDone && 'border-primary bg-primary text-primary-foreground',
              isCurrent && 'border-primary bg-primary/15 text-primary',
              !isDone && !isCurrent && 'border-border bg-background text-muted-foreground/50',
            )
            const labelClass = cn(
              'mt-2 text-center text-[11px] leading-tight max-w-[110px]',
              isCurrent && 'font-semibold text-foreground',
              isDone && 'font-medium text-foreground',
              !isDone && !isCurrent && 'text-muted-foreground/60',
            )
            const connectorClass = cn(
              'absolute left-1/2 top-3.5 h-0.5 w-full',
              isDone ? 'bg-primary' : 'bg-border',
            )
            return (
              <div key={step.key} className="relative flex flex-1 flex-col items-center">
                {!isLast && <div className={connectorClass} aria-hidden />}
                <div className={dotClass}>
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isCurrent ? (
                    <Hourglass className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-2 w-2" />
                  )}
                </div>
                <span className={labelClass}>{step.label}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// Off-path banner — only renders for rejected/cancelled/rescheduled
// terminal states. Reschedule-request banners (vendor-proposed /
// homeowner-proposed) are separate surfaces already in the main render;
// this banner covers the terminal-state cases that don't have a dedicated
// banner.
function OffPathStatusBanner({ status }: { status: LeadStatus }) {
  if (status === 'rejected') {
    return (
      <Card className="border-red-300/60 bg-red-50/50 dark:bg-red-950/20 dark:border-red-700/40">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-700 dark:text-red-400">
            <X className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Vendor declined this lead</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The vendor isn't able to take on this project. You can submit it to another vendor from your projects list.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }
  if (status === 'cancelled') {
    return (
      <Card className="border-zinc-300/60 bg-zinc-50/50 dark:bg-zinc-900/30 dark:border-zinc-700/40">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-500/15 text-zinc-700 dark:text-zinc-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Appointment cancelled</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              This appointment has been cancelled. Reach out to your vendor if you'd like to reschedule.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }
  return null
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
    </div>
  )
}

// Photo 314 polish — section-grouped Project Items. Each row is tagged with
// a category derived from the SERVICE_CATALOG group identity (selections
// loop) or from a static map (universal/service-specific entries). Render
// pass groups rows by `section` and emits uppercase-muted headers matching
// the existing PRICE / PROJECT ITEMS treatment.
type ProjectItemSection =
  | 'Service Type'
  | 'Materials'
  | 'Repair Materials'
  | 'Add-Ons'
  | 'Roof Details'
  | 'Site Dimensions'
  | 'Permits'
  | 'Attachments'

type ProjectItemRow = {
  section: ProjectItemSection
  label: string
  detail?: string
  // PR-333 — structured chip-attrs for hoist-common-spec detection.
  // When every row in a section shares the same chip-tuple, the
  // renderer lifts them to a single section-header row ("All
  // Windows: Single Hung • White Frame • ...") and omits per-row
  // chips. If chips diverge, per-row chips render unhoisted.
  chips?: string[]
}

const PROJECT_ITEM_SECTION_ORDER: ProjectItemSection[] = [
  'Service Type',
  'Materials',
  'Repair Materials',
  'Add-Ons',
  'Roof Details',
  'Site Dimensions',
  'Permits',
  'Attachments',
]

function humanizeId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Group-id → section anchor. SERVICE_CATALOG group identity supplies the
// natural category boundary; unknown groups fall back to Materials so new
// catalog additions render somewhere reasonable until categorized.
function sectionForGroup(groupId: string): ProjectItemSection {
  switch (groupId) {
    case 'service_type':
      return 'Service Type'
    case 'material':
    case 'products':
      return 'Materials'
    case 'repair_materials':
      return 'Repair Materials'
    case 'addons':
      return 'Add-Ons'
    default:
      return 'Materials'
  }
}

function buildProjectItemRows(
  item: CartItem,
  projectPermit?: 'yes' | 'no',
): ProjectItemRow[] {
  const rows: ProjectItemRow[] = []
  const service = SERVICE_CATALOG.find((s) => s.id === item.serviceId)

  // Universal: humanize selections via SERVICE_CATALOG, attach quantity from
  // selectionQuantities / addonLinearFt / customSizeSqft. Pure-flag selections
  // (no quantity) render as label-only. Section assigned by group identity.
  for (const [groupId, optionIds] of Object.entries(item.selections ?? {})) {
    const group = service?.optionGroups.find((g) => g.id === groupId)
    const section = sectionForGroup(groupId)
    for (const optId of optionIds) {
      const option = group?.options.find((o) => o.id === optId)
      const label = option?.label ?? humanizeId(optId)

      const linearFt =
        item.roofAddonLinearFt?.[optId] ?? item.addonLinearFt?.[optId]
      const customSqft = item.customSizeSqft?.[optId]
      const qty = item.selectionQuantities?.[optId]

      let detail: string | undefined
      if (linearFt !== undefined && linearFt > 0) {
        detail = `${linearFt.toLocaleString()} ft`
        if (optId === 'gutters' && item.gutterDropsConfig) {
          const dc = item.gutterDropsConfig
          detail += ` (+ ${dc.drops} drop${dc.drops === 1 ? '' : 's'} over ${dc.floors}fl)`
        }
      } else if (customSqft !== undefined && customSqft > 0) {
        detail = `${customSqft.toLocaleString()} sqft`
      } else if (qty !== undefined && qty > 0) {
        detail = `Qty: ${qty}`
      }
      rows.push({ section, label, detail })
    }
  }

  // Universal: satellite-measured area + perimeter (driveway/pergola/pool/fence).
  if (item.areaSqft !== undefined && item.areaSqft > 0) {
    rows.push({ section: 'Site Dimensions', label: 'Area', detail: `${item.areaSqft.toLocaleString()} sqft` })
  }
  if (item.perimeterFt !== undefined && item.perimeterFt > 0) {
    rows.push({ section: 'Site Dimensions', label: 'Perimeter', detail: `${item.perimeterFt.toLocaleString()} ft` })
  }

  // Service-specific: roofing.
  if (item.roofMeasurement && item.roofMeasurement.areaSqft > 0) {
    const m = item.roofMeasurement
    rows.push({
      section: 'Roof Details',
      label: 'Roof Area',
      detail: `${m.areaSqft.toLocaleString()} sqft`,
    })
    rows.push({
      section: 'Roof Details',
      label: 'Pitch',
      detail: m.pitch,
    })
  }
  // Project-level permit: prefer sentProject.projectPermit snapshot; fall
  // back to legacy per-item roofPermit for entries persisted pre-PR-140.
  // Permit is project-level not roofing-specific — render the row for any
  // service when the choice is set. Q1-rename: "Permit pulled (vendor)" to
  // disambiguate from homeowner-self-attest "Permit required" on lead row.
  const permitChoice = projectPermit ?? item.roofPermit
  if (permitChoice) {
    rows.push({
      section: 'Permits',
      label: 'Permit pulled (vendor)',
      detail: permitChoice === 'yes' ? 'Yes' : 'No',
    })
  }

  // Service-specific: pool addon counts (named keys, not option-id keyed).
  const addonQty = item.addonQuantities ?? {}
  const namedAddons: Array<[keyof typeof addonQty, string]> = [
    ['ledCount', 'LED Lights'],
    ['bubblerCount', 'Bubblers'],
    ['laminarJets', 'Laminar Jets'],
    ['waterfalls', 'Waterfalls'],
  ]
  for (const [key, label] of namedAddons) {
    const n = addonQty[key]
    if (typeof n === 'number' && n > 0) {
      rows.push({ section: 'Add-Ons', label, detail: `Qty: ${n}` })
    }
  }

  // Service-specific: windows / doors configurator entries — count each line.
  // PR-333 — split chip-attrs onto row.chips for hoist-common-spec polish:
  // when every line in the section shares the same spec, the renderer
  // hoists chips to a single header row. quantity stays on the label.
  const buildConfiguratorChips = (e: { size: string; type: string; frameColor: string; glassColor: string; glassType: string }): string[] => {
    const chips: string[] = []
    if (e.size) chips.push(e.size)
    if (e.type) chips.push(humanizeId(e.type))
    if (e.frameColor) chips.push(`${humanizeId(e.frameColor)} Frame`)
    if (e.glassColor) chips.push(`${humanizeId(e.glassColor)} Glass`)
    if (e.glassType) chips.push(humanizeId(e.glassType))
    return chips
  }
  const winSel = item.windowSelections ?? []
  for (let i = 0; i < winSel.length; i++) {
    const w = winSel[i]
    if (w.quantity > 0) {
      rows.push({
        section: 'Materials',
        label: `Window ${i + 1}`,
        detail: `Qty: ${w.quantity}`,
        chips: buildConfiguratorChips(w),
      })
    }
  }
  const doorSel = item.doorSelections ?? []
  for (let i = 0; i < doorSel.length; i++) {
    const d = doorSel[i]
    if (d.quantity > 0) {
      rows.push({
        section: 'Materials',
        label: `Door ${i + 1}`,
        detail: `Qty: ${d.quantity}`,
        chips: buildConfiguratorChips(d),
      })
    }
  }

  // Service-specific: garage door config (single).
  if (item.garageDoorSelection) {
    const g = item.garageDoorSelection
    if (g.type) rows.push({ section: 'Materials', label: 'Garage Door Type', detail: humanizeId(g.type) })
    if (g.size) rows.push({ section: 'Materials', label: 'Garage Door Size', detail: g.size })
    if (g.color) rows.push({ section: 'Materials', label: 'Garage Door Color', detail: humanizeId(g.color) })
    if (g.glass) rows.push({ section: 'Materials', label: 'Garage Door Glass', detail: humanizeId(g.glass) })
  }

  // Service-specific: metal roof config. Q2 resolved via configurator
  // source-read — roofSize is in squares (1 square = 100 sqft). Render
  // singular "1 square" when count === 1.
  if (item.metalRoofSelection) {
    const mr = item.metalRoofSelection
    if (mr.color) {
      rows.push({ section: 'Materials', label: 'Metal Roof Color', detail: humanizeId(mr.color) })
    }
    if (mr.roofSize) {
      const n = Number(mr.roofSize)
      const detail = Number.isFinite(n) && n > 0
        ? `${n.toLocaleString()} square${n === 1 ? '' : 's'}`
        : mr.roofSize
      rows.push({ section: 'Materials', label: 'Metal Roof Size', detail })
    }
  }

  // Universal: photos count + notes (truncate ~120 chars).
  const photoCount = item.itemPhotos?.length ?? 0
  if (photoCount > 0) {
    rows.push({
      section: 'Attachments',
      label: 'Photos',
      detail: `${photoCount} photo${photoCount === 1 ? '' : 's'} attached`,
    })
  }
  if (item.itemNotes && item.itemNotes.trim().length > 0) {
    const trimmed = item.itemNotes.trim()
    const trunc =
      trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed
    rows.push({ section: 'Attachments', label: 'Notes', detail: trunc })
  }

  return rows
}

// PR-333 — section identity for the chip-tuple hoist. When every row in a
// section has the same `chips` array, return that array so the renderer
// can lift it into a single hoisted header row. Returns null when chips
// diverge (or when no row carries chips) so the renderer falls back to
// per-row chip display.
function hoistedChipsForSection(rows: ProjectItemRow[]): string[] | null {
  if (rows.length === 0) return null
  const withChips = rows.filter((r) => r.chips && r.chips.length > 0)
  if (withChips.length === 0 || withChips.length !== rows.length) return null
  const sig = JSON.stringify(withChips[0].chips)
  const allSame = withChips.every((r) => JSON.stringify(r.chips) === sig)
  return allSame ? (withChips[0].chips ?? null) : null
}

function ProjectItemsList({
  item,
  projectPermit,
}: {
  item: CartItem
  projectPermit?: 'yes' | 'no'
}) {
  const rows = buildProjectItemRows(item, projectPermit)
  // PR-333 — folder-pattern collapse per section. Default-expanded so
  // scannability matches pre-photo-320 behavior; tap section header to
  // toggle. Keyed by ProjectItemSection so state survives between rows
  // without touching parent state shape.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  if (rows.length === 0) return null

  const grouped = new Map<ProjectItemSection, ProjectItemRow[]>()
  for (const row of rows) {
    const bucket = grouped.get(row.section) ?? []
    bucket.push(row)
    grouped.set(row.section, bucket)
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4" data-project-items-grid>
      {PROJECT_ITEM_SECTION_ORDER.map((section) => {
        const sectionRows = grouped.get(section)
        if (!sectionRows || sectionRows.length === 0) return null
        const hoisted = hoistedChipsForSection(sectionRows)
        const isCollapsed = collapsed[section] === true
        return (
          <div
            key={section}
            className="flex flex-col gap-1.5"
            data-project-items-section={section}
          >
            <button
              type="button"
              className="flex items-center gap-1.5 self-start text-left"
              onClick={() => setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }))}
              aria-expanded={!isCollapsed}
              data-project-items-section-toggle
            >
              <ChevronRight
                className={cn(
                  'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                  !isCollapsed && 'rotate-90',
                )}
              />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section}
                {sectionRows.length > 1 && (
                  <span className="ml-1 text-muted-foreground/70">({sectionRows.length})</span>
                )}
              </p>
            </button>
            {!isCollapsed && (
              <>
                {hoisted && hoisted.length > 0 && (
                  <div
                    className="flex flex-wrap items-center gap-1"
                    data-project-items-hoisted-chips
                  >
                    <span className="text-[11px] text-muted-foreground">All {section.toLowerCase()}:</span>
                    {hoisted.map((c) => (
                      <Badge key={c} variant="secondary" className="text-[10px] font-normal">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
                <ul className="flex flex-col gap-1">
                  {sectionRows.map((r, i) => (
                    <li
                      key={`${r.label}-${i}`}
                      className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                    >
                      <div className="flex flex-1 flex-wrap items-center gap-1">
                        <span className="text-muted-foreground">{r.label}</span>
                        {!hoisted && r.chips && r.chips.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.chips.map((c) => (
                              <Badge
                                key={c}
                                variant="secondary"
                                className="text-[10px] font-normal"
                              >
                                {c}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      {r.detail && (
                        <span className="text-right font-medium text-foreground tabular-nums">
                          {r.detail}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
