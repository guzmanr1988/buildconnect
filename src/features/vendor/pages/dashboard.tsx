import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import {
  Inbox, DollarSign, CalendarCheck, Target, MapPin, BadgeCheck,
  Trash2, Shield, Star, MessageSquare, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { KpiCard } from '@/components/shared/kpi-card'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useCartStore } from '@/stores/cart-store'
import { useFlagThreadStore } from '@/stores/flag-thread-store'
import { useCommissionPaymentsStore } from '@/stores/commission-payments-store'
import { useVendorPermitsStore } from '@/stores/vendor-permits-store'
import { useVendorEventsStore } from '@/stores/vendor-events-store'
import { useAgreementEventsStore } from '@/stores/agreement-events-store'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useVendorScope, useResolvedVendor, contractorMatchesVendor } from '@/lib/vendor-scope'
import { LEAD_STAGES, STAGE_PULSE_BY_KEY, useVendorLeadStages } from '@/lib/vendor-lead-stages'
import { PipelineStatRow } from '@/components/shared/pipeline-stat-row'
import { SERVICE_CATALOG } from '@/lib/constants'
import type { Lead } from '@/types'

// Ship #293 — VendorDashboard slimmed down per Rodolfo "more clean
// dashboard" directive. The 5 status tiles + Lead Detail Modal +
// reschedule/sold/reject/cancel/edit-rep sub-dialogs all moved to
// /vendor/lead-workflow (new tab). Dashboard now holds:
// - Vendor Profile Card (with demo-data Clear/Restore buttons)
// - KPI Row (Active Leads / Pipeline Value / Booked This Month / Win Rate)
// - "View Lead Workflow →" link

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const container: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
}

export default function VendorDashboard() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  const accountRepIdByLead = useProjectsStore((s) => s.accountRepIdByLead)
  const { vendorId: VENDOR_ID, mockVendorId } = useVendorScope()
  const vendor = useResolvedVendor()
  const allMockLeads = useEffectiveMockLeads()
  const mockLeads = useMemo(() => {
    // pin-20 — MOCK_LEADS are seeded against synthetic mock-vendor-ids
    // ('v-1'..'v-5'). Only featured-mapped sessions (mockVendorId set)
    // should ever see fixture leads; real Apex / synthesized vendors
    // get an empty fixture set. Pre-fix this filtered on `vendorId`
    // which was a mock-id when mapped but profile.id otherwise — the
    // latter never equals a fixture vendor_id so it returned [] anyway,
    // but the explicit mockVendorId form removes the foot-gun.
    if (!mockVendorId) return []
    const vendorScoped = allMockLeads.filter((l) => l.vendor_id === mockVendorId)
    if (profile?.role === 'account_rep') {
      return vendorScoped.filter(
        (l) => l.account_rep_id === profile.id || accountRepIdByLead[l.id] === profile.id
      )
    }
    return vendorScoped
  }, [allMockLeads, mockVendorId, profile?.role, profile?.id, accountRepIdByLead])

  // Auth-redirect guard: non-vendor-family profile shouldn't render this
  // page. Redirect homeowners + admins to their respective home routes.
  // Ship #333 Phase A — account_rep is vendor-family (sees rep-scoped
  // dashboard at /vendor); allow through alongside vendor.
  useEffect(() => {
    if (profile !== null && profile.role !== 'vendor' && profile.role !== 'account_rep') {
      navigate(profile.role === 'homeowner' ? '/home' : '/admin', { replace: true })
    }
  }, [profile, navigate])

  // Demo-mode Clear Demo Data flow (preserved from pre-#293 dashboard).
  const demoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
  const [clearDemoDialogOpen, setClearDemoDialogOpen] = useState(false)
  const demoDataHidden = useAdminModerationStore((s) => s.demoDataHidden)
  const setDemoDataHidden = useAdminModerationStore((s) => s.setDemoDataHidden)
  const setDemoClearedAt = useAdminModerationStore((s) => s.setDemoClearedAt)
  // pin-26 (Fix D from task_931 RCA): subscribe to demoClearedAt for the
  // gate-aware banner below. demoMode-AND-gated so prod vendors with
  // genuinely 0 leads never see a "demo data cleared" message.
  const demoClearedAt = useAdminModerationStore((s) => s.demoClearedAt)
  const handleClearDemoData = () => {
    // Reset projects-store across ALL per-lead-keyed maps via callback-form
    // shallow-merge. Preserves _supabaseMigrationDone:true and _userUuid so
    // hydrate doesn't re-fire migration on reload (zustand_handler_partial_
    // write_default_fill class — apollo PR-B walker 2026-05-08).
    useProjectsStore.setState((s) => ({
      ...s,
      sentProjects: [],
      assignedRepByLead: {},
      accountRepIdByLead: {},
      repAcceptanceByLead: {},
      leadStatusOverrides: {},
      cancellationRequestsByLead: {},
      rescheduleRequestsByLead: {},
      leadConfirmedAtByLead: {},
      repAssignedAtByLead: {},
      leadCompletedAtByLead: {},
    }))
    // Active homeowner cart (in-progress projects pre-send).
    useCartStore.getState().clearCart()
    // Project-shaped peripheral stores — orphan refs to wiped sentProjects.
    useFlagThreadStore.setState({ threadsByProject: {} })
    useCommissionPaymentsStore.setState({ paymentsBySale: {} })
    // Vendor-keyed demo state that accumulates across test cycles.
    useVendorPermitsStore.setState({ permits: [], hydratedVendors: new Set() })
    useVendorEventsStore.setState({ eventsByVendor: {} })
    useAgreementEventsStore.setState({ events: [] })
    // Wave-18 #3 — useAdminMessagesStore retired; admin-vendor chat now
    // rides the lead-scoped messages table (real DB) and is wiped via the
    // normal lead-data reset path above.
    try {
      // NOTE: do NOT removeItem('buildconnect-projects') or rewrite it slim.
      // The setState above already shallow-merged + zustand persist auto-
      // wrote the full state (including _supabaseMigrationDone:true and
      // _userUuid). A slim 3-key rewrite drops 9 keys, so on reload the
      // persist merge() falls back to currentState defaults
      // (_supabaseMigrationDone:false), which re-triggers
      // hydrateFromSupabase's migration block — perceived data resurrection.
      localStorage.removeItem('buildconnect-cart')
      localStorage.removeItem('buildconnect-flag-thread')
      localStorage.removeItem('buildconnect-commission-payments')
      localStorage.removeItem('buildconnect-vendor-permits')
      localStorage.removeItem('buildconnect-vendor-events')
      localStorage.removeItem('buildconnect-agreement-events')
      // Wave-18 #3 cleanup — sweep the legacy SEED key from any browser
      // that still carries the persisted Zustand snapshot from pre-#3 builds.
      localStorage.removeItem('buildconnect-admin-messages')
      localStorage.removeItem('buildconnect-pending-item')
      localStorage.removeItem('buildconnect-selected-contractor')
      localStorage.removeItem('buildconnect-selected-booking')
      localStorage.removeItem('buildconnect-homeowner-info')
      localStorage.removeItem('buildconnect-id-document')
    } catch { /* storage errors non-fatal */ }
    setDemoDataHidden(true)
    // Sentinel for hydrateFromSupabase — sent_projects rows persist
    // server-side; this flag tells every role's hydrate path to skip the
    // server replay so the wipe survives reload + role switch.
    setDemoClearedAt(new Date().toISOString())
    setClearDemoDialogOpen(false)
  }
  const handleRestoreDemoData = () => {
    setDemoDataHidden(false)
    setDemoClearedAt(null)
  }

  // Ship #303 — Lead Workflow stage counts for the compact summary
  // row inside Performance Stats card. Uses useVendorLeadStages
  // shared helper (same source-of-truth as /vendor/lead-workflow
  // tile counts). KPI derivations below remain inline for now —
  // they use slightly different bucketing semantics (cancellation-
  // filtered active-leads, pipelineValue summed across active +
  // sold per pin-27 Rod-intent "sold = booked revenue").
  // format-SoT-shared-helper #103 trigger ALSO met for KPI logic
  // at n=3 consumers but holding extraction until those semantics
  // align.
  const { counts: leadStageCounts } = useVendorLeadStages()

  // Leads-derivation for KPI counts (cancellation-aware bucketing).
  // Same shape as pre-#293; live-status overrides + cancellation
  // sub-state both flow through.
  const statusMap: Record<string, Lead['status']> = { pending: 'pending', approved: 'confirmed', declined: 'rejected', sold: 'completed' }
  // account_rep sees only mock leads stamped with their id.
  // homeownerLeads (sentProjects) have no account_rep_id, so reps get an empty list here.
  const homeownerLeads: Lead[] = useMemo(() => {
    if (profile?.role === 'account_rep') return []
    if (!vendor) return []
    return sentProjects
      .filter((p) => contractorMatchesVendor(p.contractor, vendor))
      .map((p) => ({
      id: `L-${p.id.slice(0, 4).toUpperCase()}`,
      homeowner_id: 'ho-current',
      vendor_id: VENDOR_ID,
      homeowner_name: p.homeowner?.name || 'New Customer',
      project: p.item.serviceName + ' — ' + Object.values(p.item.selections ?? {}).flat().map((s) => s.replace(/_/g, ' ')).join(', '),
      status: (statusMap[p.status] || 'pending') as Lead['status'],
      // pin-27 (task_1781159869876_405): carry saleAmount as Lead.value
      // for sold projects so Pipeline Value KPI reflects booked revenue
      // per Rod-intent "sold = booked revenue". Non-sold leads stay at 0
      // (homeowner-submitted projects don't carry a price upfront).
      value: p.saleAmount ?? 0,
      address: p.homeowner?.address || 'Pending site visit',
      phone: p.homeowner?.phone || '—',
      email: p.homeowner?.email || '—',
      sq_ft: 0,
      service_category: p.item.serviceId as Lead['service_category'],
      permit_choice: Object.values(p.item.selections ?? {}).flat().includes('permit'),
      financing: Object.values(p.item.selections ?? {}).flat().includes('financed'),
      pack_items: p.item.selections,
      slot: p.sentAt,
      received_at: p.sentAt,
    }))
  }, [sentProjects, VENDOR_ID, profile?.role, vendor])

  const leads = useMemo(() => {
    const combined = [...homeownerLeads, ...mockLeads]
    return combined.map((l) =>
      leadStatusOverrides[l.id] ? { ...l, status: leadStatusOverrides[l.id] } : l,
    )
  }, [mockLeads, homeownerLeads, leadStatusOverrides])

  // KPI calculations — cancellation-aware so the active/win counts
  // exclude approved-cancellations even if the lead row still carries
  // a non-cancelled status (#171 read-back-compat).
  const isCancelled = (l: Lead): boolean => {
    if (l.status === 'cancelled' || l.status === 'rejected') return true
    const cReq = cancellationRequestsByLead[l.id]
    return cReq?.status === 'approved'
  }
  const activeLeads = leads.filter((l) =>
    !isCancelled(l) && (l.status === 'pending' || l.status === 'confirmed' || l.status === 'rescheduled'),
  )
  // pin-27 (task_1781159869876_405): sold = booked revenue, per Rod
  // intent. Sold projects (statusMap 'sold'->'completed') feed both
  // Pipeline Value (sum sale_amount) and Booked This Month (count).
  // Active Leads count stays unchanged — sold ≠ active.
  const soldLeads = leads.filter((l) => !isCancelled(l) && l.status === 'completed')
  const pipelineValue =
    activeLeads.reduce((sum, l) => sum + l.value, 0) +
    soldLeads.reduce((sum, l) => sum + l.value, 0)
  const confirmedLeads = leads.filter((l) => !isCancelled(l) && l.status === 'confirmed')
  const bookedThisMonth = confirmedLeads.length + soldLeads.length
  const totalDecided = leads.filter((l) =>
    !isCancelled(l) && ['confirmed', 'completed', 'rejected', 'cancelled'].includes(l.status),
  ).length + leads.filter(isCancelled).length
  const wins = leads.filter((l) => !isCancelled(l) && (l.status === 'confirmed' || l.status === 'completed')).length
  const winRate = totalDecided > 0 ? Math.round((wins / totalDecided) * 100) : 0

  const serviceNames = useMemo(
    () => (vendor?.service_categories ?? []).map((cat) => SERVICE_CATALOG.find((s) => s.id === cat)?.name || cat),
    [vendor?.service_categories],
  )

  if (!vendor) {
    return (
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-3 sm:space-y-6">
        <Card className="rounded-xl">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Loading vendor profile…</p>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-3 sm:space-y-6">
      {/* pin-26 (Fix D from task_931 RCA): demoClearedAt banner — visible
          ONLY when demoMode AND demoClearedAt set AND no real sentProjects.
          Gating on demoMode keeps the banner a dev/demo aid; in prod
          (VITE_DEMO_MODE='false') demoMode=false so a real vendor with
          genuinely 0 leads never sees a misleading "reset from
          /admin/moderation" message. Paired with Fix B (projects-store
          demoMode-AND-gate) so the gate-to-effect can never again be
          silent: if the gate fires the banner explains why + points at
          the reset surface. */}
      {demoMode && demoClearedAt && sentProjects.length === 0 && (
        <motion.div variants={item}>
          <div
            data-testid="vendor-dashboard-demo-cleared-banner"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <span className="font-medium">Demo data cleared.</span>{' '}
            Only real leads will appear here. Reset from{' '}
            <a href="/admin/moderation" className="font-medium underline underline-offset-2 hover:opacity-80">
              /admin/moderation
            </a>
            .
          </div>
        </motion.div>
      )}
      {/* Vendor Profile Card — Ship #301 (refines #300):
          (1) Mobile portrait: badges (Verified + Active) drop to a
              bottom-left row below the identity block per Rodolfo
              "place it at the bottom left". Demo controls take the
              right side of that same bottom row (justify-between).
          (2) Landscape phones (568-932px wide) now hit the inline
              desktop-style layout instead of the mobile bottom-row
              layout. Layout-mode breakpoint switched from sm: (640px)
              to min-[480px]: so any landscape orientation phone gets
              the wider single-row layout. Sizing classes also use
              min-[480px]: for consistency.
          History: #294 added Service Categories + Performance Stats;
          #299 fixed Performance Stats mobile; #300 fixed Vendor
          Profile mobile cramming via dual-render bottom-row pattern. */}
      <motion.div variants={item}>
        <Card className="rounded-xl">
          <CardContent className="p-4 min-[480px]:p-6">
            <div className="flex items-center gap-3 min-[480px]:gap-4">
              <AvatarInitials initials={vendor.initials} color={vendor.avatar_color} size="lg" />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg min-[480px]:text-xl font-bold font-heading truncate min-[480px]:inline-block min-[480px]:mr-2">{vendor.company}</h2>
                {/* Inline badges — visible at min-[480px]+ (landscape phones + larger).
                    Mobile portrait renders these in the bottom-left row instead. */}
                <div className="hidden min-[480px]:inline-flex items-center gap-2 flex-wrap align-middle">
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
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1 min-w-0">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{vendor.address}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{vendor.name} &middot; {vendor.phone}</p>
              </div>
              {/* Demo controls — inline (right side) at min-[480px]+ */}
              {demoMode && (
                <div className="hidden min-[480px]:flex items-center gap-2 shrink-0">
                  {demoDataHidden && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={handleRestoreDemoData}
                      aria-label="Restore demo data"
                    >
                      Restore Demo Data
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
                    onClick={() => setClearDemoDialogOpen(true)}
                    aria-label="Clear demo data"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear Demo Data
                  </Button>
                </div>
              )}
            </div>
            {/* Mobile-portrait bottom row: badges left + demo controls right.
                Hidden at min-[480px]+ (where badges go inline + demo goes
                right of identity row). */}
            <div className="flex min-[480px]:hidden items-center justify-between gap-2 mt-3 pt-3 border-t">
              <div className="flex items-center gap-1.5 flex-wrap">
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
              {demoMode && (
                <div className="flex items-center gap-2 shrink-0">
                {demoDataHidden && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleRestoreDemoData}
                    aria-label="Restore demo data"
                  >
                    Restore
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
                  onClick={() => setClearDemoDialogOpen(true)}
                  aria-label="Clear demo data"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Ship #305 — Lead Workflow at-a-glance block. Relocated from
          inside Performance Stats card (#303 original placement) to
          standalone position directly under Vendor Profile per Rodolfo
          "move leadflow under vendor info".
          PR-275 — upgraded from the compact icon-strip to the full
          PipelineStatRow primitive shared with admin/workflow and
          vendor/lead-workflow. Same SoT via useVendorLeadStages
          (#103 preserved). hrefForStage maintains the #310 deep-link
          contract via Link wrap. Account_rep role hides 'new'
          (admin-confirms-bookings out-of-role). */}
      <motion.div variants={item}>
        <div className="rounded-xl bg-muted/30 dark:bg-muted/10 px-3 py-3 sm:px-4 sm:py-4">
          <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 sm:mb-3">Lead Workflow</p>
          <PipelineStatRow
            stages={LEAD_STAGES.filter((s) => profile?.role !== 'account_rep' || s.key !== 'new')}
            counts={leadStageCounts}
            hrefForStage={(k) => `/vendor/lead-workflow?stage=${k}`}
            pulseByKey={STAGE_PULSE_BY_KEY}
            testIdPrefix="vendor-pipeline-stage"
          />
        </div>
      </motion.div>

      {/* Ship #294 — Service Categories moved from /vendor/profile per
          Rodolfo "move service categories and performance stats to
          dashboard". Read-only display; vendor edits via Request Info
          Change flow on /vendor/profile. */}
      {serviceNames.length > 0 && (
        <motion.div variants={item}>
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Service Categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {serviceNames.map((name) => (
                  <Badge key={name} variant="secondary" className="text-sm px-3 py-1.5">
                    {name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* KPI Row — 2-col x 2-row stacked pairs (Rod ask task_975):
          COL-1 Active Leads / Pipeline Value stacked, COL-2 Booked This
          Month / Win Rate stacked. grid-flow-col fills column-first so
          DOM order 1/2/3/4 lands (col1-row1)/(col1-row2)/(col2-row1)/
          (col2-row2). Fixed 2x2 at all breakpoints so both mobile
          portrait and desktop show the same paired-column visual —
          matches Rod's slim single-layout intent. Tiles use dense
          variant (surface-scoped, admin consumers of KpiCard keep
          their p-3.5 default; kratos guard 1). Overflow guard
          (kratos guard 2 / task_116-adjacent): min-w-0 on grid cell,
          truncate on value inside KpiCard already handles narrow
          viewports; gap-2 keeps 2 tiles readable on ~340px screens. */}
      <div className="kpi-grid grid grid-cols-2 grid-rows-2 grid-flow-col gap-2 sm:gap-3">
        <motion.div variants={item} className="min-w-0" data-kpi="active-leads" data-kpi-value={activeLeads.length}>
          <KpiCard dense title="Active Leads" value={String(activeLeads.length)} change="+12% vs last month" trend="up" icon={Inbox} iconColor="bg-primary" />
        </motion.div>
        <motion.div variants={item} className="min-w-0" data-kpi="pipeline-value" data-kpi-value={pipelineValue}>
          <KpiCard dense title="Pipeline Value" value={fmt(pipelineValue)} change="+8% vs last month" trend="up" icon={DollarSign} iconColor="bg-amber-500" />
        </motion.div>
        <motion.div variants={item} className="min-w-0" data-kpi="booked-this-month" data-kpi-value={bookedThisMonth}>
          <KpiCard dense title="Booked This Month" value={String(bookedThisMonth)} change="+2 from last week" trend="up" icon={CalendarCheck} iconColor="bg-emerald-500" />
        </motion.div>
        <motion.div variants={item} className="min-w-0" data-kpi="win-rate" data-kpi-value={winRate}>
          <KpiCard dense title="Win Rate" value={`${winRate}%`} change="+5pp vs last quarter" trend="up" icon={Target} iconColor="bg-violet-500" />
        </motion.div>
      </div>

      {/* Performance Stats — hidden for account_rep (vendor-wide metrics
          like rating + total_reviews can't be rep-scoped; MATH IS GOD).
          Also hidden when total_reviews is 0 (data doesn't exist; unbuilt feature). */}
      {profile?.role !== 'account_rep' && vendor.total_reviews > 0 && (
      <motion.div variants={item}>
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Performance Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-3 sm:gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
                <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-2 sm:p-3 shrink-0">
                  <Star className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold font-heading">{vendor.rating}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Average Rating</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
                <div className="rounded-xl bg-primary/10 p-2 sm:p-3 shrink-0">
                  <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold font-heading">{vendor.total_reviews}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Total Reviews</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
                <div className="rounded-xl bg-emerald-100 dark:bg-emerald-900/30 p-2 sm:p-3 shrink-0">
                  <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold font-heading">{vendor.response_time}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Avg Response Time</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Review Breakdown</p>
              <div className="space-y-2.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const pcts: Record<number, number> = { 5: 72, 4: 18, 3: 7, 2: 2, 1: 1 }
                  const pct = pcts[stars]
                  return (
                    <div key={stars} className="flex items-center gap-2 sm:gap-3">
                      <span className="text-sm font-medium w-5 sm:w-6 text-right">{stars}</span>
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden min-w-0">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-9 sm:w-10 text-right shrink-0">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      )}

      {/* Ship #304 — "View Lead Workflow ->" CTA removed per Rodolfo
          "remove view lead workflow letters and arrow". Redundant with
          the Lead Workflow icon+count row (originally inside Performance
          Stats per #303; relocated standalone above per #305).
          Ship #305 — Lead Workflow row moved per Rodolfo "move
          leadflow under vendor info" — now sits between Vendor Profile
          Card and Performance Stats Card. See block above this comment. */}

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
    </motion.div>
  )
}
