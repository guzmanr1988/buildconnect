import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  Inbox, CalendarCheck, MapPin,
  Phone, Mail, Ruler, FileCheck, CreditCard, CalendarClock,
  Check, X, RotateCcw, Clock, ChevronDown, ChevronUp, Handshake, Archive,
  UserCheck, Pencil, Info, Upload, FileText, Send,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/shared/status-badge'
import { resolveLeadStatusLabel } from '@/lib/lead-status-label'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { ReschedulePickerDialog } from '@/components/shared/reschedule-picker-dialog'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useVendorLeadStages, STAGE_COLOR_BY_KEY, STAGE_PULSE_BY_KEY } from '@/lib/vendor-lead-stages'
import type { LeadStageKey, LeadExt } from '@/lib/vendor-lead-stages'
import { DIALOG_HORIZONTAL_GRID } from '@/lib/dialog-layouts'
import { getReviewStatusDisplay } from '@/lib/review-status-display'
import { useVendorEmployeesStore } from '@/stores/vendor-employees-store'
import { useVendorHomeownerDocsStore } from '@/stores/vendor-homeowner-documents-store'
import { useFlagThreadStore } from '@/stores/flag-thread-store'
import { useVendorScope, useResolvedVendor } from '@/lib/vendor-scope'
import { cn } from '@/lib/utils'
import { deriveInitials } from '@/lib/initials'
import type { Lead, VendorRep } from '@/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Ship #293 — Lead Workflow extracted from VendorDashboard per Rodolfo
// directive ("more clean dashboard" + tab "Lead Workflow"). This page
// owns the 5-status-tile pipeline + Lead Detail Modal + all sub-flows
// (reschedule, sold, reject, cancel review, edit rep). Dashboard now
// holds only Vendor Profile Card + KPI Row + a link to here.
export default function VendorLeadWorkflow() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const updateProjectStatus = useProjectsStore((s) => s.updateStatus)
  const updateProjectBooking = useProjectsStore((s) => s.updateBooking)
  const markProjectSold = useProjectsStore((s) => s.markSold)
  const assignProjectRep = useProjectsStore((s) => s.assignRep)
  const assignRepByLead = useProjectsStore((s) => s.assignRepByLead)
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const setLeadStatus = useProjectsStore((s) => s.setLeadStatus)
  // Ship #295 — vendor-marked manual completion. Stamps completedAt on
  // the sentProject; bucketing reads completedAt-presence to override
  // age-based 90d auto-transition.
  const markCompleted = useProjectsStore((s) => s.markCompleted)
  // Ship #311 — lead-id-keyed manual-completion override; covers
  // MOCK_LEADS without sentProject backing. Bucketing + label
  // derivation read effective completedAt downstream so the override
  // propagates to all consumers transparently.
  const setLeadCompletedAt = useProjectsStore((s) => s.setLeadCompletedAt)
  // Ship #191 — reschedule request actions + map read. Map-entry read
  // is stable (undefined or RescheduleRequest object) per the banked
  // zustand-selector-stable-reference rule.
  const rescheduleRequestsMap = useProjectsStore((s) => s.rescheduleRequestsByLead)
  const requestReschedule = useProjectsStore((s) => s.requestReschedule)
  const approveReschedule = useProjectsStore((s) => s.approveReschedule)
  const counterReschedule = useProjectsStore((s) => s.counterReschedule)
  const rejectReschedule = useProjectsStore((s) => s.rejectReschedule)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  const approveCancellation = useProjectsStore((s) => s.approveCancellation)
  const denyCancellation = useProjectsStore((s) => s.denyCancellation)
  // Ship #224 — Account Rep dropdown data source. Reads the vendor's
  // active account reps from useVendorEmployeesStore (same store that
  // backs the Account Reps tab at /vendor/account-reps). Filters to
  // status='active' so inactive/on-leave reps don't appear as
  // assignable. Mapped to VendorRep shape so the existing
  // assignProjectRep / assignRepByLead actions accept them
  // unchanged. Replaces the prior vendor.reps (MOCK_VENDORS-scoped)
  // source per Rodolfo's "open list from account rep tab to select"
  // directive.
  const employeesMap = useVendorEmployeesStore((s) => s.employeesByVendor)

  // Auth guard — redirect unauth'd or non-vendor roles to /login.
  useEffect(() => {
    if (profile !== null && profile.role !== 'vendor') {
      navigate('/login', { replace: true })
    }
  }, [profile, navigate])

  // Ship #225 — swapped dashboard's inline mockVendorId computation to
  // useVendorScope hook. Prior inline did UUID-map lookup ONLY, missing
  // the #222 LS-alias that routes generic Vendor demo login to 'v-1'.
  // Result: dashboard's accountReps + mockLeads + vendor resolution all
  // computed 'VENDOR_ID = profile.id' (Supabase UUID) for Vendor demo,
  // and the account-reps dropdown landed empty because SEED_EMPLOYEES
  // is keyed on 'v-1' not the UUID. useVendorScope has the LS-alias +
  // email-match + UUID-map chain already wired, so swapping here unifies
  // the resolver across dashboard + lead-inbox + banking + calendar.
  // Single-resolver-for-vendor-scope.
  const { vendorId: VENDOR_ID } = useVendorScope()

  // Ship #224 — Account Rep list for the assign-rep dropdown. Reads
  // active employees from useVendorEmployeesStore keyed by VENDOR_ID,
  // maps to VendorRep shape so existing assignRepByLead / assignRep
  // actions accept them unchanged. Empty when vendor has no active
  // account reps; dropdown then surfaces an empty-state linking to
  // /vendor/account-reps for add.
  const accountReps: VendorRep[] = useMemo(() => {
    const roster = employeesMap[VENDOR_ID] ?? []
    return roster
      .filter((e) => e.status === 'active')
      .map((e) => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`,
        role: e.title,
        phone: e.phone,
      }))
  }, [employeesMap, VENDOR_ID])

  // Vendor display-data: extracted to useResolvedVendor (ship #263).
  // Role-gate is preserved by the helper — a homeowner profile (e.g.
  // a QA persona left in auth-store during a pre-redirect first paint)
  // resolves to null instead of being synthesized as a vendor. Rod P0
  // 2026-04-20 (kratos msg 1776665548710 via apollo sweep): Paradise-
  // demo vendor profile rendered 'Ana Martinez' (qa-1 persona name)
  // before the redirect fired — that guard now lives in vendor-scope.ts.
  const vendor = useResolvedVendor()

  // Ship #303 — extracted to useVendorLeadStages hook (src/lib/
  // vendor-lead-stages.ts). The hook owns mockLeads vendor-scope
  // filter, sentProjects-to-Lead synthesis, leadStatusOverrides
  // merge, isCancelledLead predicate (#171/#184 lifecycle), manual-
  // completion-wins-over-age bucketing (#295), and the 5 stage
  // buckets. Same source-of-truth now powers /vendor dashboard
  // compact summary row. Pre-#303 this entire derivation lived
  // inline here; format-SoT-shared-helper #103 trigger met at n=2
  // consumers (lead-workflow + dashboard preview).
  const {
    leads,
    stages: {
      new: newLeads,
      confirmed: confirmedLeads,
      sold: projectSold,
      completed: projectsCompleted,
      cancelled: cancelledProjects,
    },
    isCancelledLead,
  } = useVendorLeadStages()

  // Ship #293 — pipelineValue + bookedThisMonth + winRate moved with KPI
  // Row to /vendor (dashboard). activeLeads kept here since the page-
  // header description references it.
  const activeLeads = useMemo(
    () => leads.filter((l) => l.status === 'pending' || l.status === 'confirmed' || l.status === 'rescheduled'),
    [leads],
  )

  // Sheet / dialog state
  const [selected, setSelected] = useState<Lead | null>(null)
  // Ship #238 — capture-first state for sub-dialog handlers (reschedule +
  // reject). The Layer 5 bulletproof-close useEffect (line 362-368) wipes
  // `selected` when sheetOpen flips false; sub-dialogs that open via
  // `setSheetOpen(false)` were silently no-op'ing on Confirm because the
  // handler's `if (selected)` guard saw null. Banked sync-before-await
  // discipline: capture at click-time, don't read async. Single shared
  // state covers both sub-dialog flows since only one is ever open at a
  // time. Cleared on dialog close to avoid stale carry-over.
  const [subDialogLead, setSubDialogLead] = useState<Lead | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  // Ship #191 — vendor counter-propose dialog.
  const [vendorCounterOpen, setVendorCounterOpen] = useState(false)
  const [soldDialogOpen, setSoldDialogOpen] = useState(false)
  // Ship #313 — contract requirement on Mark as Sold per Rodolfo
  // "make it a requirement that vendor needs to upload their contract".
  // Dialog-local state until Confirm Sale; cleared on close.
  const [contractAmount, setContractAmount] = useState('')
  const [contractFile, setContractFile] = useState<{ filename: string; dataUrl: string } | null>(null)
  const addVendorHomeownerDoc = useVendorHomeownerDocsStore((s) => s.addDoc)
  // Ship #326 Phase A — flag-resolution thread + revised-contract upload state.
  const flagThreadsByProject = useFlagThreadStore((s) => s.threadsByProject)
  const appendThreadMessage = useFlagThreadStore((s) => s.appendMessage)
  const ensureLegacyFlagNoteSeed = useFlagThreadStore((s) => s.ensureLegacyFlagNoteSeed)
  const resetReviewStatus = useProjectsStore((s) => s.resetReviewStatus)
  const [replyText, setReplyText] = useState('')
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false)
  const [revisionContractFile, setRevisionContractFile] = useState<{ filename: string; dataUrl: string } | null>(null)
  const [revisionTargetProjectId, setRevisionTargetProjectId] = useState<string | null>(null)
  // Ship #295 — Project Completed confirm dialog. Lighter-confirm shape
  // (not full destructive-four-refinement) since the action is
  // acceleration of automatic 90d transition, not destruction.
  const [completedDialogOpen, setCompletedDialogOpen] = useState(false)
  // Ship #312 — separate lead-state for the Project Completed flow,
  // independent from `selected`. Reason: Layer-5 bulletproof-close
  // useEffect (line 224-230) wipes `selected` whenever sheetOpen
  // flips false. The #307a outside-button path never opens the modal
  // (sheetOpen stays false), so Layer-5 fires immediately on
  // setSelected(lead) and wipes it before Confirm can read it. Using
  // a separate state for the confirm-dialog lead breaks the race.
  const [completedDialogLead, setCompletedDialogLead] = useState<Lead | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  // Assign-rep flow: selectedRepId is the rep chosen in the new-lead modal
  // (Confirm is gated on it being non-empty). editRepOpen/editRep* drive the
  // post-confirm swap dialog opened from the confirmed-tab LeadCard.
  const [selectedRepId, setSelectedRepId] = useState<string>('')
  // Fallback path: when the authed vendor has no reps[] on file (e.g. Demo
  // Ship #224 — adhocRepName / editAdhocRepName state removed with the
  // free-form text-input fallback. Dropdown is now the sole input for
  // both Assign and Change Account Rep flows (per Rodolfo directive
  // "instead of typing the name open list from account rep tab").
  const [editRepOpen, setEditRepOpen] = useState(false)
  const [editRepLeadId, setEditRepLeadId] = useState<string>('')
  const [editRepChoice, setEditRepChoice] = useState<string>('')
  // Cancellation-request review dialog (Phase B).
  const [cancelReviewOpen, setCancelReviewOpen] = useState(false)
  const [cancelReviewLeadId, setCancelReviewLeadId] = useState<string>('')

  // Ship #293 — demoMode/demoDataHidden + Clear Demo Data flow moved
  // to /vendor (dashboard). This page handles only Lead Workflow tile
  // interactions; demo-data-clear is dashboard-level concern.
  const [rejectionReason, setRejectionReason] = useState('')

  // Section collapse state
  // Single-open accordion: at most one lead-status tile open at a time
  // (kratos msg 1776576047204). Null = all closed.
  // Ship #310 — deep-link from /vendor dashboard summary row via
  // ?stage=<key>. Reads URL param on mount and pre-opens the matching
  // tile so user lands on the stage they clicked. Once opened, user
  // toggle-action takes precedence (no further URL-param-driven
  // overrides on subsequent renders — only mount). Tile-id type
  // unified to LeadStageKey from vendor-lead-stages.ts SoT (#103
  // dropping the local LeadTileId duplicate).
  const [searchParams] = useSearchParams()
  const stageFromUrl = searchParams.get('stage') as LeadStageKey | null
  const validTileIds: LeadStageKey[] = ['new', 'confirmed', 'sold', 'completed', 'cancelled']
  const initialOpenTile: LeadStageKey | null = stageFromUrl && validTileIds.includes(stageFromUrl) ? stageFromUrl : null
  const [openTile, setOpenTile] = useState<LeadStageKey | null>(initialOpenTile)
  const toggleTile = (id: LeadStageKey) => setOpenTile((prev) => (prev === id ? null : id))

  // Layer 5 of bulletproof close (kratos msg 1776670030582): if sheetOpen
  // ever flips to false but selected is non-null, forcibly clear selected +
  // rep-picker state. This catches any path where Dialog closes via backdrop
  // tap / ESC / close-X without going through the Confirm handler. Also
  // catches the pathological case where the Confirm handler's setSheetOpen(false)
  // commits but selected somehow stays populated — next effect-cycle cleans.
  useEffect(() => {
    if (!sheetOpen && selected !== null) {
      console.log('[vendor-confirm] LAYER5_CLEANUP sheetOpen=false, forcing selected=null')
      setSelected(null)
      setSelectedRepId('')
    }
  }, [sheetOpen, selected])

  // Layer 5 of bulletproof close for Review Cancellation dialog (kratos msg
  // 1776672025175). Same pattern — if cancelReviewOpen flips false but the
  // leadId state is still populated, clean the leadId. Catches backdrop/ESC/
  // close-X paths that don't go through Approve/Deny handlers.
  useEffect(() => {
    if (!cancelReviewOpen && cancelReviewLeadId !== '') {
      console.log('[vendor-cancel-review] LAYER5_CLEANUP cancelReviewOpen=false, clearing leadId')
      setCancelReviewLeadId('')
    }
  }, [cancelReviewOpen, cancelReviewLeadId])

  const openLead = (lead: Lead) => {
    setSelected(lead)
    // Restore any previously-assigned rep for this lead so the selector
    // reflects reality if the modal is reopened pre-confirm.
    const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === lead.id)
    setSelectedRepId(sp?.assignedRep?.id ?? '')
    setSheetOpen(true)
  }

  // Helper: look up the assigned rep for a given lead-id. Checks both the
  // lead-keyed override map (covers MOCK_LEADS without a sentProject) AND the
  // sentProject.assignedRep. Order: override wins (latest vendor edit).
  const getAssignedRepForLead = (leadId: string): VendorRep | undefined => {
    const override = assignedRepByLead[leadId]
    if (override) return override
    const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === leadId)
    return sp?.assignedRep
  }

  const openEditRep = (leadId: string) => {
    const current = getAssignedRepForLead(leadId)
    setEditRepLeadId(leadId)
    // Ship #224 — prior flow pre-populated editAdhocRepName for adhoc
    // or no-reps-on-file cases. With dropdown-only input, only the
    // existing rep.id (if it's in accountReps) matters. Match by id
    // when possible; otherwise empty string (user picks from list).
    setEditRepChoice(current?.id ?? '')
    setEditRepOpen(true)
  }

  const openCancelReview = (leadId: string) => {
    setCancelReviewLeadId(leadId)
    setCancelReviewOpen(true)
  }

  // Bulletproof close on Approve/Deny handlers — kratos msg 1776672025175
  // Rodolfo reported Review Cancellation dialog stays open post-action. Same
  // pattern as vendor new-lead Confirm (#87) + homeowner cancellation Submit
  // (#90): try/finally close + setTimeout + rAF fallback with console traces.
  // Layer 5 cleanup on cancelReviewOpen transition handled in separate useEffect
  // below (forces setCancelReviewLeadId('') + setSelected(null) on close).
  const handleApproveCancellation = () => {
    if (!cancelReviewLeadId) {
      console.warn('[vendor-cancel-review] APPROVE early-return: no leadId')
      return
    }
    console.log('[vendor-cancel-review] APPROVE_FIRED layer=sync leadId=', cancelReviewLeadId)
    const leadIdSnapshot = cancelReviewLeadId
    try {
      approveCancellation(leadIdSnapshot)
    } catch (err) {
      console.error('[vendor-cancel-review] approve-body error, closing anyway:', err)
    } finally {
      console.log('[vendor-cancel-review] APPROVE_FIRED layer=finally')
      setCancelReviewOpen(false)
      setSelected(null)
      setSheetOpen(false)
    }
    setTimeout(() => {
      console.log('[vendor-cancel-review] APPROVE_FIRED layer=setTimeout')
      setCancelReviewOpen(false)
      setSelected(null)
      setSheetOpen(false)
    }, 0)
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        console.log('[vendor-cancel-review] APPROVE_FIRED layer=raf')
        setCancelReviewOpen(false)
        setSelected(null)
        setSheetOpen(false)
      })
    }
  }

  const handleDenyCancellation = () => {
    if (!cancelReviewLeadId) {
      console.warn('[vendor-cancel-review] DENY early-return: no leadId')
      return
    }
    console.log('[vendor-cancel-review] DENY_FIRED layer=sync leadId=', cancelReviewLeadId)
    const leadIdSnapshot = cancelReviewLeadId
    try {
      denyCancellation(leadIdSnapshot)
    } catch (err) {
      console.error('[vendor-cancel-review] deny-body error, closing anyway:', err)
    } finally {
      console.log('[vendor-cancel-review] DENY_FIRED layer=finally')
      setCancelReviewOpen(false)
    }
    setTimeout(() => {
      console.log('[vendor-cancel-review] DENY_FIRED layer=setTimeout')
      setCancelReviewOpen(false)
    }, 0)
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        console.log('[vendor-cancel-review] DENY_FIRED layer=raf')
        setCancelReviewOpen(false)
      })
    }
  }

  const handleSaveEditRep = () => {
    if (!editRepLeadId) return
    // Ship #224 — rep resolution via accountReps (useVendorEmployeesStore)
    // instead of vendor.reps (MOCK_VENDORS) + adhoc-text path. Dropdown
    // is the sole input; no fallback.
    const rep: VendorRep | undefined = accountReps.find((r) => r.id === editRepChoice)
    if (!rep) return
    assignRepByLead(editRepLeadId, rep)
    const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === editRepLeadId)
    if (sp) assignProjectRep(sp.id, rep)
    setEditRepOpen(false)
  }

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  } satisfies Variants
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  } satisfies Variants

  function LeadCard({ lead }: { lead: LeadExt }) {
    const rep = getAssignedRepForLead(lead.id)
    const cancelReq = cancellationRequestsByLead[lead.id]
    const hasPendingCancel = cancelReq?.status === 'pending'
    // Schedule-Approved affordance (ship #100 per kratos msg 1776714878659):
    // confirmed lead WITH rep assigned gets a green ring + inline 'Schedule
    // Approved' label. Pending-cancel (red ring) wins over confirmed-approval
    // (green ring) since the cancel is the more-urgent state.
    const isScheduleApproved = lead.status === 'confirmed' && !!rep && !hasPendingCancel
    // Ship #307 — Sold-Active inline Project Completed button. Surfaces
    // the action directly on the card per Rodolfo "available to press
    // button project completed". Routes through the same #295 lighter-
    // confirm dialog (setSelected + setCompletedDialogOpen) so accidental-
    // click protection + acceleration-not-destruction precondition stay
    // intact. Visible only for currently-active sold leads (status
    // 'completed' AND no completedAt yet AND not in cancelled bucket).
    // Ship #311 — gate now reads lead.completedAt (override-aware via
    // useVendorLeadStages enrichment) instead of sp.completedAt.
    // Covers MOCK_LEADS path that previously had button always-hidden
    // due to sp-missing gate.
    const showCompleteButton = lead.status === 'completed' && !(lead as Lead & { completedAt?: string }).completedAt && !isCancelledLead(lead)
    // Ship #316 — BuildConnect review-state badge on Sold Active +
    // Projects Completed leads. Only sold-status leads have a review;
    // skip for new/confirmed/rejected/cancelled leads.
    const isSoldStatus = lead.status === 'completed' && !isCancelledLead(lead)
    const reviewDisplay = isSoldStatus ? getReviewStatusDisplay(lead.reviewStatus) : null
    return (
      <Card
        className={cn(
          'rounded-xl shadow-sm hover:shadow-md transition cursor-pointer group',
          hasPendingCancel && 'ring-2 ring-destructive/40',
          isScheduleApproved && 'ring-2 ring-emerald-500/40 border-emerald-500/40'
        )}
        data-testid="lead-card"
        data-lead-id={lead.id}
        onClick={() => openLead(lead)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <AvatarInitials
                initials={deriveInitials(lead.homeowner_name)}
                color="#64748b"
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
                  {lead.homeowner_name}
                </p>
                <p className="text-sm font-bold text-foreground/90 mt-0.5 truncate">
                  {lead.project.split(' — ')[0]}
                </p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-sm font-bold">{fmt(lead.value)}</span>
                  <StatusBadge
                    status={lead.status}
                    label={
                      isCancelledLead(lead) && lead.status === 'rejected'
                        ? 'Cancelled'
                        : resolveLeadStatusLabel(lead as Lead & { soldAt?: string })
                    }
                  />
                  {/* Ship #316 — BuildConnect review-state badge for sold leads. */}
                  {reviewDisplay && (() => {
                    const ReviewIcon = reviewDisplay.icon
                    return (
                      <Badge className={cn('text-[10px] font-semibold gap-1 border-0', reviewDisplay.badgeClassName)}>
                        <ReviewIcon className="h-3 w-3" />
                        {reviewDisplay.label}
                      </Badge>
                    )
                  })()}
                  {hasPendingCancel && (
                    <Badge className="bg-destructive/10 text-destructive border border-destructive/30 text-[10px] font-semibold gap-1">
                      <X className="h-3 w-3" />
                      Cancellation requested
                    </Badge>
                  )}
                  {isScheduleApproved && (
                    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold gap-1">
                      <Check className="h-3 w-3" />
                      Schedule Approved
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">{fmtDate(lead.received_at)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{lead.id}</p>
            </div>
          </div>
          {rep && (
            <div className={cn(
              'mt-3 pt-3 border-t flex items-center justify-between gap-2',
              isScheduleApproved ? 'border-emerald-500/30' : 'border-border/50'
            )}>
              <div className="flex items-center gap-1.5 text-xs min-w-0">
                <UserCheck className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  isScheduleApproved ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'
                )} />
                <span className="text-muted-foreground">Rep:</span>
                <span className="font-semibold text-foreground truncate">{rep.name}</span>
                {rep.role && (
                  <span className="text-muted-foreground truncate">· {rep.role}</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => { e.stopPropagation(); openEditRep(lead.id) }}
                aria-label={`Edit rep for ${lead.id}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {showCompleteButton && (() => {
            // Ship #317 — gate Project Completed button on BuildConnect
            // approval per Rodolfo "if the project is pending approval
            // by buildconnect project completed button will be disabled
            // until approved by buildconnect". Render the button always
            // (visible-but-disabled communicates "exists, available
            // later"); only enable when reviewStatus === 'approved'.
            const reviewVariant = reviewDisplay?.variant ?? 'pending'
            const isApproved = reviewVariant === 'approved'
            const disabledHelpText = reviewVariant === 'flagged'
              ? 'Resolve BuildConnect flag first'
              : 'Awaiting BuildConnect approval'
            return (
              <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
                <Button
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!isApproved}
                  onClick={(e) => {
                    e.stopPropagation()
                    // Ship #312 — write to completedDialogLead (not
                    // selected) to avoid Layer-5 bulletproof-close race
                    // that wipes `selected` when sheetOpen=false.
                    setCompletedDialogLead(lead)
                    setCompletedDialogOpen(true)
                  }}
                >
                  <Check className="h-4 w-4 mr-1.5" />
                  Project Completed
                </Button>
                {!isApproved && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    {disabledHelpText}
                  </p>
                )}
              </div>
            )
          })()}
          {/* Ship #316 — flagged-state banner with reviewNote (Phase-2
              vendor-flag-visibility wiring per #131 precondition met). */}
          {reviewDisplay?.variant === 'flagged' && lead.reviewNote && (
            <div className={cn('mt-3 pt-3 border-t border-border/50')}>
              <div className={cn('rounded-lg p-2.5 text-xs', reviewDisplay.bannerClassName)}>
                <p className="font-semibold text-red-700 dark:text-red-400 mb-0.5">BuildConnect flag note:</p>
                <p className="text-red-800 dark:text-red-300 whitespace-pre-wrap">{lead.reviewNote}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  function LeadStatusTile({
    title,
    subtitle,
    subtitleColor,
    count,
    color,
    pulse,
    icon: Icon,
    open,
    onToggle,
    children,
  }: {
    title: string
    subtitle?: string
    subtitleColor?: string
    count: number
    color: string
    // Ship #310 — attention-grabbing pulse on the icon-square for
    // active-action stages (New Leads + Sold Active per LEAD_STAGES.pulse).
    pulse?: boolean
    icon: React.ElementType
    open: boolean
    onToggle: () => void
    children?: React.ReactNode
  }) {
    return (
      <Card
        className={cn(
          'overflow-hidden transition-all',
          open && 'ring-2 ring-primary/40 shadow-md'
        )}
      >
        {/* Summary row — click/keyboard target only on the header, so the expanded
            content inside can receive its own clicks without toggling collapse. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggle()
            }
          }}
          className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer select-none hover:bg-muted/30"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn('rounded-md p-1.5 shrink-0', color, pulse && 'animate-pulse')}>
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{title}</p>
              {subtitle && (
                <p className={cn('text-[10px] font-semibold uppercase tracking-wider leading-none mt-0.5', subtitleColor ?? 'text-muted-foreground')}>
                  {subtitle}
                </p>
              )}
            </div>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">{count}</Badge>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </div>
        {/* Expanded content — animated height/opacity transition (ship #98 per
            kratos msg 1776697863772). framer-motion AnimatePresence respects
            prefers-reduced-motion automatically — no-op when user has it set. */}
        <AnimatePresence initial={false}>
          {open && children && (
            <motion.div
              key="tile-expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/40 bg-muted/10 p-3">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    )
  }

  // Render an empty shell while auth hydrates (useEffect will redirect if the
  // profile resolves to a non-vendor role). Prevents a flash of "vendor.X" on
  // a null vendor before the auth guard fires.
  if (!vendor) {
    return (
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-3 sm:space-y-6">
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6 text-sm text-muted-foreground">Loading vendor dashboard…</CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-3 sm:space-y-6">
      {/* Ship #293 — Lead Workflow page header. Vendor Profile Card +
          KPI Row + Demo-data buttons live on /vendor (dashboard) post-
          extraction; this page is pipeline-stage focus only. */}
      <motion.div variants={item}>
        <h1 className="font-heading text-2xl font-bold">Lead Workflow</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activeLeads.length} active {activeLeads.length === 1 ? 'lead' : 'leads'} across the pipeline. Click any tile to expand.
        </p>
      </motion.div>

      {/* Lead Status Tiles — vertical accordion. Each tile owns its own expand
          content inline beneath its summary row (kratos msg 1776576002292). */}
      <motion.div variants={item} className="flex flex-col gap-2">
        <LeadStatusTile
          title="New Leads"
          count={newLeads.length}
          color={STAGE_COLOR_BY_KEY.new}
          pulse={STAGE_PULSE_BY_KEY.new}
          icon={Inbox}
          open={openTile === 'new'}
          onToggle={() => toggleTile('new')}
        >
          <div className="grid gap-3">
            {newLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No new leads at the moment.</p>
            ) : (
              newLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        </LeadStatusTile>
        <LeadStatusTile
          title="Scheduled Leads"
          count={confirmedLeads.length}
          color={STAGE_COLOR_BY_KEY.confirmed}
          pulse={STAGE_PULSE_BY_KEY.confirmed}
          icon={CalendarCheck}
          open={openTile === 'confirmed'}
          onToggle={() => toggleTile('confirmed')}
        >
          <div className="grid gap-3">
            {confirmedLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No scheduled leads yet.</p>
            ) : (
              confirmedLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        </LeadStatusTile>
        <LeadStatusTile
          title="Sold, Active"
          count={projectSold.length}
          color={STAGE_COLOR_BY_KEY.sold}
          pulse={STAGE_PULSE_BY_KEY.sold}
          icon={Handshake}
          open={openTile === 'sold'}
          onToggle={() => toggleTile('sold')}
        >
          <div className="grid gap-3">
            {projectSold.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active projects yet.</p>
            ) : (
              projectSold.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        </LeadStatusTile>
        <LeadStatusTile
          title="Projects Completed"
          count={projectsCompleted.length}
          color={STAGE_COLOR_BY_KEY.completed}
          icon={Archive}
          open={openTile === 'completed'}
          onToggle={() => toggleTile('completed')}
        >
          <div className="grid gap-3">
            {projectsCompleted.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No completed projects yet.</p>
            ) : (
              projectsCompleted.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        </LeadStatusTile>
        {/* Ship #184 (Rodolfo-direct 2026-04-21): unified Cancelled
            Projects tile — Rejected Leads tile eliminated per "in vendor
            rejected leads are the same as cancelled projects eliminate
            rejected leads". Icon color flipped zinc → destructive/red
            since the unified bucket represents 'deals that didn't
            happen' semantically, where the softer zinc was premised on
            the #171 rejected-vs-cancelled split being user-visible. */}
        <LeadStatusTile
          title="Cancelled Projects"
          count={cancelledProjects.length}
          color={STAGE_COLOR_BY_KEY.cancelled}
          icon={X}
          open={openTile === 'cancelled'}
          onToggle={() => toggleTile('cancelled')}
        >
          <div className="grid gap-3">
            {cancelledProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No cancelled projects.</p>
            ) : (
              cancelledProjects.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        </LeadStatusTile>
      </motion.div>

      {/* Lead Detail Modal — centered floating dialog with dark backdrop (Dialog primitive handles ESC + backdrop-click dismissal).
          Ship #308 — Bin-A horizontal-PC treatment: PC widens to
          sm:max-w-3xl + content sections wrap in 2-col grid (info-left
          + operations-right) on sm+. Mobile portrait preserved exactly
          as-is per Rodolfo "mobile no changes" strict directive. */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-md sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <div className="space-y-3">
              <DialogHeader className="space-y-1.5">
                <DialogTitle className="font-heading text-base font-bold uppercase tracking-wide leading-tight">
                  {selected.project.split(' — ')[0]}
                </DialogTitle>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={selected.status}
                    label={
                      isCancelledLead(selected) && selected.status === 'rejected'
                        ? 'Cancelled'
                        : resolveLeadStatusLabel(selected as Lead & { soldAt?: string })
                    }
                  />
                  <span className="text-xs text-muted-foreground">{selected.id}</span>
                </div>
              </DialogHeader>

              {/* Ship #191 — inbound reschedule banner. Homeowner
                  requested a new time; vendor can approve / counter /
                  reject. Only shows while request is pending; resolved
                  requests fall through. */}
              {(() => {
                const req = rescheduleRequestsMap[selected.id]
                if (!req || req.status !== 'pending' || req.requestedBy !== 'homeowner') return null
                return (
                  <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700/40 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <RotateCcw className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 text-sm">
                        <p className="font-semibold text-foreground">Homeowner requested a reschedule</p>
                        <p className="mt-1 text-foreground/80">
                          <span className="font-medium">{req.proposedDate} · {req.proposedTime}</span>
                          <span className="text-xs text-muted-foreground ml-1.5">
                            (was {req.originalDate} · {req.originalTime})
                          </span>
                        </p>
                        {req.reason && (
                          <p className="mt-1 text-xs text-muted-foreground italic">"{req.reason}"</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => {
                          approveReschedule(selected.id)
                          const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selected.id)
                          if (sp) {
                            updateProjectBooking(sp.id, { date: req.proposedDate, time: req.proposedTime })
                          }
                          toast.success('New time approved — homeowner notified.')
                        }}
                      >
                        <Check className="h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        onClick={() => setVendorCounterOpen(true)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Counter
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                        onClick={() => {
                          rejectReschedule(selected.id)
                          toast.success('Keeping the original time.')
                        }}
                      >
                        <X className="h-3 w-3" />
                        Keep original
                      </Button>
                    </div>
                  </div>
                )
              })()}

              {/* Ship #191 — outbound reschedule banner. Vendor proposed;
                  waiting on homeowner. Read-only status indicator. */}
              {(() => {
                const req = rescheduleRequestsMap[selected.id]
                if (!req || req.status !== 'pending' || req.requestedBy !== 'vendor') return null
                return (
                  <div className="rounded-lg border border-sky-300/60 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-700/40 p-3">
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-sky-700 dark:text-sky-400 shrink-0 mt-0.5" />
                      <div className="flex-1 text-sm">
                        <p className="font-semibold text-foreground">Reschedule proposal pending</p>
                        <p className="mt-1 text-foreground/80">
                          You proposed <span className="font-medium">{req.proposedDate} · {req.proposedTime}</span>.
                          Waiting on homeowner confirmation.
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Ship #308 — 2-column wrapper for PC (sm+). Mobile
                  portrait stays single-column via grid-cols-1 default
                  (preserves order: Customer Info → Project →
                  Appointment → Separator → Price → Actions). PC splits
                  into info-left + operations-right with sm:items-start
                  so columns align top regardless of differing height.
                  Ship #309 — className lifted to DIALOG_HORIZONTAL_GRID
                  shared constant (same shape on ProjectDetailDialog). */}
              <div className={DIALOG_HORIZONTAL_GRID}>
              <div className="space-y-3">
              {/* Customer Info */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Customer Info</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-foreground/90">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{selected.address}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground/90">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{selected.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground/90">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{selected.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground/90">
                    <Ruler className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{selected.sq_ft.toLocaleString()} sq ft</span>
                  </div>
                </div>
              </div>

              {/* Project — product selections chipped out of title into this
                  section (ship #93 per kratos msg 1776695439349). Title stays
                  service-name-only; the tag detail lives here. Permit +
                  Financing have their own labeled rows, everything else
                  becomes a capitalize chip. */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Project</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-foreground/90">
                    <FileCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>Permit: {selected.permit_choice ? 'Yes (vendor handles)' : 'No'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground/90">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>Financing: {selected.financing ? 'Requested' : 'Not needed'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {selected.service_category.replace(/_/g, ' ')}
                    </Badge>
                    {(() => {
                      const selectionChips = Object.values(selected.pack_items ?? {})
                        .flat()
                        .filter((s) => s !== 'permit' && s !== 'financed' && s !== 'financing')
                      if (selectionChips.length === 0) return null
                      return selectionChips.map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="text-[10px] capitalize bg-primary/10 text-primary border-primary/20"
                        >
                          {s.replace(/_/g, ' ')}
                        </Badge>
                      ))
                    })()}
                  </div>
                  <p className="text-xs text-muted-foreground italic pt-0.5">
                    Full project details available in the Projects tab.
                  </p>
                </div>
              </div>

              {/* Appointment — mobile-only slot. Ship #323 PC-only refinement:
                  mobile view preserved (left col single-column stack); PC view
                  relocates Appointment to right col bottom (sibling block below
                  with `hidden sm:block`). */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2 sm:hidden">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Appointment</p>
                <div className="flex items-center gap-2 text-sm text-foreground/90">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{fmtDateTime(selected.slot)}</span>
                </div>
              </div>
              </div>
              {/* RIGHT COLUMN: Price + Actions + Appointment(PC) (operations side) */}
              <div className="space-y-3">
              {/* Mobile-only Separator — preserves the original visual
                  break between Appointment and Price on mobile portrait
                  (PC uses column-gap to separate the info/ops sides). */}
              <Separator className="sm:hidden" />

              {/* Price */}
              <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                <span className="text-sm text-muted-foreground font-medium">Price</span>
                <span className="text-lg font-bold font-heading text-foreground">{fmt(selected.value)}</span>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {(() => {
                  const cancelReq = cancellationRequestsByLead[selected.id]
                  if (cancelReq?.status !== 'pending') return null
                  return (
                    <div className="rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <X className="h-4 w-4 text-destructive shrink-0" />
                        <p className="text-sm font-semibold text-destructive">Cancellation requested by homeowner</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Requested {fmtDateTime(cancelReq.requestedAt)}. Approving cancels the project; denying keeps it on the books.
                      </p>
                      <Button
                        className="w-full bg-destructive hover:bg-destructive/90 text-white"
                        onClick={() => openCancelReview(selected.id)}
                      >
                        Review Cancellation Request
                      </Button>
                    </div>
                  )
                })()}
                {selected.status === 'completed' ? (
                  <>
                    <div className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-primary/10 text-primary font-semibold text-sm border border-primary/20">
                      <Handshake className="h-4 w-4" /> Sold
                    </div>
                    {/* Ship #316 — BuildConnect review-state surface in
                        Modal sold-branch. Pending/Approved badge + (when
                        flagged) banner with reviewNote. Ship #326 Phase A
                        extends the flagged-state surface with a Resolve
                        Flag section: thread display + Upload Revised
                        Contract action + Reply form. */}
                    {!isCancelledLead(selected) && (() => {
                      const display = getReviewStatusDisplay((selected as LeadExt).reviewStatus)
                      const Icon = display.icon
                      const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selected.id)
                      const isFlagged = display.variant === 'flagged'
                      // Lazy-seed legacy reviewNote into thread on first read
                      // (Decision A.i — Phase A audit). Idempotent guard
                      // inside store skips when thread already has a flag_note.
                      if (isFlagged && sp && (selected as LeadExt).reviewNote) {
                        ensureLegacyFlagNoteSeed(
                          sp.id,
                          (selected as LeadExt).reviewNote ?? '',
                          sp.reviewedBy ?? 'admin',
                          'BuildConnect',
                        )
                      }
                      const thread = sp ? (flagThreadsByProject[sp.id] ?? []) : []
                      return (
                        <div className="space-y-2">
                          <div className={cn('rounded-lg p-2.5 flex items-start gap-2', display.bannerClassName)}>
                            <Icon className={cn(
                              'h-4 w-4 shrink-0 mt-0.5',
                              display.variant === 'pending' && 'text-amber-700 dark:text-amber-400',
                              display.variant === 'approved' && 'text-emerald-700 dark:text-emerald-400',
                              display.variant === 'flagged' && 'text-red-700 dark:text-red-400',
                            )} />
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                'text-xs font-semibold',
                                display.variant === 'pending' && 'text-amber-800 dark:text-amber-300',
                                display.variant === 'approved' && 'text-emerald-800 dark:text-emerald-300',
                                display.variant === 'flagged' && 'text-red-800 dark:text-red-300',
                              )}>{display.label}</p>
                              {display.variant === 'flagged' && (selected as LeadExt).reviewNote && (
                                <p className="text-xs text-red-800 dark:text-red-300 whitespace-pre-wrap mt-1">{(selected as LeadExt).reviewNote}</p>
                              )}
                            </div>
                          </div>

                          {isFlagged && sp && (
                            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  Resolve Flag
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Upload a revised contract to send the deal back for re-review, or reply with context BuildConnect should know.
                                </p>
                              </div>

                              {thread.length > 0 && (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {thread.map((msg) => (
                                    <div
                                      key={msg.id}
                                      className={cn(
                                        'rounded-lg p-2.5 text-xs space-y-1',
                                        msg.authorRole === 'admin'
                                          ? 'bg-red-50/60 border border-red-200/60 dark:bg-red-950/20 dark:border-red-900/40'
                                          : 'bg-background border border-border/60',
                                      )}
                                    >
                                      <div className="flex items-baseline justify-between gap-2">
                                        <span className={cn(
                                          'font-semibold',
                                          msg.authorRole === 'admin' && 'text-red-800 dark:text-red-300',
                                        )}>
                                          {msg.authorName}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                          {new Date(msg.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                        </span>
                                      </div>
                                      <p className="whitespace-pre-wrap">{msg.content}</p>
                                      {msg.messageType === 'revision_uploaded' && (
                                        <p className="text-[10px] text-muted-foreground italic">
                                          Revised contract attached.
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => {
                                  setRevisionTargetProjectId(sp.id)
                                  setRevisionDialogOpen(true)
                                }}
                              >
                                <Upload className="h-3.5 w-3.5 mr-1.5" />
                                Upload Revised Contract
                              </Button>

                              <div className="space-y-2">
                                <textarea
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder="Reply to BuildConnect — explain context or request clarification."
                                  rows={3}
                                  className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 resize-none"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full"
                                  disabled={!replyText.trim() || !profile}
                                  onClick={() => {
                                    if (!replyText.trim() || !profile) return
                                    appendThreadMessage({
                                      projectId: sp.id,
                                      authorRole: 'vendor',
                                      authorId: profile.id,
                                      authorName: profile.name ?? 'Vendor',
                                      content: replyText.trim(),
                                      messageType: 'vendor_reply',
                                    })
                                    setReplyText('')
                                    toast.success('Reply sent to BuildConnect.')
                                  }}
                                >
                                  <Send className="h-3.5 w-3.5 mr-1.5" />
                                  Send Reply
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    {/* Ship #312 — Inside-modal Project Completed button
                        REMOVED per Rodolfo "i only want the outside one and
                        needs to work". Outside LeadCard button (#307a) is
                        the sole entry point now; routes through completed-
                        DialogLead state to avoid Layer-5 bulletproof-close
                        race that broke the inside path before #311. */}
                    {(() => {
                      const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selected.id)
                      if (!sp) return null
                      return (
                        <div className="space-y-2">
                          {sp.soldAt && (
                            <p className="text-xs text-muted-foreground text-center">
                              Sold on {new Date(sp.soldAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                          {sp.completedAt && (
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 text-center font-medium">
                              Completed on {new Date(sp.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                          {sp.saleAmount && sp.saleAmount > 0 && (
                            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Sale Total</span>
                                <span className="font-bold">${sp.saleAmount.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                                <span>Your Share ({100 - vendor.commission_pct}%)</span>
                                <span className="font-bold">${Math.round(sp.saleAmount * (1 - vendor.commission_pct / 100)).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                <span>Commission ({vendor.commission_pct}%)</span>
                                <span className="font-bold">${Math.round(sp.saleAmount * (vendor.commission_pct / 100)).toLocaleString()}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </>
                ) : selected.status === 'confirmed' ? (
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-white"
                    onClick={() => setSoldDialogOpen(true)}
                  >
                    <Handshake className="h-4 w-4 mr-1.5" /> Mark as Sold
                  </Button>
                ) : selected.status === 'rejected' ? (
                  <>
                    <div className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-red-50 text-red-700 font-semibold text-sm border border-red-200">
                      <X className="h-4 w-4" /> {cancellationRequestsByLead[selected.id]?.status === 'approved' ? 'Cancelled' : 'Rejected'}
                    </div>
                    {(() => {
                      const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selected.id)
                      return sp?.rejectionReason ? (
                        <div className="rounded-lg bg-red-50/50 border border-red-100 p-3">
                          <p className="text-[10px] text-red-400 font-medium uppercase tracking-wider mb-1">Reason</p>
                          <p className="text-xs text-red-700">{sp.rejectionReason}</p>
                        </div>
                      ) : null
                    })()}
                  </>
                ) : (
                  <>
                    {/* Ship #224 — Assign Account Rep. Dropdown reads
                        active account reps from useVendorEmployeesStore
                        (same data as /vendor/account-reps). Adhoc-text-
                        input fallback removed per Rodolfo directive
                        ("instead of typing ... open list from account
                        rep tab to select"). Empty-state directs user
                        to the Account Reps tab to add one. */}
                    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                      <label htmlFor="assign-rep" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <UserCheck className="h-3.5 w-3.5 text-primary" />
                        Account Representative
                        <span className="text-destructive">*</span>
                      </label>
                      {accountReps.length > 0 ? (
                        <>
                          <Select value={selectedRepId} onValueChange={(value) => setSelectedRepId(value ?? '')}>
                            <SelectTrigger id="assign-rep" className="h-10 text-sm">
                              {/* Ship #229 — selected-state shows name only;
                                  dropdown options below retain name + title
                                  for picking context. SelectValue children
                                  override the default (mirror-SelectItem-
                                  children) render. */}
                              <SelectValue placeholder="Choose an account representative…">
                                {selectedRepId
                                  ? accountReps.find((r) => r.id === selectedRepId)?.name
                                  : null}
                              </SelectValue>
                            </SelectTrigger>
                            {/* Ship #230 — alignItemWithTrigger=false so the
                                menu drops BELOW the trigger instead of
                                anchoring the selected item on top of the
                                trigger (base-ui default, macOS-native feel).
                                Post-#229 name-only trigger + name+title
                                options had mismatched heights that made the
                                overlay read as visual overlap. */}
                            <SelectContent alignItemWithTrigger={false}>
                              {accountReps.map((rep) => (
                                <SelectItem key={rep.id} value={rep.id}>
                                  <span className="font-medium">{rep.name}</span>
                                  {rep.role && (
                                    <span className="ml-2 text-xs text-muted-foreground">{rep.role}</span>
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!selectedRepId && (
                            <p className="text-[11px] text-muted-foreground">
                              Pick an account representative before confirming or rescheduling so the homeowner knows who's coming out.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          No account representatives on file yet.{' '}
                          <Link to="/vendor/account-reps" className="text-primary font-medium underline-offset-2 hover:underline">
                            Add one in the Account Reps tab
                          </Link>
                          {' '}before confirming this lead.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={!selectedRepId}
                        onClick={(e) => {
                          // BULLETPROOF close — 3rd recurrence on Rodolfo's side
                          // despite ship #63 defensive hardening, #65 state-first
                          // reorder, and #77 autofill-disable. Previous fixes all
                          // addressed plausible mechanisms but none fully closed it
                          // (kratos msg 1776670030582). This version layers 5
                          // independent close-guarantees so if ANY path fails the
                          // others catch it.
                          //
                          // Layer 1: preventDefault + stopPropagation — eliminate
                          //          any iOS Safari passive-event-listener or
                          //          scroll-lock consumption of the tap.
                          // Layer 2: try/catch/finally — close commits in finally
                          //          even if store-write throws.
                          // Layer 3: setTimeout(0) fallback — async re-fire on the
                          //          task queue after current render commits, in
                          //          case a race between setState + Dialog's own
                          //          state-update swallows the first close.
                          // Layer 4: requestAnimationFrame fallback — re-fire on
                          //          next paint frame in case both sync + task-
                          //          queue close got overridden.
                          // Layer 5: useEffect cleanup on sheetOpen transition —
                          //          if somehow sheetOpen stays true, the effect
                          //          forces selected=null which blanks the body.
                          e.preventDefault()
                          e.stopPropagation()
                          console.log('[vendor-confirm] CONFIRM_FIRED layer=sync leadId=', selected.id)

                          try {
                            const selectedLeadId = selected.id
                            // Ship #224 — rep resolution via accountReps
                            // (useVendorEmployeesStore) instead of
                            // vendor.reps (MOCK_VENDORS). Adhoc-text
                            // path removed.
                            const rep: VendorRep | undefined = accountReps.find((r) => r.id === selectedRepId)
                            const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selectedLeadId)
                            if (rep) {
                              assignRepByLead(selectedLeadId, rep)
                              if (sp) assignProjectRep(sp.id, rep)
                            }
                            setLeadStatus(selectedLeadId, 'confirmed')
                            if (sp) updateProjectStatus(sp.id, 'approved')
                          } catch (err) {
                            console.error('[vendor-confirm] handler-body error, proceeding to close anyway:', err)
                          } finally {
                            // Layer 2 close — GUARANTEED execution.
                            console.log('[vendor-confirm] CONFIRM_FIRED layer=finally')
                            setSelectedRepId('')
                            setSelected(null)
                            setSheetOpen(false)
                          }

                          // Layer 3 — microtask-queue fallback.
                          setTimeout(() => {
                            console.log('[vendor-confirm] CONFIRM_FIRED layer=setTimeout')
                            setSelected(null)
                            setSheetOpen(false)
                          }, 0)

                          // Layer 4 — next-frame fallback.
                          if (typeof requestAnimationFrame !== 'undefined') {
                            requestAnimationFrame(() => {
                              console.log('[vendor-confirm] CONFIRM_FIRED layer=raf')
                              setSelected(null)
                              setSheetOpen(false)
                            })
                          }
                        }}
                      >
                        <Check className="h-4 w-4 mr-1.5" /> Confirm
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          // Ship #238 — capture selected BEFORE closing the
                          // sheet. Layer 5 cleanup races to null out
                          // `selected` on next render; subDialogLead is the
                          // stable handle for the sub-dialog's Confirm
                          // handler to read.
                          setSubDialogLead(selected)
                          setRejectionReason('')
                          setRejectDialogOpen(true)
                          // Close the main modal so the reject-reason sub-dialog owns the foreground.
                          setSheetOpen(false)
                        }}
                      >
                        <X className="h-4 w-4 mr-1.5" /> Reject
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      // Ship #249 — rep-gate mirrors the Confirm button (line ~1202).
                      // Pre-#249 vendor could reschedule a pending lead without
                      // assigning a rep; homeowner would approve → lead flipped
                      // to confirmed via #239 atomic approveReschedule →
                      // scheduled-without-rep state. Gate-at-source matches
                      // Rodolfo's mental model "pick rep first, then act."
                      disabled={!selectedRepId}
                      onClick={() => {
                        // Ship #238 — capture-first. See reject-button
                        // handler above for the full rationale (Layer 5
                        // useEffect vs sub-dialog handler race).
                        setSubDialogLead(selected)
                        setRescheduleOpen(true)
                        // Close the main modal so the reschedule sub-dialog owns the foreground.
                        setSheetOpen(false)
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" /> Reschedule
                    </Button>
                  </>
                )}
              </div>
              {/* Appointment — PC-only slot. Ship #323: paired below the
                  Actions container so on PC (sm:+) the appointment time
                  sits directly under Reschedule (visual association
                  between the action and the data it modifies). Sibling
                  mobile-only block lives in the left column with
                  `sm:hidden` so the mobile single-column stack is
                  unchanged. Always rendered for all 4 lead states
                  (pending/confirmed/completed/rejected) — Appointment-
                  visibility preserved across the matrix. */}
              <div className="hidden sm:block rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Appointment</p>
                <div className="flex items-center gap-2 text-sm text-foreground/90">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{fmtDateTime(selected.slot)}</span>
                </div>
              </div>
              </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Reschedule Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={rescheduleDate ? new Date(rescheduleDate + 'T12:00:00') : undefined}
                onSelect={(date) => {
                  if (date) {
                    const y = date.getFullYear()
                    const m = String(date.getMonth() + 1).padStart(2, '0')
                    const d = String(date.getDate()).padStart(2, '0')
                    setRescheduleDate(`${y}-${m}-${d}`)
                    setRescheduleTime('')
                  }
                }}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </div>
            {rescheduleDate && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Time</label>
                <div className="grid grid-cols-3 gap-2">
                  {['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'].map((t) => (
                    <Button
                      key={t}
                      variant={rescheduleTime === t ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRescheduleTime(t)}
                      className="text-xs"
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      {t}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            <Button disabled={!rescheduleDate || !rescheduleTime} onClick={() => {
              // Ship #238 — read from subDialogLead (captured at click-time
              // on the Reschedule button), not `selected` (which Layer 5
              // nulled when the main sheet closed).
              const lead = subDialogLead
              if (lead) {
                // Ship #249 — persist rep-assign alongside the reschedule
                // request. Button-gate (disabled={!selectedRepId} on the
                // Reschedule trigger) guarantees selectedRepId is set here;
                // but we still need to commit the assignment to store so
                // the post-approve-reschedule transition to "scheduled"
                // carries the rep. Pre-#249 the Reschedule path bypassed
                // rep-assign entirely — Rodolfo-surfaced gap.
                const rep = accountReps.find((r) => r.id === selectedRepId)
                if (rep) assignRepByLead(lead.id, rep)
                // Ship #239 — UNIFIED vendor-reschedule flow. Regardless of
                // lead status (pending / confirmed / rescheduled), the
                // reschedule goes through as a RescheduleRequest awaiting
                // homeowner approval. Previously (Ship #191) the pre-
                // approval branch applied a "first-acceptance" optimization:
                // pending lead + vendor reschedule → silent
                // confirm+updateBooking, assuming "nothing was agreed yet
                // so no negotiation needed." Rodolfo's mental model
                // (2026-04-22) corrects that prior: the homeowner-picked
                // time IS a preference; silently moving it violates
                // consent. Every vendor-proposed time change now
                // round-trips through homeowner approval — approveReschedule
                // transitions the lead to confirmed on approval (handled
                // atomically in the store action).
                requestReschedule(
                  lead.id,
                  'vendor',
                  rescheduleDate,
                  rescheduleTime,
                  lead.slot.split('T')[0],
                  lead.slot.split('T')[1]?.slice(0, 5) ?? '',
                )
                toast.success('New time sent to homeowner for approval.')
              }
              setRescheduleOpen(false)
              setRescheduleDate('')
              setRescheduleTime('')
              setSubDialogLead(null)
              setSelectedRepId('')
            }}>
              Confirm Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Lead Rejection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for declining this lead. This information will be recorded for future reference.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">What is the reason for this lead rejection?</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter your reason here..."
                rows={4}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason.trim()}
              onClick={() => {
                // Ship #238 — capture-first (see subDialogLead comment at
                // state declaration). Reading from `selected` here silently
                // no-op''d after the main sheet closed.
                const lead = subDialogLead
                if (lead) {
                  // Always flip the lead-status override so mock-leads move too.
                  setLeadStatus(lead.id, 'rejected')
                  const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === lead.id)
                  if (sp) {
                    updateProjectStatus(sp.id, 'declined')
                    // Store rejection reason
                    const store = useProjectsStore.getState()
                    store.sentProjects.forEach((p) => {
                      if (p.id === sp.id) p.rejectionReason = rejectionReason.trim()
                    })
                    useProjectsStore.setState({ sentProjects: [...store.sentProjects] })
                  }
                }
                setRejectDialogOpen(false)
                setSubDialogLead(null)
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Sold Dialog — Ship #313 added: notice text +
          mandatory contract upload + contract amount match validation
          per Rodolfo "make it a requirement that vendor needs to upload
          their contract make it mandatory and vendor contract needs to
          match the sale amount and put a note that all sold active
          will be revised with the contract by buildconnect". Lighter-
          confirm shape preserved per #107 (validation gates + notice
          ARE the protective layer; four-refinement preconditions not
          met). */}
      <Dialog
        open={soldDialogOpen}
        onOpenChange={(o) => {
          setSoldDialogOpen(o)
          if (!o) {
            setContractAmount('')
            setContractFile(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Mark as Sold</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Ship #313 — BuildConnect-review notice. Top-of-dialog
                placement so vendor sees BEFORE entering data. */}
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700/40 p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-foreground/90">
                All Sold Active deals will be reviewed against the contract by BuildConnect.
              </p>
            </div>

            {/* Ship #316 — Sale Amount input REMOVED per Rodolfo "take
                out sale amount and just leave contract amount". Contract
                Amount is now the sole source-of-truth; written to
                saleAmount internally on Confirm Sale per Decision A
                (UI-only rename, internal field unchanged for back-compat
                across 8+ consumers reading sp.saleAmount). */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Contract Amount <span className="text-destructive">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  value={contractAmount}
                  onChange={(e) => setContractAmount(e.target.value)}
                  placeholder="Enter total contract amount"
                  className="w-full h-10 pl-7 pr-3 rounded-lg border border-input bg-background text-base"
                />
              </div>
            </div>

            {/* Ship #313 — mandatory contract file upload. Persists to
                vendor-homeowner-documents-store on Confirm Sale (#103
                SoT reuse — addDoc with category='contract'). */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Contract File <span className="text-destructive">*</span></label>
              {contractFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{contractFile.filename}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setContractFile(null)}
                    aria-label="Remove contract file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-10 rounded-lg border border-dashed border-input bg-muted/20 px-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
                  <Upload className="h-3.5 w-3.5" />
                  Choose Contract File
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = () => setContractFile({ filename: file.name, dataUrl: reader.result as string })
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
              )}
              <p className="text-[10px] text-muted-foreground">PDF or image (JPG / PNG / WEBP).</p>
            </div>

            {/* Ship #316 — breakdown reads contractAmount (single source-
                of-truth post-simplification). Internal write to
                saleAmount preserved per Decision A back-compat. */}
            {contractAmount && Number(contractAmount) > 0 && (
              <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contract Total</span>
                  <span className="font-bold">${Number(contractAmount).toLocaleString()}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">Vendor Share ({100 - vendor.commission_pct}%)</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">${Math.round(Number(contractAmount) * (1 - vendor.commission_pct / 100)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-700 dark:text-amber-400 font-medium">BuildConnect ({vendor.commission_pct}%)</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">${Math.round(Number(contractAmount) * (vendor.commission_pct / 100)).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoldDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={
                !contractAmount || Number(contractAmount) <= 0 ||
                !contractFile
              }
              onClick={() => {
                if (selected) {
                  // Always flip the lead-status override so mock-leads move too.
                  setLeadStatus(selected.id, 'completed')
                  const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selected.id)
                  if (sp) {
                    // Ship #316 — write Contract Amount to saleAmount
                    // internally (Decision A back-compat: 8+ consumers
                    // read sp.saleAmount; UI-only rename preserved).
                    markProjectSold(sp.id, Number(contractAmount))
                  }
                  // Ship #313 — persist contract to vendor-homeowner-
                  // documents-store under category='contract'. Existing
                  // canonical doc-storage; admin god-view + vendor-
                  // homeowner-detail page already render this.
                  if (contractFile && vendor) {
                    addVendorHomeownerDoc({
                      vendor_id: vendor.id,
                      homeowner_email: selected.email,
                      category: 'contract',
                      filename: contractFile.filename,
                      dataUrl: contractFile.dataUrl,
                    })
                  }
                }
                setSoldDialogOpen(false)
                setContractAmount('')
                setContractFile(null)
                // Also close the lead-detail modal so the vendor returns to the
                // list view with the lead now in the Sold column (kratos msg
                // 1776636334448). Matches the Confirm / Reject / Reschedule
                // auto-close pattern already in place.
                setSheetOpen(false)
              }}
            >
              <Handshake className="h-4 w-4 mr-1.5" /> Confirm Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ship #326 Phase A — Upload Revised Contract dialog. Triggered
          from the Resolve Flag section in the Modal sold-branch when the
          deal is flagged. Reuses the #313 Mark-as-Sold contract-upload
          shape (file picker + PDF/image accept). On Confirm:
            1. addDoc to vendor-homeowner-documents-store (preserves the
               old contract for audit-trail; new revision sits alongside)
            2. resetReviewStatus on the sentProject (reviewStatus=pending,
               clears reviewedAt + reviewedBy; reviewNote KEPT in thread
               context per Decision D + #94 truthfulness)
            3. appendMessage to flag-thread with messageType=
               'revision_uploaded' so the thread shows the revision event
            4. Close + clear local state. */}
      <Dialog
        open={revisionDialogOpen}
        onOpenChange={(o) => {
          setRevisionDialogOpen(o)
          if (!o) {
            setRevisionContractFile(null)
            setRevisionTargetProjectId(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Upload Revised Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700/40 p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-foreground/90">
                Uploading a revised contract sends the deal back to BuildConnect for re-review. The previous contract stays on file for reference.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Revised Contract <span className="text-destructive">*</span></label>
              {revisionContractFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{revisionContractFile.filename}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setRevisionContractFile(null)}
                    aria-label="Remove revised contract file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-10 rounded-lg border border-dashed border-input bg-muted/20 px-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
                  <Upload className="h-3.5 w-3.5" />
                  Choose Revised Contract File
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = () => setRevisionContractFile({ filename: file.name, dataUrl: reader.result as string })
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
              )}
              <p className="text-[10px] text-muted-foreground">PDF or image (JPG / PNG / WEBP).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!revisionContractFile || !revisionTargetProjectId}
              onClick={() => {
                if (!revisionContractFile || !revisionTargetProjectId || !profile || !vendor || !selected) return
                addVendorHomeownerDoc({
                  vendor_id: vendor.id,
                  homeowner_email: selected.email,
                  category: 'contract',
                  filename: revisionContractFile.filename,
                  dataUrl: revisionContractFile.dataUrl,
                })
                resetReviewStatus(revisionTargetProjectId)
                appendThreadMessage({
                  projectId: revisionTargetProjectId,
                  authorRole: 'vendor',
                  authorId: profile.id,
                  authorName: profile.name ?? 'Vendor',
                  content: `Revised contract uploaded: ${revisionContractFile.filename}`,
                  messageType: 'revision_uploaded',
                })
                setRevisionDialogOpen(false)
                setRevisionContractFile(null)
                setRevisionTargetProjectId(null)
                toast.success('Revised contract sent to BuildConnect for re-review.')
              }}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Send for Re-Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ship #295 — Project Completed confirm dialog. Lighter-confirm
          shape (per kratos concur on edge-case-calibration of
          destructive-confirm-four-refinement preconditions): action is
          acceleration of the existing 90d age-based auto-transition,
          not destruction. Plain 1-line description + Cancel/Confirm. */}
      <Dialog
        open={completedDialogOpen}
        onOpenChange={(o) => {
          setCompletedDialogOpen(o)
          // Ship #312 — clear completedDialogLead on dialog close
          // (Cancel / backdrop / ESC). Confirm-handler clears it too.
          if (!o) setCompletedDialogLead(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Mark Project Completed?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            <p>This moves the project from Sold, Active to Projects Completed.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCompletedDialogOpen(false); setCompletedDialogLead(null) }}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                // Ship #312 — read completedDialogLead (not selected)
                // to avoid Layer-5 bulletproof-close race. Outside-
                // button path never opens the modal, so `selected`
                // gets wiped by Layer-5 before Confirm can read it.
                if (completedDialogLead) {
                  // Ship #311 — ALWAYS fire override-map setter (covers
                  // MOCK_LEADS without sentProject backing); preserve
                  // sentProject.completedAt write when sp exists for
                  // persistence parity.
                  setLeadCompletedAt(completedDialogLead.id, new Date().toISOString())
                  const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === completedDialogLead.id)
                  if (sp) markCompleted(sp.id)
                }
                setCompletedDialogOpen(false)
                setCompletedDialogLead(null)
                setSheetOpen(false)
                toast.success('Project marked as completed')
              }}
            >
              <Check className="h-4 w-4 mr-1.5" /> Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ship #293 — Clear Demo Data dialog moved to /vendor (dashboard). */}

      {/* Cancellation Review Dialog — vendor approves or denies a homeowner's
          cancellation request. Approve flips the lead into the cancelled bucket
          (reuses 'rejected' per ship #75 Phase A — Tranche-2 will diverge).
          Deny keeps status intact and sets request.status = 'denied', letting
          the homeowner re-request if still inside the 48h window. */}
      <Dialog open={cancelReviewOpen} onOpenChange={setCancelReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Cancellation Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              The homeowner is requesting to cancel this project. Approving will
              mark the project as cancelled and notify them. Denying keeps the
              project active — they'll see the denial and can request again.
            </p>
            {cancelReviewLeadId && cancellationRequestsByLead[cancelReviewLeadId] && (() => {
              const req = cancellationRequestsByLead[cancelReviewLeadId]
              // Ship #90 simplified homeowner capture to single Reason textarea;
              // vendor display consolidates too. Prefer reason field; fall back
              // to explanation for back-compat with pre-#90 entries that may
              // have written explanation instead.
              const text = req.reason || req.explanation
              if (!text && !req.requestedAt) return null
              return (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
                  {text && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive/80 mb-0.5">
                        Homeowner's reason
                      </p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>
                    </div>
                  )}
                  {req.requestedAt && (
                    <p className="text-[11px] text-muted-foreground">
                      Requested {fmtDateTime(req.requestedAt)}
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setCancelReviewOpen(false)}>Close</Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={handleDenyCancellation}>
              Deny Cancellation
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleApproveCancellation}>
              Approve Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Rep Dialog — post-confirm rep swap, opened from LeadCard pencil.
          Ship #224 — label + data source aligned with Assign Account Rep flow:
          'Change Representative' → 'Change Account Rep', dropdown from
          useVendorEmployeesStore, adhoc-text fallback dropped. */}
      <Dialog open={editRepOpen} onOpenChange={setEditRepOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Change Account Representative</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {accountReps.length > 0 ? (
              <Select value={editRepChoice} onValueChange={(value) => setEditRepChoice(value ?? '')}>
                <SelectTrigger className="h-10 text-sm">
                  {/* Ship #229 — same name-only selected-display pattern as
                      the assign-rep dropdown. Options below keep name+title. */}
                  <SelectValue placeholder="Choose an account representative…">
                    {editRepChoice
                      ? accountReps.find((r) => r.id === editRepChoice)?.name
                      : null}
                  </SelectValue>
                </SelectTrigger>
                {/* Ship #230 — alignItemWithTrigger=false, same rationale
                    as the Assign dropdown above. */}
                <SelectContent alignItemWithTrigger={false}>
                  {accountReps.map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>
                      <span className="font-medium">{rep.name}</span>
                      {rep.role && (
                        <span className="ml-2 text-xs text-muted-foreground">{rep.role}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No account representatives on file yet.{' '}
                <Link to="/vendor/account-reps" className="text-primary font-medium underline-offset-2 hover:underline">
                  Add one in the Account Reps tab
                </Link>
                {' '}to assign.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              The homeowner will see the new account representative the next time they open this appointment.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRepOpen(false)}>Cancel</Button>
            <Button
              disabled={!editRepChoice}
              onClick={handleSaveEditRep}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ship #191 — vendor counter-propose dialog. Mounts
          unconditionally per dialog-mount-in-every-return-branch
          discipline; consumes the selected lead's current reschedule
          request for pre-fill. */}
      <ReschedulePickerDialog
        open={vendorCounterOpen}
        onOpenChange={setVendorCounterOpen}
        mode="counter"
        currentDate={selected ? rescheduleRequestsMap[selected.id]?.proposedDate : undefined}
        currentTime={selected ? rescheduleRequestsMap[selected.id]?.proposedTime : undefined}
        otherPartyLabel={selected?.homeowner_name}
        onSubmit={(proposedDate, proposedTime, reason) => {
          if (selected) {
            counterReschedule(selected.id, proposedDate, proposedTime, reason)
            toast.success('Counter-proposal sent to homeowner.')
          }
          setVendorCounterOpen(false)
        }}
      />
    </motion.div>
  )
}
