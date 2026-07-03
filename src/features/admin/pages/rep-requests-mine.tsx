// Concierge Rep Request — rep-scoped "My Requests" queue.
// Mobile-first: single-column list with route-driven detail < lg
// (tapping a row navigates to ./:id which renders the detail view
// only; back button restores the list). Two-pane on lg+ matching the
// admin queue shape. admin can view this surface too (PURE-SEPARATE
// role enum, admin permission-set is a SUPERSET of rep).
//
// COMMIT 3 SCAFFOLD: list query lands in helios's commit 2.5; mark
// visited / mark project-ready / start-build actions land in
// commit 5 alongside the rep mutation hooks. Sticky-bottom action
// bar on detail view is mobile-first per iris §5.

import { useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { ClipboardList, MapPin, Camera, CheckCheck, FileText } from 'lucide-react'
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

// Rep workflow filters — rep only ever touches assigned rows, so the
// surface narrows to the in-flight states they own.
const FILTER_STATUSES: ReadonlyArray<RepRequestStatus> = [
  'new',
  'scheduled',
  'visited',
  'project_ready',
]

interface MineRow {
  id: string
  status: RepRequestStatus
  homeowner: string
  address: string
  description: string
  scheduledFor: string | null
  age: string
}

// SCAFFOLD-ONLY synthetic rows for the rep's assigned bucket. Replaced
// by helios's list query in commit 2.5 (filter: assigned_rep_id =
// auth.uid()).
const SYNTH_ROWS: MineRow[] = [
  { id: 'mine-1', status: 'scheduled', homeowner: 'John Smith', address: '456 Oak Ave, Springfield FL', description: 'Bathroom remodel', scheduledFor: 'Tomorrow 10:00 AM', age: '2h' },
  { id: 'mine-2', status: 'visited', homeowner: 'Mary Johnson', address: '789 Pine Rd, Coral Gables FL', description: 'Roof replacement', scheduledFor: null, age: '1d' },
]

export default function RepRequestsMinePage() {
  const { selectedId, setSelectedId, statusFilter, setStatusFilter } = useRepRequestQueueParams()

  const rows = useMemo(() => {
    if (!statusFilter) return SYNTH_ROWS
    return SYNTH_ROWS.filter((r) => r.status === statusFilter)
  }, [statusFilter])

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-6">
      <PageHeader
        title="My Requests"
        description="Concierge requests assigned to you"
      />

      <div
        className={cn(
          // Mobile: stack the panes and hide whichever is "behind" the
          // route. Lg: side-by-side fixed-width list + flex detail.
          'grid gap-4 lg:grid-cols-[288px_1fr] lg:h-[calc(100vh-220px)] lg:min-h-[500px]',
        )}
      >
        <Card
          className={cn(
            'rounded-xl shadow-sm flex flex-col overflow-hidden',
            // On mobile, hide the list when a row is pinned so the
            // detail card gets the full viewport.
            selectedId && 'hidden lg:flex',
          )}
        >
          <div className="p-3 border-b">
            <div className="flex flex-wrap gap-1.5" data-testid="rep-mine-filter-row">
              <FilterPill
                label="All"
                active={statusFilter === null}
                onClick={() => setStatusFilter(null)}
                testStatus="all"
              />
              {FILTER_STATUSES.map((s) => (
                <FilterPill
                  key={s}
                  label={STATUS_LABELS[s]}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                  testStatus={s}
                />
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto" data-testid="rep-mine-queue-list">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                <ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {statusFilter ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} requests` : 'No assigned requests'}
                </p>
              </div>
            ) : (
              rows.map((r) => {
                const isActive = selectedId === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    data-testid="rep-mine-queue-item"
                    data-id={r.id}
                    data-status={r.status}
                    className={cn(
                      'w-full flex flex-col items-start gap-1.5 p-3 text-left border-b transition-colors hover:bg-muted/50',
                      isActive && 'bg-primary/5 lg:border-l-2 lg:border-l-primary',
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
                    {r.scheduledFor && (
                      <p className="text-[11px] text-primary font-medium">{r.scheduledFor}</p>
                    )}
                    <span
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

        <MineDetailPane
          selectedId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      </div>
    </motion.div>
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
      data-testid="rep-mine-filter-pill"
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

function MineDetailPane({
  selectedId,
  onBack,
}: {
  selectedId: string | null
  onBack: () => void
}) {
  const { detail, actions, isLoading, refetch } = useRepRequestDetail(selectedId)
  const m = useRepRequestActions(selectedId)

  if (!selectedId) {
    return (
      <Card
        className="rounded-xl shadow-sm hidden lg:flex items-center justify-center"
        data-testid="rep-mine-detail-pane"
      >
        <div className="text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Select a request to start your visit workflow</p>
        </div>
      </Card>
    )
  }

  // SCAFFOLD: synthetic row until commit 2.5 hooks the list cache.
  const synth = SYNTH_ROWS.find((r) => r.id === selectedId)
  const row = detail
    ? {
        homeowner: detail.contactName,
        address: detail.address,
        description: detail.description ?? '',
        status: detail.status,
        scheduledFor: null as string | null,
      }
    : synth
      ? {
          homeowner: synth.homeowner,
          address: synth.address,
          description: synth.description,
          status: synth.status,
          scheduledFor: synth.scheduledFor,
        }
      : null

  if (isLoading && !row) {
    return (
      <Card className="rounded-xl shadow-sm flex items-center justify-center" data-testid="rep-mine-detail-pane">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Card>
    )
  }

  if (!row) {
    return (
      <Card className="rounded-xl shadow-sm flex flex-col items-center justify-center p-6" data-testid="rep-mine-detail-pane">
        <p className="text-sm text-muted-foreground mb-3">Request not found.</p>
        <Button variant="outline" size="sm" onClick={onBack} className="lg:hidden">
          Back to list
        </Button>
      </Card>
    )
  }

  // Rep action gating mirrors the contract: mark visited requires
  // status='scheduled' (or 'new' if rep visits same-day); mark project
  // ready requires status='visited'. Defaults below approximate this
  // until commit 2.5 wires the real per-status derivation.
  const canMarkVisited =
    actions?.canMarkVisited ?? (row.status === 'scheduled' || row.status === 'new')
  const canMarkProjectReady = actions?.canMarkProjectReady ?? (row.status === 'visited')
  const canBuildProject = actions?.canBuildProject ?? (row.status === 'visited')

  return (
    <Card
      className="rounded-xl shadow-sm flex flex-col overflow-hidden lg:overflow-hidden"
      data-testid="rep-mine-detail-pane"
    >
      <div className="p-4 border-b bg-muted/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="lg:hidden mb-2 -ml-2"
          data-testid="rep-mine-detail-back"
        >
          ← Back to list
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold font-heading truncate">{row.description || '(no description)'}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground truncate">{row.homeowner}</p>
            <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3" />
              {row.address}
            </p>
            {row.scheduledFor && (
              <p className="mt-1 text-xs text-primary font-medium">{row.scheduledFor}</p>
            )}
          </div>
          <span
            data-testid="rep-mine-detail-status-pill"
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset',
              STATUS_PILL_CLASSES[row.status],
            )}
          >
            {STATUS_LABELS[row.status]}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 lg:pb-4">
        {/* TODO commit 5: homeowner photos gallery, requested-visit
            buckets pill row, rep assessment notes textarea (saved into
            assessment_notes), and the "Build Project on Behalf" form
            (mirrors the homeowner intake flow but writes the project
            row server-side via build-project-on-behalf edge fn). */}
        <div className="rounded-lg bg-muted/40 p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <Camera className="h-4 w-4" />
            Homeowner photos
          </p>
          <p className="text-xs text-muted-foreground">Gallery lands in commit 5.</p>
        </div>
        <div className="rounded-lg border border-dashed border-border p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Assessment notes
          </p>
          <p className="text-xs text-muted-foreground">Notes editor lands in commit 5.</p>
        </div>
      </div>

      {/* Sticky-bottom action bar — mobile-first per iris §5.
          Buttons are inert in the scaffold; commit 5 wires the rep
          mutation hooks. Pinned bottom on all viewports so the rep
          doesn't have to scroll to advance status mid-visit. */}
      <div
        className="p-3 border-t bg-background flex flex-wrap gap-2 sticky bottom-0 lg:static"
        data-testid="rep-mine-detail-action-bar"
      >
        {canMarkVisited && (
          <Button
            size="sm"
            disabled={!actions || m.mutating}
            onClick={async () => {
              // TODO commit 5: open assessment-notes sheet inline,
              // pass the entered text. Empty string keeps the no-op
              // contract truthful while the editor is still scaffold.
              const r = await m.markVisited({ assessmentNotes: '' })
              if (r.ok) await refetch()
            }}
            data-testid="rep-mine-mark-visited-btn"
            title={actions ? undefined : 'Mark visited lands in commit 5'}
            className="flex-1 min-w-[140px]"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Mark Visited
          </Button>
        )}
        {canBuildProject && (
          <Button
            size="sm"
            variant="outline"
            disabled={!actions || m.mutating}
            onClick={async () => {
              // TODO commit 5: open the build-on-behalf form sheet
              // (service picker + scope + estimated amount). The
              // server INSERTs a projects row keyed to the
              // homeowner_id of this rep request.
              const r = await m.buildProjectOnBehalf({
                serviceId: '',
                scope: '',
                estimatedAmountCents: null,
                notes: null,
              })
              if (r.ok) await refetch()
            }}
            data-testid="rep-mine-build-project-btn"
            title={actions ? undefined : 'Build project lands in commit 5'}
            className="flex-1 min-w-[140px]"
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            Build Project
          </Button>
        )}
        {canMarkProjectReady && (
          <Button
            size="sm"
            disabled={!actions || m.mutating}
            onClick={async () => {
              // TODO commit 5: project_id comes from detail.projectId
              // once useRepRequestDetail returns the joined row from
              // commit 2.5 (Build Project step writes the FK back).
              const projectId = detail?.projectId ?? ''
              const r = await m.markProjectReady(projectId)
              if (r.ok) await refetch()
            }}
            data-testid="rep-mine-mark-project-ready-btn"
            title={actions ? undefined : 'Mark project ready lands in commit 5'}
            className="flex-1 min-w-[140px]"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Mark Project Ready
          </Button>
        )}
      </div>
    </Card>
  )
}
