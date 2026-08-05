// Concierge Rep Request — admin god-view queue (two-pane on lg,
// route-driven detail on mobile). Queue list + detail share one
// component: detail-pin via :id route param, status filter via
// ?status= search param (URL-source-of-truth, owned by
// useRepRequestQueueParams).
//
// Data: useRepRequestsList drives the queue pane (react-query +
// Realtime, status filter applied server-side). useRepRequestDetail
// drives the right pane keyed off selectedId. useRepRequestActions
// owns the 6 mutation paths (4 RLS-direct + 2 invoke per
// hephaestus's commit-5 anchor bundle).

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import { Inbox, Mail, MapPin, Phone, CheckCheck, XCircle, Hammer, CalendarClock, Check, CalendarX } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { useRepRequestQueueParams } from '@/hooks/use-rep-request-queue-params'
import { useRepRequestDetail } from '@/hooks/use-rep-request-detail'
import { useRepRequestActions } from '@/hooks/use-rep-request-actions'
import { useRepRequestsList, type RepRequestListRow } from '@/hooks/use-rep-requests-list'
import { useReps } from '@/hooks/use-reps'
import { NotesBlock } from '@/features/admin/components/rep-request-notes-block'
import { useAuthStore } from '@/stores/auth-store'
import {
  APPOINTMENT_STATUS_LABELS,
  STATUS_LABELS,
  STATUS_PILL_CLASSES,
  parseProjectTypes,
  type RepRequestDetail,
  type RepRequestStatus,
} from '@/features/admin/rep-requests/rep-request-contract'
import { cn } from '@/lib/utils'

function formatVisitDatetime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function nowDatetimeLocalMin(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Admin status-advance next-state mapping. Mig 105 status-transition
// guard enforces legality server-side; this function selects the one
// legal admin-driven forward step that does NOT require side-effects.
// visited→project_ready is excluded because it requires a project row
// to exist first (build-project-on-behalf edge fn handles the
// privileged INSERT, then markProjectReady chains the status flip);
// that path is its own Build Project button.
const STATUS_ADVANCE_MAP: Partial<Record<RepRequestStatus, RepRequestStatus>> = {
  new: 'scheduled',
  scheduled: 'visited',
  project_ready: 'contractor_selected',
}

function nextAdvanceStatus(s: RepRequestStatus): RepRequestStatus | null {
  return STATUS_ADVANCE_MAP[s] ?? null
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
} satisfies Variants

// Filter set is the subset of RepRequestStatus that admins routinely
// triage by. pending_payment + charge_failed are excluded from the
// pill row since they're system-state — they surface as system badges
// on the row itself, not as a filter axis.
const FILTER_STATUSES: ReadonlyArray<RepRequestStatus> = [
  'new',
  'scheduled',
  'visited',
  'project_ready',
  'contractor_selected',
  'cancelled',
]

export default function RepRequestsPage() {
  const { selectedId, setSelectedId, statusFilter, setStatusFilter } = useRepRequestQueueParams()
  const { rows, isLoading, error, refetch: refetchList } = useRepRequestsList(statusFilter)

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  )

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-6">
      <PageHeader
        title="Rep Requests"
        description="Concierge requests awaiting assignment or in flight"
      />

      <div className="grid grid-cols-1 lg:grid-cols-[288px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        <QueueListPane
          rows={rows}
          selectedId={selectedId}
          onSelect={setSelectedId}
          statusFilter={statusFilter}
          onFilterChange={setStatusFilter}
          isLoading={isLoading}
          error={error}
        />
        <DetailPane selectedId={selectedId} selectedRow={selectedRow} refetchList={refetchList} />
      </div>
    </motion.div>
  )
}

interface QueueListPaneProps {
  rows: RepRequestListRow[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  statusFilter: RepRequestStatus | null
  onFilterChange: (s: RepRequestStatus | null) => void
  isLoading: boolean
  error: Error | null
}

function QueueListPane({
  rows,
  selectedId,
  onSelect,
  statusFilter,
  onFilterChange,
  isLoading,
  error,
}: QueueListPaneProps) {
  return (
    <Card className="rounded-xl shadow-sm flex flex-col overflow-hidden">
      <div className="p-3 border-b">
        <div className="flex flex-wrap gap-1.5" data-testid="admin-rep-requests-filter-row">
          <FilterPill
            label="All"
            active={statusFilter === null}
            onClick={() => onFilterChange(null)}
            testStatus="all"
          />
          {FILTER_STATUSES.map((s) => (
            <FilterPill
              key={s}
              label={STATUS_LABELS[s]}
              active={statusFilter === s}
              onClick={() => onFilterChange(s)}
              testStatus={s}
            />
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" data-testid="admin-rep-requests-queue-list">
        {isLoading ? (
          <div
            className="flex flex-col items-center justify-center text-center py-12 px-4"
            data-testid="admin-rep-requests-queue-loading"
          >
            <p className="text-sm text-muted-foreground">Loading rep requests…</p>
          </div>
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center text-center py-12 px-4"
            data-testid="admin-rep-requests-queue-error"
          >
            <p className="text-sm text-destructive">Couldn't load rep requests.</p>
            <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4">
            <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {statusFilter
                ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} requests`
                : 'No rep requests'}
            </p>
          </div>
        ) : (
          rows.map((r) => {
            const isActive = selectedId === r.id
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r.id)}
                data-testid="admin-rep-requests-queue-item"
                data-id={r.id}
                data-status={r.status}
                className={cn(
                  'w-full flex flex-col items-start gap-1.5 p-3 text-left border-b transition-colors hover:bg-muted/50',
                  isActive && 'bg-primary/5 border-l-2 border-l-primary',
                )}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-sm font-semibold truncate">{r.homeownerName}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{r.age}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate w-full">{parseProjectTypes(r.description).text}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate w-full">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{r.address}</span>
                </p>
                <span
                  data-testid="admin-rep-requests-queue-item-status-pill"
                  className={cn(
                    'mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                    STATUS_PILL_CLASSES[r.status],
                  )}
                >
                  {STATUS_LABELS[r.status]}
                </span>
              </button>
            )
          })
        )}
      </div>
    </Card>
  )
}

function FilterPill({
  label,
  active,
  onClick,
  testStatus,
}: {
  label: string
  active: boolean
  onClick: () => void
  testStatus: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="admin-rep-requests-filter-pill"
      data-status={testStatus}
      data-active={active ? 'true' : 'false'}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80',
      )}
    >
      {label}
    </button>
  )
}

interface DetailPaneProps {
  selectedId: string | null
  selectedRow: RepRequestListRow | null
  refetchList: () => Promise<void>
}

function DetailPane({ selectedId, selectedRow, refetchList }: DetailPaneProps) {
  const { detail, actions, isLoading, refetch } = useRepRequestDetail(selectedId)
  const m = useRepRequestActions(selectedId)
  const { reps } = useReps()
  const viewerRole = useAuthStore((s) => s.role)

  if (!selectedId) {
    return (
      <Card className="rounded-xl shadow-sm flex items-center justify-center" data-testid="admin-rep-requests-detail-pane">
        <div className="text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Select a request to view details</p>
        </div>
      </Card>
    )
  }

  // Detail hook is canonical for the per-row state; selectedRow comes
  // from the list query and supplies the assigned-rep display name
  // (detail hook only exposes assignedRepId — the name join lives in
  // the list query). Both rails react to the same Realtime channel so
  // they stay in lockstep without manual reconciliation.
  const row = detail
    ? {
        homeowner: detail.contactName || selectedRow?.homeownerName || '',
        homeownerId: detail.homeownerId,
        contactPhone: detail.contactPhone,
        contactEmail: detail.contactEmail,
        address: detail.address,
        description: detail.description ?? '',
        status: detail.status,
        assignedRepName: selectedRow?.assignedRepName ?? null,
      }
    : null
  const parsedDescription = useMemo(
    () => parseProjectTypes(row?.description),
    [row?.description],
  )

  if (isLoading && !row) {
    return (
      <Card className="rounded-xl shadow-sm flex items-center justify-center" data-testid="admin-rep-requests-detail-pane">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Card>
    )
  }

  if (!row) {
    return (
      <Card className="rounded-xl shadow-sm flex items-center justify-center" data-testid="admin-rep-requests-detail-pane">
        <p className="text-sm text-muted-foreground">Request not found.</p>
      </Card>
    )
  }

  const canAssign = actions?.canAssignRep ?? false
  const canAdvance = actions?.canAdvanceStatus ?? false
  const canCancel = actions?.canCancel ?? false

  return (
    <Card className="rounded-xl shadow-sm flex flex-col overflow-hidden" data-testid="admin-rep-requests-detail-pane">
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold font-heading truncate">{parsedDescription.text || '(no description)'}</h2>
            {row.homeowner ? (
              row.homeownerId ? (
                <Link
                  to={`/admin/homeowners/${row.homeownerId}`}
                  data-testid="admin-rep-requests-detail-homeowner-link"
                  className="mt-0.5 block text-sm text-primary hover:underline truncate"
                >
                  {row.homeowner}
                </Link>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground truncate">{row.homeowner}</p>
              )
            ) : null}
            <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3" />
              {row.address}
            </p>
            {row.contactPhone ? (
              <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1 truncate">
                <Phone className="h-3 w-3" />
                <a
                  href={`tel:${row.contactPhone}`}
                  data-testid="admin-rep-requests-detail-phone"
                  className="hover:text-foreground hover:underline"
                >
                  {row.contactPhone}
                </a>
              </p>
            ) : null}
            {row.contactEmail ? (
              <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1 truncate">
                <Mail className="h-3 w-3" />
                <a
                  href={`mailto:${row.contactEmail}`}
                  data-testid="admin-rep-requests-detail-email"
                  className="hover:text-foreground hover:underline"
                >
                  {row.contactEmail}
                </a>
              </p>
            ) : null}
          </div>
          <span
            data-testid="admin-rep-requests-detail-status-pill"
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset',
              STATUS_PILL_CLASSES[row.status],
            )}
          >
            {STATUS_LABELS[row.status]}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Assigned rep
          </p>
          <p className="text-sm" data-testid="admin-rep-requests-detail-assigned">
            {row.assignedRepName ?? <span className="text-muted-foreground italic">Unassigned</span>}
          </p>
        </div>

        {detail && (
          <AppointmentBlock
            detail={detail}
            isAdmin
            mutating={m.mutating}
            onAccept={async () => {
              const r = await m.updateAppointment({ action: 'accept' })
              if (r.ok) await Promise.all([refetch(), refetchList()])
            }}
            onReschedule={async (proposedVisitAt, rescheduleNotes) => {
              const r = await m.updateAppointment({
                action: 'reschedule',
                proposedVisitAt,
                rescheduleNotes,
              })
              if (r.ok) await Promise.all([refetch(), refetchList()])
              return r
            }}
          />
        )}

        {parsedDescription.types.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Project types
            </p>
            <div
              data-testid="admin-rep-requests-detail-project-types"
              className="flex flex-wrap gap-1.5"
            >
              {parsedDescription.types.map((t, i) => (
                <Badge
                  key={`${t}-${i}`}
                  variant="outline"
                  data-testid="admin-rep-requests-detail-project-type-chip"
                  data-type={t}
                >
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {selectedId && (
          // V1 LIVE — presentation + read-write thread. addNote wired to
          // useRepRequestActions.addNote, which routes to the
          // add-rep-request-note service-role edge fn (hephaestus contract
          // msg 1782836746462). Rows land in rep_request_events
          // (event_type='note_added') and are append-only by the mig 102
          // trigger — no edit/delete path even with service role.
          <NotesBlock
            repRequestId={selectedId}
            viewerRole={viewerRole}
            addNote={m.addNote}
          />
        )}

      </div>

      <div className="p-3 border-t bg-background flex flex-wrap gap-2 justify-end items-center">
        {canAssign && (
          <select
            value={detail?.assignedRepId ?? ''}
            disabled={!actions || m.mutating}
            onChange={async (e) => {
              const next = e.target.value || null
              const r = await m.assignRep(next)
              if (r.ok) await Promise.all([refetch(), refetchList()])
            }}
            data-testid="admin-rep-requests-assign-select"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">— Unassigned —</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        {canAdvance && nextAdvanceStatus(row.status) && (
          <Button
            size="sm"
            variant="outline"
            disabled={!actions || m.mutating}
            onClick={async () => {
              const next = nextAdvanceStatus(row.status)
              if (!next) return
              const r = await m.advanceStatus(next)
              if (r.ok) await refetch()
            }}
            data-testid="admin-rep-requests-advance-btn"
            title={`Advance to ${STATUS_LABELS[nextAdvanceStatus(row.status)!]}`}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Advance → {STATUS_LABELS[nextAdvanceStatus(row.status)!]}
          </Button>
        )}
        {row.status === 'visited' && actions?.canBuildProject && (
          <Button
            size="sm"
            variant="outline"
            disabled={!actions || m.mutating}
            onClick={async () => {
              // Chained: build-project-on-behalf (privileged INSERT) →
              // markProjectReady (RLS-direct status flip + project_id
              // stamp). Default service_id='roofing' covers the dev
              // walkthrough; a proper service-picker ships in the iris
              // detail-pane follow-on alongside photo/availability UX.
              // Strip the intake-encoded "[Project Types: A, B] " prefix
              // (use-rep-request-submit.ts:202) so the created project's
              // stored scope is the notes text only, never the raw
              // bracket tag. Empty-after-strip falls back to the same
              // "Concierge-built project" placeholder as no-description.
              const scope = parseProjectTypes(row.description).text || 'Concierge-built project'
              const build = await m.buildProjectOnBehalf({
                serviceId: 'roofing',
                scope,
                estimatedAmountCents: null,
                notes: null,
              })
              if (!build.ok) return
              const flip = await m.markProjectReady(build.projectId)
              if (flip.ok) await refetch()
            }}
            data-testid="admin-rep-requests-build-project-btn"
            title="Build project for homeowner and flip to Project Ready"
          >
            <Hammer className="h-3.5 w-3.5 mr-1" />
            Build Project + Mark Ready
          </Button>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            disabled={!actions || m.mutating}
            onClick={async () => {
              const r = await m.cancel()
              if (r.ok) await refetch()
            }}
            data-testid="admin-rep-requests-cancel-btn"
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Cancel + Refund
          </Button>
        )}
      </div>
    </Card>
  )
}

// Phase 2 appointment block — homeowner-picked datetime + admin Accept |
// Reschedule actions. Branches on appointment_status:
//   null OR proposed  → "Requested by homeowner" + Accept | Reschedule actions
//   accepted          → "Visit scheduled for ..." (read-only)
//   rescheduled       → read-only "New time proposed: ..." with notes;
//                       homeowner-accept arm paused per kratos msg
//                       1782434876035 until hephaestus follow-up fn —
//                       no dead-end CTA shown.
// Legacy rows (requestedVisitAt=null pre-mig-108) collapse to a "no
// datetime on file" notice with no actions.
interface AppointmentBlockProps {
  detail: RepRequestDetail
  isAdmin: boolean
  mutating: boolean
  onAccept: () => Promise<void>
  onReschedule: (
    proposedVisitAt: string,
    rescheduleNotes: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}

function AppointmentBlock({
  detail,
  isAdmin,
  mutating,
  onAccept,
  onReschedule,
}: AppointmentBlockProps) {
  const [open, setOpen] = useState(false)
  const status = detail.appointmentStatus
  const requestedAt = detail.requestedVisitAt
  const proposedAt = detail.proposedVisitAt
  const notes = detail.rescheduleNotes

  // Legacy row (no homeowner-picked datetime on file) — render-only notice.
  if (!requestedAt && !proposedAt) {
    return (
      <div
        className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground"
        data-testid="admin-rep-requests-appointment-block"
        data-appointment-status="legacy"
      >
        No homeowner-picked visit time on file (pre-Phase 2 row).
      </div>
    )
  }

  // Accepted — final read-only state. The visit is locked in.
  if (status === 'accepted') {
    return (
      <div
        className="rounded-lg border bg-emerald-50 border-emerald-200 p-3 text-sm dark:bg-emerald-950/30 dark:border-emerald-800"
        data-testid="admin-rep-requests-appointment-block"
        data-appointment-status="accepted"
      >
        <div className="flex items-start gap-2">
          <CalendarClock className="h-4 w-4 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-emerald-800 dark:text-emerald-200">
              Visit scheduled for {formatVisitDatetime(requestedAt)}
            </p>
            <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-300/80">
              {APPOINTMENT_STATUS_LABELS.accepted}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Rescheduled — admin counter-proposed; homeowner-accept arm not yet
  // wired (paused per kratos msg 1782434876035 pending hephaestus
  // follow-up fn). Read-only display with the proposed time + the
  // required notes the admin entered.
  if (status === 'rescheduled') {
    return (
      <div
        className="rounded-lg border bg-amber-50 border-amber-200 p-3 text-sm dark:bg-amber-950/30 dark:border-amber-800"
        data-testid="admin-rep-requests-appointment-block"
        data-appointment-status="rescheduled"
      >
        <div className="flex items-start gap-2">
          <CalendarClock className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              New time proposed: {formatVisitDatetime(proposedAt)}
            </p>
            {requestedAt && (
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                Homeowner originally picked {formatVisitDatetime(requestedAt)}.
              </p>
            )}
            {notes && (
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                Admin notes: {notes}
              </p>
            )}
            <p className="mt-1 text-xs italic text-amber-700/70 dark:text-amber-300/70">
              Waiting for the homeowner to confirm.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Default — proposed (homeowner just picked). Admin can Accept or
  // Reschedule. The reschedule modal collects the new proposed datetime
  // + REQUIRED notes (empty submit blocked client-side).
  return (
    <div
      className="rounded-lg border bg-muted/30 p-3 text-sm space-y-3"
      data-testid="admin-rep-requests-appointment-block"
      data-appointment-status={status ?? 'proposed'}
    >
      <div className="flex items-start gap-2">
        <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-medium">
            Homeowner requested {formatVisitDatetime(requestedAt)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {APPOINTMENT_STATUS_LABELS.proposed}
          </p>
        </div>
      </div>
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={mutating}
            onClick={() => onAccept()}
            data-testid="admin-rep-requests-appointment-accept-btn"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Accept time
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={mutating}
            onClick={() => setOpen(true)}
            data-testid="admin-rep-requests-appointment-reschedule-btn"
          >
            <CalendarX className="h-3.5 w-3.5 mr-1" />
            Reschedule
          </Button>
        </div>
      )}
      {open && (
        <RescheduleModal
          defaultDatetime={requestedAt ?? ''}
          mutating={mutating}
          onSubmit={async (proposed, notesArg) => {
            const r = await onReschedule(proposed, notesArg)
            if (r.ok) setOpen(false)
            return r
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  )
}

interface RescheduleModalProps {
  defaultDatetime: string
  mutating: boolean
  onSubmit: (
    proposedVisitAt: string,
    rescheduleNotes: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  onCancel: () => void
}

function RescheduleModal({
  defaultDatetime,
  mutating,
  onSubmit,
  onCancel,
}: RescheduleModalProps) {
  // Seed with the homeowner-requested datetime so the admin only edits
  // when truly counter-proposing. datetime-local wants YYYY-MM-DDTHH:MM
  // local-tz; the ISO from the DB carries Z, so trim.
  const initial = (() => {
    if (!defaultDatetime) return ''
    const d = new Date(defaultDatetime)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })()
  const [proposed, setProposed] = useState<string>(initial)
  const [notes, setNotes] = useState<string>('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const minDatetime = nowDatetimeLocalMin()
  const notesValid = notes.trim().length > 0
  const proposedValid =
    !!proposed && Number.isFinite(Date.parse(proposed)) && Date.parse(proposed) > Date.now()

  return (
    <div
      className="rounded-lg border bg-background p-3 space-y-3"
      data-testid="admin-rep-requests-reschedule-modal"
    >
      <p className="text-sm font-semibold">Counter-propose a visit time</p>
      <div>
        <Label htmlFor="rri-resched-when" className="text-xs">
          New proposed datetime
        </Label>
        <Input
          id="rri-resched-when"
          type="datetime-local"
          data-testid="admin-rep-requests-reschedule-datetime"
          value={proposed}
          min={minDatetime}
          onChange={(e) => setProposed(e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="rri-resched-notes" className="text-xs">
          Notes for the homeowner <span className="text-destructive">*required</span>
        </Label>
        <Textarea
          id="rri-resched-notes"
          data-testid="admin-rep-requests-reschedule-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tell the homeowner why this time works better."
          rows={3}
          className="mt-1 resize-none"
        />
      </div>
      {submitError && (
        <p
          role="alert"
          className="text-xs text-destructive"
          data-testid="admin-rep-requests-reschedule-error"
        >
          {submitError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={mutating}
          data-testid="admin-rep-requests-reschedule-cancel-btn"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={mutating || !notesValid || !proposedValid}
          onClick={async () => {
            setSubmitError(null)
            const r = await onSubmit(new Date(proposed).toISOString(), notes)
            if (!r.ok) setSubmitError(r.error)
          }}
          data-testid="admin-rep-requests-reschedule-submit-btn"
        >
          Send counter-proposal
        </Button>
      </div>
    </div>
  )
}
