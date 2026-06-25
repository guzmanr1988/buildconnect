// Concierge Rep Request — admin god-view queue (two-pane on lg,
// route-driven detail on mobile). Queue list + detail share one
// component: detail-pin via :id route param, status filter via
// ?status= search param (URL-source-of-truth, owned by
// useRepRequestQueueParams).
//
// COMMIT 3 SCAFFOLD: the queue-list query is not yet wired (helios's
// commit 2.5 lands the list hook). Synthetic queue rows below keep
// the surface reviewable end-to-end. The detail pane already consumes
// useRepRequestDetail via the homeowner status page pattern; the
// admin assign/advance/cancel actions land in commit 5 once
// useRepRequestActions returns the per-role permission set.

import { useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { Inbox, MapPin, UserPlus, CheckCheck, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { useRepRequestQueueParams } from '@/hooks/use-rep-request-queue-params'
import { useRepRequestDetail } from '@/hooks/use-rep-request-detail'
import { useRepRequestActions } from '@/hooks/use-rep-request-actions'
import {
  STATUS_LABELS,
  STATUS_PILL_CLASSES,
  type RepRequestStatus,
} from '@/features/admin/rep-requests/rep-request-contract'
import { cn } from '@/lib/utils'

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

interface QueueRow {
  id: string
  status: RepRequestStatus
  homeowner: string
  address: string
  description: string
  age: string
  assignedRep: string | null
}

// SCAFFOLD-ONLY synthetic rows. Replaced by helios's list query in
// commit 2.5 — list shape will be approximately this plus
// requested_visit_times + last_activity_at.
const SYNTH_ROWS: QueueRow[] = [
  { id: 'demo-1', status: 'new', homeowner: 'Jane Doe', address: '123 Main St, Anytown FL', description: 'Kitchen renovation', age: '12m', assignedRep: null },
  { id: 'demo-2', status: 'scheduled', homeowner: 'John Smith', address: '456 Oak Ave, Springfield FL', description: 'Bathroom remodel', age: '2h', assignedRep: 'Alex Rep' },
  { id: 'demo-3', status: 'visited', homeowner: 'Mary Johnson', address: '789 Pine Rd, Coral Gables FL', description: 'Roof replacement', age: '1d', assignedRep: 'Alex Rep' },
  { id: 'demo-4', status: 'project_ready', homeowner: 'Bob Williams', address: '321 Elm St, Miami FL', description: 'HVAC install', age: '3d', assignedRep: 'Sam Rep' },
]

export default function RepRequestsPage() {
  const { selectedId, setSelectedId, statusFilter, setStatusFilter } = useRepRequestQueueParams()

  const rows = useMemo(() => {
    if (!statusFilter) return SYNTH_ROWS
    return SYNTH_ROWS.filter((r) => r.status === statusFilter)
  }, [statusFilter])

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
        />
        <DetailPane selectedId={selectedId} />
      </div>
    </motion.div>
  )
}

interface QueueListPaneProps {
  rows: QueueRow[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  statusFilter: RepRequestStatus | null
  onFilterChange: (s: RepRequestStatus | null) => void
}

function QueueListPane({ rows, selectedId, onSelect, statusFilter, onFilterChange }: QueueListPaneProps) {
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
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4">
            <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {statusFilter ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} requests` : 'No rep requests'}
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
                  <span className="text-sm font-semibold truncate">{r.homeowner}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{r.age}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate w-full">{r.description}</p>
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

function DetailPane({ selectedId }: { selectedId: string | null }) {
  const { detail, actions, isLoading, refetch } = useRepRequestDetail(selectedId)
  const m = useRepRequestActions(selectedId)

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

  // SCAFFOLD: synthetic row lookup until helios's commit 2.5 wires the
  // list query into the cache that useRepRequestDetail reads from. The
  // hook signature is correct; only the data source is stubbed.
  const synth = SYNTH_ROWS.find((r) => r.id === selectedId)
  const row = detail
    ? {
        homeowner: detail.contactName,
        address: detail.address,
        description: detail.description ?? '',
        status: detail.status,
        assignedRep: detail.assignedRepId,
      }
    : synth
      ? {
          homeowner: synth.homeowner,
          address: synth.address,
          description: synth.description,
          status: synth.status,
          assignedRep: synth.assignedRep,
        }
      : null

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

  // Action gating — scaffold defaults to admin permission-set until
  // commit 2.5 wires the hook-returned actions object. canAdvance is
  // true while the request isn't in a terminal state.
  const canAssign = actions?.canAssignRep ?? true
  const canAdvance = actions?.canAdvanceStatus ?? (row.status !== 'cancelled' && row.status !== 'contractor_selected')
  const canCancel = actions?.canCancel ?? (row.status !== 'cancelled' && row.status !== 'contractor_selected')

  return (
    <Card className="rounded-xl shadow-sm flex flex-col overflow-hidden" data-testid="admin-rep-requests-detail-pane">
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold font-heading truncate">{row.description || '(no description)'}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground truncate">{row.homeowner}</p>
            <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3" />
              {row.address}
            </p>
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
            {row.assignedRep ?? <span className="text-muted-foreground italic">Unassigned</span>}
          </p>
        </div>

        {/* TODO commit 5: photos grid, requested_visit_times pill row,
            assessment notes editor for assigned rep. Backed by
            detail.photos + detail.requestedVisitTimes once
            useRepRequestDetail returns the real row. */}
        <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground text-center">
          Photos, availability buckets, and assessment notes land in commit 5.
        </div>
      </div>

      <div className="p-3 border-t bg-background flex flex-wrap gap-2 justify-end">
        {canAssign && (
          <Button
            size="sm"
            variant="outline"
            disabled={!actions || m.mutating}
            onClick={async () => {
              // TODO commit 5: open assign dialog → repId from rep
              // picker. For now, null unassigns or no-op when actions
              // gate is still scaffold-null.
              const r = await m.assignRep(null)
              if (r.ok) await refetch()
            }}
            data-testid="admin-rep-requests-assign-btn"
            title={actions ? undefined : 'Assignment dialog lands in commit 5'}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" />
            {row.assignedRep ? 'Reassign' : 'Assign'}
          </Button>
        )}
        {canAdvance && (
          <Button
            size="sm"
            variant="outline"
            disabled={!actions || m.mutating}
            onClick={async () => {
              // TODO commit 5: next-status picker driven by current
              // status (scheduled→visited→project_ready→contractor_selected).
              const r = await m.advanceStatus(row.status)
              if (r.ok) await refetch()
            }}
            data-testid="admin-rep-requests-advance-btn"
            title={actions ? undefined : 'Status advance lands in commit 5'}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Advance Status
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
            title={actions ? undefined : 'Cancel + refund lands in commit 5'}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Cancel + Refund
          </Button>
        )}
      </div>
    </Card>
  )
}
