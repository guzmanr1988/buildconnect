import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Inbox, DollarSign, CalendarCheck, Target, MapPin, BadgeCheck,
  Phone, Mail, Ruler, FileCheck, CreditCard, CalendarClock,
  Check, X, RotateCcw, Clock, ChevronDown, ChevronUp, Handshake, Archive,
  UserCheck, Pencil, Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Separator } from '@/components/ui/separator'
import { KpiCard } from '@/components/shared/kpi-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { MOCK_VENDORS, MOCK_LEADS } from '@/lib/mock-data'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectsStore } from '@/stores/projects-store'
import { cn } from '@/lib/utils'
import { deriveInitials } from '@/lib/initials'
import type { Lead, Vendor, VendorRep } from '@/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function VendorDashboard() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const updateProjectStatus = useProjectsStore((s) => s.updateStatus)
  const updateProjectBooking = useProjectsStore((s) => s.updateBooking)
  const markProjectSold = useProjectsStore((s) => s.markSold)
  const assignProjectRep = useProjectsStore((s) => s.assignRep)
  const assignRepByLead = useProjectsStore((s) => s.assignRepByLead)
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const setLeadStatus = useProjectsStore((s) => s.setLeadStatus)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  const approveCancellation = useProjectsStore((s) => s.approveCancellation)
  const denyCancellation = useProjectsStore((s) => s.denyCancellation)

  // Auth guard — redirect unauth'd or non-vendor roles to /login.
  useEffect(() => {
    if (profile !== null && profile.role !== 'vendor') {
      navigate('/login', { replace: true })
    }
  }, [profile, navigate])

  // Resolve which MOCK_VENDORS fixture (if any) this authed vendor maps to.
  // The 3 featured demo vendors (apex-demo / shield-demo / paradise-demo
  // seeded by scripts/seed-vendor-prices.mjs) have their Supabase UUIDs in
  // DEMO_VENDOR_UUID_BY_MOCK_ID — reverse-lookup gives the mock-id ('v-1' /
  // 'v-2' / 'v-3') for fixture display. Any other vendor account (e.g. the
  // original vendor@buildc.net demo) resolves to null → display the authed
  // profile directly with zero mock-lead fixtures.
  const mockVendorId = useMemo(() => {
    if (!profile) return null
    const entry = Object.entries(DEMO_VENDOR_UUID_BY_MOCK_ID).find(([, uuid]) => uuid === profile.id)
    return entry ? entry[0] : null
  }, [profile])

  // VENDOR_ID for filtering mock-data queries: the mock-id when mapped; the
  // real profile.id otherwise (in which case the filters return empty because
  // no MOCK_LEADS row has that vendor_id).
  const VENDOR_ID = mockVendorId ?? profile?.id ?? ''

  // Vendor display-data: from MOCK_VENDORS fixture when mapped, synthesized
  // from profile when not. Role-gate the synthesis — a homeowner profile
  // (e.g. a QA persona left in auth-store during a pre-redirect first paint)
  // must NOT be synthesized into a vendor, or the dashboard flashes that
  // homeowner's name as the vendor name until the useEffect auth-guard
  // redirect commits. Rod P0 2026-04-20 (kratos msg 1776665548710 via apollo
  // sweep): Paradise-demo vendor profile rendered 'Ana Martinez' (qa-1
  // persona name) before the redirect fired — this guard blocks the flash.
  const vendor: Vendor | null = useMemo(() => {
    if (mockVendorId) {
      const m = MOCK_VENDORS.find((v) => v.id === mockVendorId)
      if (m) return m
    }
    if (!profile) return null
    if (profile.role !== 'vendor') return null
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: 'vendor',
      phone: profile.phone ?? '',
      address: profile.address ?? '',
      company: profile.company ?? profile.name,
      avatar_color: profile.avatar_color ?? '#3b82f6',
      initials: profile.initials ?? deriveInitials(profile.name),
      status: profile.status ?? 'active',
      created_at: profile.created_at ?? new Date().toISOString(),
      service_categories: [],
      rating: 0,
      response_time: '—',
      verified: false,
      financing_available: false,
      total_reviews: 0,
      commission_pct: 15,
    }
  }, [mockVendorId, profile])

  // Gate seeded MOCK_LEADS + MOCK_CLOSED_SALES fixtures to only the 5
  // featured mock vendors (v-1..v-5). Synthesized / unmapped vendors (e.g.
  // generic Demo Vendor account) see only their own sentProjects — Rod
  // P0 2026-04-20: DV was inheriting Maria L-0001 + James L-0005 as its
  // own leads via the filter match when mockVendorId was null.
  const mockLeads = useMemo(
    () => (mockVendorId ? MOCK_LEADS.filter((l) => l.vendor_id === VENDOR_ID) : []),
    [VENDOR_ID, mockVendorId]
  )
  // Convert sent projects from homeowner side into lead-like objects.
  // Ship #163 + #165 vendor_id-FK hardening (task_1776731114470_226):
  // prefer contractor.vendor_id FK (stable across rename); fall back to
  // company-name match for legacy persisted entries that predate the FK.
  const statusMap: Record<string, Lead['status']> = { pending: 'pending', approved: 'confirmed', declined: 'rejected', sold: 'completed' }
  const homeownerLeads: (Lead & { soldAt?: string })[] = useMemo(() => sentProjects
    .filter((p) => {
      if (!vendor) return false
      if (p.contractor?.vendor_id) return p.contractor.vendor_id === vendor.id
      // Legacy fallback — pre-#165 persisted entries without vendor_id
      return p.contractor?.company === vendor.company
    })
    .map((p) => ({
    id: `L-${p.id.slice(0, 4).toUpperCase()}`,
    _projectId: p.id,
    homeowner_id: 'ho-current',
    vendor_id: VENDOR_ID,
    homeowner_name: p.homeowner?.name || 'New Customer',
    project: p.item.serviceName + ' — ' + Object.values(p.item.selections).flat().map((s) => s.replace(/_/g, ' ')).join(', '),
    status: (statusMap[p.status] || 'pending') as Lead['status'],
    value: 0,
    address: p.homeowner?.address || 'Pending site visit',
    phone: p.homeowner?.phone || '—',
    email: p.homeowner?.email || '—',
    sq_ft: 0,
    service_category: p.item.serviceId as any,
    permit_choice: Object.values(p.item.selections).flat().includes('permit'),
    financing: Object.values(p.item.selections).flat().includes('financed'),
    pack_items: p.item.selections,
    slot: p.sentAt,
    received_at: p.sentAt,
    soldAt: p.soldAt,
  })), [sentProjects, VENDOR_ID, vendor?.id, vendor?.company])

  // Per-lead status overrides are now persisted via projects-store (ship #55 —
  // Rod-surfaced refresh-wipes-everything on Demo Vendor). Vendor actions
  // (Confirm / Reject / Reschedule / Mark-as-Sold) write to the store; the
  // store's persist middleware keeps the override alive across page reloads.
  // Previously this was component useState and wiped on refresh.

  // Put homeowner leads first so they appear at the top, then apply overrides.
  const leads = useMemo(() => {
    const combined = [...homeownerLeads, ...mockLeads]
    return combined.map((l) =>
      leadStatusOverrides[l.id] ? { ...l, status: leadStatusOverrides[l.id] } : l
    )
  }, [mockLeads, homeownerLeads, leadStatusOverrides])

  // Lifecycle thresholds simplified to single sold→completed split (kratos msg
  // 1776693800134). Active Projects tile merged into Project Sold — the
  // "currently active" bucket is any sold/approved project that isn't
  // aged-out to Completed yet.
  //
  // Ship #171 (task_1776662387601_014) — Cancelled Projects vs Rejected
  // Leads are now distinct tiles, reflecting the split 'cancelled' /
  // 'rejected' lifecycle statuses. Homeowner-initiated, vendor-approved
  // cancellations land in Cancelled; vendor-upfront rejections (no
  // cancellation request on file) land in Rejected. Pre-#171 persisted
  // leads that sit at status='rejected' AND carry an approved
  // cancellationRequest are still surfaced as cancelled via the
  // isCancelledLead predicate (read-path back-compat; no data migration
  // needed).
  const SOLD_TO_COMPLETED_DAYS = 90
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = Date.now()
  const soldAgeDays = (l: Lead & { soldAt?: string }): number | null => {
    if (!l.soldAt) return null
    return (now - new Date(l.soldAt).getTime()) / DAY_MS
  }

  // Cancelled = homeowner-initiated, vendor-approved. Primary signal is
  // status='cancelled' (ship #171 forward); pre-#171 entries are detected
  // via the (status='rejected' + cancellationRequest.status='approved')
  // conjunction. Having cancellationRequest.status='approved' alone also
  // qualifies (covers any ordering race between the two state writes).
  const isCancelledLead = (l: Lead): boolean => {
    if (l.status === 'cancelled') return true
    const cReq = cancellationRequestsByLead[l.id]
    if (cReq?.status === 'approved') return true
    return false
  }

  // Rejected = vendor said no up front. Strictly status='rejected' with
  // no approved cancellation request on file. A post-accept cancellation
  // that somehow still sits at 'rejected' (pre-#171 data only) is caught
  // by isCancelledLead above and short-circuited out of this bucket.
  const isRejectedLead = (l: Lead): boolean => {
    if (l.status !== 'rejected') return false
    if (isCancelledLead(l)) return false
    return true
  }

  // Lead categories
  const newLeads = leads.filter((l) => l.status === 'pending' || l.status === 'rescheduled')
  const confirmedLeads = leads.filter((l) => l.status === 'confirmed')
  const projectSold = leads.filter((l) => {
    if (isCancelledLead(l)) return false
    if (isRejectedLead(l)) return false
    if (l.status !== 'completed') return false
    const age = soldAgeDays(l as Lead & { soldAt?: string })
    // Currently-active bucket: either just-sold (no soldAt yet → treat as
    // fresh) OR sold less than SOLD_TO_COMPLETED_DAYS ago.
    return age === null || age < SOLD_TO_COMPLETED_DAYS
  })
  const projectsCompleted = leads.filter((l) => {
    if (isCancelledLead(l)) return false
    if (isRejectedLead(l)) return false
    if (l.status !== 'completed') return false
    const age = soldAgeDays(l as Lead & { soldAt?: string })
    // Truly-completed: aged-out past the 90d threshold.
    return age !== null && age >= SOLD_TO_COMPLETED_DAYS
  })
  const cancelledProjects = leads.filter(isCancelledLead)
  const rejectedLeads = leads.filter(isRejectedLead)

  // KPI calculations
  const activeLeads = leads.filter((l) => l.status === 'pending' || l.status === 'confirmed' || l.status === 'rescheduled')
  const pipelineValue = activeLeads.reduce((sum, l) => sum + l.value, 0)
  const bookedThisMonth = confirmedLeads.length
  const totalDecided = leads.filter((l) => ['confirmed', 'completed', 'rejected', 'cancelled'].includes(l.status)).length
  const wins = leads.filter((l) => l.status === 'confirmed' || l.status === 'completed').length
  const winRate = totalDecided > 0 ? Math.round((wins / totalDecided) * 100) : 0

  // Sheet / dialog state
  const [selected, setSelected] = useState<Lead | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [soldDialogOpen, setSoldDialogOpen] = useState(false)
  const [saleAmount, setSaleAmount] = useState('')
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  // Assign-rep flow: selectedRepId is the rep chosen in the new-lead modal
  // (Confirm is gated on it being non-empty). editRepOpen/editRep* drive the
  // post-confirm swap dialog opened from the confirmed-tab LeadCard.
  const [selectedRepId, setSelectedRepId] = useState<string>('')
  // Fallback path: when the authed vendor has no reps[] on file (e.g. Demo
  // Vendor that's not mapped to a MOCK_VENDOR), the selector hides and a
  // free-form name input takes its place. Typed name is used to build an
  // ad-hoc VendorRep on Confirm. Keeps the flow unblocked for vendors who
  // haven't configured reps yet.
  const [adhocRepName, setAdhocRepName] = useState<string>('')
  const [editRepOpen, setEditRepOpen] = useState(false)
  const [editRepLeadId, setEditRepLeadId] = useState<string>('')
  const [editRepChoice, setEditRepChoice] = useState<string>('')
  const [editAdhocRepName, setEditAdhocRepName] = useState<string>('')
  // Cancellation-request review dialog (Phase B).
  const [cancelReviewOpen, setCancelReviewOpen] = useState(false)
  const [cancelReviewLeadId, setCancelReviewLeadId] = useState<string>('')

  // Demo-mode Clear Demo Data button: wipes projects-store test entries so
  // Rodolfo can reset QA state without manual localStorage fiddling. Gated
  // by VITE_DEMO_MODE so it doesn't ship visible to real prod accounts.
  // Default behavior: env-flag true in current pre-launch deploys; flip to
  // 'false' in prod env when real users sign in.
  const demoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
  const [clearDemoDialogOpen, setClearDemoDialogOpen] = useState(false)
  const handleClearDemoData = () => {
    // Triple-belt: (1) in-memory reset via setState, (2) explicit localStorage
    // removeItem on the persist key, (3) forced re-write of the empty state to
    // localStorage. Covers the case where setState's persist-middleware-write
    // fails silently OR the merge function would re-introduce stale data on
    // next hydration. Rod P0 2026-04-20: Maria L-8B2E was surviving Clear
    // because the persist path wasn't fully wiping.
    useProjectsStore.setState({
      sentProjects: [],
      assignedRepByLead: {},
      leadStatusOverrides: {},
    })
    try {
      localStorage.removeItem('buildconnect-projects')
      // Re-write empty state so any consumer reading localStorage after Clear
      // sees a clean state, not a missing key that might trigger fallback.
      localStorage.setItem(
        'buildconnect-projects',
        JSON.stringify({
          state: { sentProjects: [], assignedRepByLead: {}, leadStatusOverrides: {} },
          version: 0,
        })
      )
      localStorage.removeItem('buildconnect-pending-item')
      localStorage.removeItem('buildconnect-selected-contractor')
      localStorage.removeItem('buildconnect-selected-booking')
      localStorage.removeItem('buildconnect-homeowner-info')
      localStorage.removeItem('buildconnect-id-document')
    } catch { /* storage errors non-fatal */ }
    setClearDemoDialogOpen(false)
  }
  const [rejectionReason, setRejectionReason] = useState('')

  // Section collapse state
  // Single-open accordion: at most one lead-status tile open at a time
  // (kratos msg 1776576047204). Null = all closed.
  type LeadTileId = 'new' | 'confirmed' | 'sold' | 'completed' | 'cancelled'
  const [openTile, setOpenTile] = useState<LeadTileId | null>(null)
  const toggleTile = (id: LeadTileId) => setOpenTile((prev) => (prev === id ? null : id))

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
      setAdhocRepName('')
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
    setAdhocRepName('')
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
    setEditRepChoice(current?.id ?? '')
    // If current rep is adhoc OR vendor has no reps on file, pre-populate the
    // free-form input with the current name so the fallback UX shows what's
    // already assigned.
    setEditAdhocRepName(
      current && (!vendor?.reps?.length || current.id.startsWith('adhoc-')) ? current.name : ''
    )
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
    const rep: VendorRep | undefined =
      vendor?.reps && vendor.reps.length > 0
        ? vendor.reps.find((r) => r.id === editRepChoice)
        : editAdhocRepName.trim()
          ? { id: `adhoc-${crypto.randomUUID()}`, name: editAdhocRepName.trim() }
          : undefined
    if (!rep) return
    assignRepByLead(editRepLeadId, rep)
    const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === editRepLeadId)
    if (sp) assignProjectRep(sp.id, rep)
    setEditRepOpen(false)
  }

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  }
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  }

  function LeadCard({ lead }: { lead: Lead }) {
    const rep = getAssignedRepForLead(lead.id)
    const cancelReq = cancellationRequestsByLead[lead.id]
    const hasPendingCancel = cancelReq?.status === 'pending'
    // Schedule-Approved affordance (ship #100 per kratos msg 1776714878659):
    // confirmed lead WITH rep assigned gets a green ring + inline 'Schedule
    // Approved' label. Pending-cancel (red ring) wins over confirmed-approval
    // (green ring) since the cancel is the more-urgent state.
    const isScheduleApproved = lead.status === 'confirmed' && !!rep && !hasPendingCancel
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
                    label={isCancelledLead(lead) && lead.status === 'rejected' ? 'Cancelled' : undefined}
                  />
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
            <div className={cn('rounded-md p-1.5 shrink-0', color)}>
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
      {/* Vendor Profile Card */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <AvatarInitials initials={vendor.initials} color={vendor.avatar_color} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold font-heading truncate">{vendor.company}</h2>
                  {vendor.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Verified
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 capitalize">
                    {vendor.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {vendor.address}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{vendor.name} &middot; {vendor.phone}</p>
              </div>
              {demoMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
                  onClick={() => setClearDemoDialogOpen(true)}
                  aria-label="Clear demo data"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Clear Demo Data</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* KPI Row */}
      <div className="kpi-grid grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-4">
        <motion.div variants={item}>
          <KpiCard title="Active Leads" value={String(activeLeads.length)} change="+12% vs last month" trend="up" icon={Inbox} iconColor="bg-primary" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title="Pipeline Value" value={fmt(pipelineValue)} change="+8% vs last month" trend="up" icon={DollarSign} iconColor="bg-amber-500" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title="Booked This Month" value={String(bookedThisMonth)} change="+2 from last week" trend="up" icon={CalendarCheck} iconColor="bg-emerald-500" />
        </motion.div>
        <motion.div variants={item}>
          <KpiCard title="Win Rate" value={`${winRate}%`} change="+5pp vs last quarter" trend="up" icon={Target} iconColor="bg-violet-500" />
        </motion.div>
      </div>

      {/* Lead Status Tiles — vertical accordion. Each tile owns its own expand
          content inline beneath its summary row (kratos msg 1776576002292). */}
      <motion.div variants={item} className="flex flex-col gap-2">
        <LeadStatusTile
          title="New Leads"
          count={newLeads.length}
          color="bg-amber-500"
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
          color="bg-emerald-500"
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
          title="Project Sold"
          subtitle="active"
          subtitleColor="text-emerald-600"
          count={projectSold.length}
          color="bg-primary"
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
          color="bg-slate-500"
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
        <LeadStatusTile
          title="Cancelled Projects"
          count={cancelledProjects.length}
          color="bg-zinc-500"
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
        {/* Ship #171 — Rejected tile split out. Vendor-upfront rejections
            now render separately from mutual-cancellation outcomes so the
            vendor can tell at a glance which deadened leads they walked
            away from vs which the homeowner canceled. */}
        <LeadStatusTile
          title="Rejected Leads"
          count={rejectedLeads.length}
          color="bg-destructive"
          icon={X}
          open={openTile === 'rejected'}
          onToggle={() => toggleTile('rejected')}
        >
          <div className="grid gap-3">
            {rejectedLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No rejected leads.</p>
            ) : (
              rejectedLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        </LeadStatusTile>
      </motion.div>

      {/* Lead Detail Modal — centered floating dialog with dark backdrop (Dialog primitive handles ESC + backdrop-click dismissal). */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          {selected && (
            <div className="space-y-3">
              <DialogHeader className="space-y-1.5">
                <DialogTitle className="font-heading text-base font-bold uppercase tracking-wide leading-tight">
                  {selected.project.split(' — ')[0]}
                </DialogTitle>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={selected.status}
                    label={isCancelledLead(selected) && selected.status === 'rejected' ? 'Cancelled' : undefined}
                  />
                  <span className="text-xs text-muted-foreground">{selected.id}</span>
                </div>
              </DialogHeader>

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

              {/* Appointment */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Appointment</p>
                <div className="flex items-center gap-2 text-sm text-foreground/90">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{fmtDateTime(selected.slot)}</span>
                </div>
              </div>

              {/* Price */}
              <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                <span className="text-sm text-muted-foreground font-medium">Price</span>
                <span className="text-lg font-bold font-heading text-foreground">{fmt(selected.value)}</span>
              </div>

              <Separator />

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
                    onClick={() => {
                      setSaleAmount('')
                      setSoldDialogOpen(true)
                    }}
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
                    {/* Assign Representative — required before Confirm can fire.
                        Two UIs: dropdown when vendor has reps on file, free-form
                        name input as fallback when reps[] is empty (e.g. Demo
                        Vendor path). */}
                    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                      <label htmlFor="assign-rep" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <UserCheck className="h-3.5 w-3.5 text-primary" />
                        Assign Representative
                        <span className="text-destructive">*</span>
                      </label>
                      {vendor?.reps && vendor.reps.length > 0 ? (
                        <>
                          <Select value={selectedRepId} onValueChange={setSelectedRepId}>
                            <SelectTrigger id="assign-rep" className="h-10 text-sm">
                              <SelectValue placeholder="Choose a rep for this lead…" />
                            </SelectTrigger>
                            <SelectContent>
                              {vendor.reps.map((rep) => (
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
                              Pick a rep before confirming so the homeowner knows who's coming out.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <input
                            id="assign-rep"
                            type="text"
                            value={adhocRepName}
                            onChange={(e) => setAdhocRepName(e.target.value)}
                            placeholder="Enter the rep's name"
                            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                            name="rep-name-no-autofill"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="words"
                            spellCheck={false}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            No reps on file yet. Type the rep's name — you can add a full roster later in Profile.
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={
                          vendor?.reps && vendor.reps.length > 0
                            ? !selectedRepId
                            : !adhocRepName.trim()
                        }
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
                            const rep: VendorRep | undefined =
                              vendor?.reps && vendor.reps.length > 0
                                ? vendor.reps.find((r) => r.id === selectedRepId)
                                : adhocRepName.trim()
                                  ? {
                                      id: typeof crypto !== 'undefined' && crypto.randomUUID
                                        ? `adhoc-${crypto.randomUUID()}`
                                        : `adhoc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                      name: adhocRepName.trim(),
                                    }
                                  : undefined
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
                            setAdhocRepName('')
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
                      onClick={() => {
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
              if (selected) {
                // Reschedule moves the lead to Confirmed regardless of sp backing.
                setLeadStatus(selected.id, 'confirmed')
                const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selected.id)
                if (sp) {
                  updateProjectBooking(sp.id, { date: rescheduleDate, time: rescheduleTime })
                  updateProjectStatus(sp.id, 'approved')
                }
              }
              setRescheduleOpen(false)
              setRescheduleDate('')
              setRescheduleTime('')
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
                if (selected) {
                  // Always flip the lead-status override so mock-leads move too.
                  setLeadStatus(selected.id, 'rejected')
                  const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selected.id)
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
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Sold Dialog */}
      <Dialog open={soldDialogOpen} onOpenChange={setSoldDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Mark as Sold</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Sale Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                  placeholder="Enter total sale amount"
                  className="w-full h-10 pl-7 pr-3 rounded-lg border border-input bg-background text-base"
                />
              </div>
            </div>
            {saleAmount && Number(saleAmount) > 0 && (
              <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sale Total</span>
                  <span className="font-bold">${Number(saleAmount).toLocaleString()}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">Vendor Share ({100 - vendor.commission_pct}%)</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">${Math.round(Number(saleAmount) * (1 - vendor.commission_pct / 100)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-700 dark:text-amber-400 font-medium">BuildConnect ({vendor.commission_pct}%)</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">${Math.round(Number(saleAmount) * (vendor.commission_pct / 100)).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoldDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!saleAmount || Number(saleAmount) <= 0}
              onClick={() => {
                if (selected) {
                  // Always flip the lead-status override so mock-leads move too.
                  setLeadStatus(selected.id, 'completed')
                  const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selected.id)
                  if (sp) {
                    markProjectSold(sp.id, Number(saleAmount))
                  }
                }
                setSoldDialogOpen(false)
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

      {/* Clear Demo Data confirmation — demo-mode gated (VITE_DEMO_MODE). */}
      <Dialog open={clearDemoDialogOpen} onOpenChange={setClearDemoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Clear Demo Data?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              This will erase ALL projects in the vendor queue (pending / confirmed / sold / archived),
              any assigned reps, and any in-progress booking handoff data.
            </p>
            <p className="text-xs">
              Intended for QA — resets your demo state so you can re-test flows from scratch.
              MOCK_LEADS fixtures (L-0001..L-0005) are not affected; only sentProjects and overrides get wiped.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDemoDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearDemoData}>Clear Demo Data</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Edit Rep Dialog — post-confirm rep swap, opened from LeadCard pencil. */}
      <Dialog open={editRepOpen} onOpenChange={setEditRepOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Change Representative</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {vendor?.reps && vendor.reps.length > 0 ? (
              <Select value={editRepChoice} onValueChange={setEditRepChoice}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Choose a rep…" />
                </SelectTrigger>
                <SelectContent>
                  {vendor.reps.map((rep) => (
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
              <input
                type="text"
                value={editAdhocRepName}
                onChange={(e) => setEditAdhocRepName(e.target.value)}
                placeholder="Enter the rep's name"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                name="edit-rep-name-no-autofill"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                spellCheck={false}
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              The homeowner will see the new rep the next time they open this appointment.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRepOpen(false)}>Cancel</Button>
            <Button
              disabled={
                vendor?.reps && vendor.reps.length > 0
                  ? !editRepChoice
                  : !editAdhocRepName.trim()
              }
              onClick={handleSaveEditRep}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
