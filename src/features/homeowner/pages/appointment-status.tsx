import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Calendar, MapPin, Phone, Mail, DollarSign, Clock, FileText, Shield, ChevronLeft, UserCheck, RefreshCw, Check, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { ReschedulePickerDialog } from '@/components/shared/reschedule-picker-dialog'
import { MOCK_LEADS, MOCK_VENDORS } from '@/lib/mock-data'
import { useProjectsStore } from '@/stores/projects-store'
import { cn } from '@/lib/utils'
import type { LeadStatus } from '@/types'

const statusTimeline: Record<string, { label: string; time: string; status: LeadStatus }[]> = {
  'L-0001': [
    { label: 'Lead submitted', time: 'Apr 7, 2:22 PM', status: 'pending' },
  ],
  'L-0002': [
    { label: 'Lead submitted', time: 'Apr 8, 9:45 AM', status: 'pending' },
  ],
  'L-0004': [
    { label: 'Lead submitted', time: 'Apr 5, 11:30 AM', status: 'pending' },
    { label: 'Visit confirmed', time: 'Apr 5, 2:00 PM', status: 'confirmed' },
    { label: 'Vendor requested reschedule', time: 'Apr 6, 9:00 AM', status: 'rescheduled' },
  ],
}

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
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const leadConfirmedAtByLead = useProjectsStore((s) => s.leadConfirmedAtByLead)
  const repAssignedAtByLead = useProjectsStore((s) => s.repAssignedAtByLead)
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
  const mockLead = MOCK_LEADS.find((l) => l.id === id)
  const sentProject = !mockLead
    ? sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === id)
    : undefined
  // Ship #220 — dropped the `?? MOCK_LEADS[0]` last-resort fallback. That
  // pattern worked pre-#217 when MOCK_LEADS was pre-seeded; post-#217 the
  // fixture is empty so MOCK_LEADS[0] is undefined, and downstream
  // `baseLead.id` accesses crashed on any /home/appointments/<unknown-id>
  // URL. Same latent-crash-tied-to-fixture-invariant class as the
  // MOCK_VENDORS.find(!) pattern fixed in #218+#219, expanded to
  // empty-array-indexed-as-non-empty. Now explicitly null when nothing
  // resolves, with an empty-state render below.
  const baseLead: typeof MOCK_LEADS[number] | undefined = mockLead
    ?? (sentProject
      ? ({
          id: `L-${sentProject.id.slice(0, 4).toUpperCase()}`,
          homeowner_id: 'ho-current',
          vendor_id: 'v-1', // display-only; real vendor lookup lives on sentProject.contractor
          project: sentProject.item.serviceName,
          value: 0,
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
        } as unknown as typeof MOCK_LEADS[number])
      : undefined)

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
          We couldn't find an appointment matching this link. It may have been removed or the URL may be stale.
        </p>
        <Button asChild size="lg" className="h-11 px-6">
          <Link to="/home">Back to home</Link>
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
  // Must be declared BEFORE baseTimeline/dynamicTimeline consumer block —
  // apollo caught TDZ on ship #72 when dynamicTimeline referenced assignedRep
  // before its initializer. Declaration order matters for minified bundles.
  const assignedRep =
    assignedRepByLead[lead.id] ??
    sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === lead.id)?.assignedRep

  const baseTimeline = statusTimeline[lead.id] ?? [
    { label: 'Lead submitted', time: 'Recently', status: 'pending' as LeadStatus },
  ]
  // Dynamic timeline entries appended when the lead is post-confirm AND has
  // an assigned rep. Two entries (per kratos msg 1776660496402): "Vendor
  // confirmed visit" and "Representative assigned — <name>." Timestamps
  // resolved per ship #166: mock-lead path reads from leadConfirmedAtByLead
  // + repAssignedAtByLead maps; sentProject path reads .confirmedAt +
  // .repAssignedAt fields. Falls back to empty for pre-#166 persisted
  // entries — renderer omits the time line when falsy.
  const matchedSentProject = sentProjects.find(
    (p) => `L-${p.id.slice(0, 4).toUpperCase()}` === lead.id,
  )
  const confirmedAtIso =
    leadConfirmedAtByLead[lead.id] ?? matchedSentProject?.confirmedAt
  const repAssignedAtIso =
    repAssignedAtByLead[lead.id] ?? matchedSentProject?.repAssignedAt
  function formatTimelineTime(iso: string | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  const dynamicTimeline: { label: string; time: string; status: LeadStatus }[] = []
  if (lead.status === 'confirmed' && assignedRep) {
    dynamicTimeline.push({
      label: 'Vendor confirmed visit',
      time: formatTimelineTime(confirmedAtIso),
      status: 'confirmed',
    })
    dynamicTimeline.push({
      label: `Representative assigned — ${assignedRep.name}`,
      time: formatTimelineTime(repAssignedAtIso),
      status: 'confirmed',
    })
  }
  const timeline = [...baseTimeline, ...dynamicTimeline]

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
                      : undefined
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Status Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-1.5 bottom-1.5 w-0.5 bg-border" />

                <div className="flex flex-col gap-5">
                  {timeline.map((event, i) => (
                    <div key={i} className="relative flex items-start gap-3">
                      <div
                        className={cn(
                          'absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background',
                          statusPulse[event.status]
                        )}
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {event.label}
                        </p>
                        {event.time && (
                          <p className="text-xs text-muted-foreground">{event.time}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Project Details — project-scoped fields (Project / Price / Vendor)
            plus the Project Pack section. Split from Homeowner Info per Rod's
            directive (kratos msg 1776650664847) so each card reads as one
            coherent unit instead of 7 mixed fields. */}
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
              <DetailRow
                icon={DollarSign}
                label="Price"
                value={`$${lead.value.toLocaleString()}`}
              />
              {vendor && (
                <DetailRow
                  icon={FileText}
                  label="Vendor"
                  value={vendor.company}
                />
              )}

              {/* Pack items — scoped to the project, belongs here. */}
              <div className="mt-2 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Project Pack
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(lead.pack_items).map(([, items]) =>
                    items.map((item) => (
                      <Badge key={item} variant="secondary" className="text-[10px]">
                        {item.replace(/_/g, ' ')}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Representative — only shown once the vendor has assigned one.
            Sits between Project Details and Homeowner Info — vendor-contact
            info reads as a bridge between project-scoped and homeowner-scoped. */}
        {assignedRep && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
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

        {/* Homeowner Info — homeowner-scoped contact fields only. */}
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
              <DetailRow icon={MapPin} label="Address" value={lead.address} />
              <DetailRow icon={Phone} label="Phone" value={lead.phone} />
              <DetailRow icon={Mail} label="Email" value={lead.email} />
              <DetailRow
                icon={Shield}
                label="Building Permit"
                value={lead.permit_choice ? 'Yes' : 'No'}
              />
            </CardContent>
          </Card>
        </motion.div>
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
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText
  label: string
  value: string
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
