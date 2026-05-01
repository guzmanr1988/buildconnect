import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { GitBranch, Inbox, CalendarCheck, Handshake, ArrowRight, User, Calendar, Archive, Search, ChevronDown, ChevronUp, UserCheck, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { ProjectDetailDialog } from '@/components/shared/project-detail-dialog'
import { useProjectsStore } from '@/stores/projects-store'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { useEffectiveMockLeads, useEffectiveMockClosedSales } from '@/lib/mock-data-effective'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { matchesSearch } from '@/lib/search-match'
import { deriveInitials } from '@/lib/initials'
import { cn } from '@/lib/utils'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function WorkflowPage() {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  // Ship #250 — effective-fixture hooks honor the demoDataHidden flag.
  const mockLeads = useEffectiveMockLeads()
  const mockClosedSales = useEffectiveMockClosedSales()

  // Ship #212 (Rodolfo-direct P0 diagnostic) — leads-empty arc.
  // Log admin-workflow read snapshot on sentProjects mutation so we
  // can observe whether the write lands in the store as admin sees it.
  // VITE_DEMO_MODE-gated.
  useEffect(() => {
    if ((import.meta.env.VITE_DEMO_MODE ?? 'true') === 'false') return
    // eslint-disable-next-line no-console
    console.log('[#212 leads-diag] admin/workflow READ snapshot:', {
      sentProjects_length: sentProjects.length,
      entries: sentProjects.slice(0, 10).map((p) => ({
        id: p.id,
        itemId: p.item?.id,
        serviceName: p.item?.serviceName,
        contractor_vendor_id: p.contractor?.vendor_id,
        contractor_company: p.contractor?.company,
        status: p.status,
        sentAt: p.sentAt,
      })),
      leadStatusOverrides_keys: Object.keys(leadStatusOverrides),
    })
  }, [sentProjects, leadStatusOverrides])

  // Per-vendor commission % override (ship #130 store) — drives the per-lead
  // commission split render in sold-card rows. Live-ripple: admin edits % on
  // /admin/vendors → getVendorCommission returns the new value → card split
  // recalcs on next render. Phase 3 admin commercial-control per kratos msg
  // 1776742245468.
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  const rehydrateModeration = useCallback(() => useAdminModerationStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateModeration)
  const resolveCommissionPct = useCallback(
    (companyName?: string): number => {
      if (!companyName) return 15
      const v = MOCK_VENDORS.find((x) => x.company === companyName)
      if (!v) return 15
      return vendorCommissionOverrides[v.id] ?? v.commission_pct
    },
    [vendorCommissionOverrides],
  )
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [searchParams, setSearchParams] = useSearchParams()

  // Cross-tab refetch: zustand updates within the same tab trigger re-renders
  // automatically, but vendor/homeowner actions from another tab only persist
  // to localStorage. When admin tabs back into /admin/workflow, rehydrate from
  // localStorage so the pipeline reflects actions taken elsewhere.
  const rehydrate = useCallback(() => {
    useProjectsStore.persist.rehydrate()
  }, [])
  useRefetchOnFocus(rehydrate)

  // Convert sent projects (cart-created homeowner flow) into pipeline items.
  // status flows end-to-end from homeowner submit → vendor confirm → vendor
  // sold → admin view. Cancellation-approved entries move to 'cancelled'.
  const projectItems = useMemo(() => sentProjects.map((p) => {
    const leadKey = `L-${p.id.slice(0, 4).toUpperCase()}`
    const cReq = cancellationRequestsByLead[leadKey] ?? cancellationRequestsByLead[p.id]
    const cancelApproved = cReq?.status === 'approved'
    return {
      id: p.id,
      name: p.homeowner?.name || 'Customer',
      project: p.item.serviceName,
      date: p.sentAt,
      initials: deriveInitials(p.homeowner?.name || 'Customer'),
      vendor: p.contractor?.company,
      rep: p.assignedRep?.name,
      status: cancelApproved ? 'declined' : p.status,
      soldAt: p.soldAt,
      saleAmount: p.saleAmount,
      pendingCancel: cReq?.status === 'pending',
    }
  }), [sentProjects, cancellationRequestsByLead])

  // MOCK_LEADS fixtures merged through leadStatusOverrides (vendor actions) and
  // cancellationRequestsByLead (admin-mediated cancellation). Previously only
  // read raw MOCK_LEADS.status, so vendor confirm/reject/sold flows were
  // invisible to admin — kratos msg 1776725074142.
  const mockStatusMap: Record<string, 'pending' | 'approved' | 'sold' | 'declined'> = {
    pending: 'pending',
    confirmed: 'approved',
    completed: 'sold',
    rejected: 'declined',
    rescheduled: 'pending',
  }
  const mockItems = useMemo(() => mockLeads.map((l) => {
    const rawStatus = leadStatusOverrides[l.id] ?? l.status
    const cReq = cancellationRequestsByLead[l.id]
    const cancelApproved = cReq?.status === 'approved'
    const mappedStatus = cancelApproved ? 'declined' : (mockStatusMap[rawStatus] ?? 'pending')
    const vendor = MOCK_VENDORS.find((v) => v.id === l.vendor_id)
    // Bridge to MOCK_CLOSED_SALES so fixture-completed leads carry saleAmount
    // + soldAt on the admin pipeline view. Gate on mappedStatus === 'sold' so
    // internally-inconsistent seed (closed_sale entry referencing a pending/
    // confirmed lead — cs-3/L-0001 at rest) doesn't leak a saleAmount onto
    // a non-sold pipeline item. Ship #142 P0 fix per kratos msg 1776745930680.
    const closedSale = mockClosedSales.find((c) => c.lead_id === l.id)
    const isSold = mappedStatus === 'sold'
    return {
      id: l.id,
      name: l.homeowner_name,
      project: l.project.split('—')[0].trim(),
      date: l.received_at,
      initials: deriveInitials(l.homeowner_name),
      vendor: vendor?.company ?? 'Unknown vendor',
      rep: assignedRepByLead[l.id]?.name,
      status: mappedStatus,
      soldAt: isSold ? closedSale?.closed_at : undefined,
      saleAmount: isSold ? closedSale?.sale_amount : undefined,
      pendingCancel: cReq?.status === 'pending',
    }
  }), [assignedRepByLead, leadStatusOverrides, cancellationRequestsByLead, mockLeads, mockClosedSales])

  const allItems = [...projectItems, ...mockItems]

  // Deep-link auto-open (ship #139 kept for bookmarkability; ship #140
  // refactor: open the shared ProjectDetailDialog in-place on whichever
  // admin surface the user is on, rather than navigating here. Deep-link
  // path still works for direct URL hits).
  useEffect(() => {
    const projectId = searchParams.get('project')
    if (!projectId || selectedProjectId) return
    setSelectedProjectId(projectId)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('project')
      return next
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Multi-field search (ship #134): homeowner name / project / vendor
  // company / lead ID / rep name. Pipeline items don't carry phone or
  // address directly — that info lives on the source MOCK_LEADS /
  // sentProjects; omitted here for simplicity (workflow is a pipeline
  // triage view, not a contact-lookup surface).
  const filtered = searchQuery.trim()
    ? allItems.filter((i) =>
        matchesSearch({
          query: searchQuery,
          fields: [i.name, i.project, i.vendor, i.rep],
          ids: [i.id],
        }),
      )
    : allItems

  // 5-column lifecycle aligned to vendor-dashboard ship #92 + /admin/workflow
  // parity per kratos msg 1776741764224. Sold-age split via SOLD_TO_COMPLETED_DAYS
  // (=90d, same threshold as vendor dashboard) separates currently-active
  // ("Project Sold") from truly-completed ("Projects Completed").
  const SOLD_TO_COMPLETED_DAYS = 90
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = Date.now()
  const soldAgeDays = (soldAt?: string): number | null => {
    if (!soldAt) return null
    return (now - new Date(soldAt).getTime()) / DAY_MS
  }

  const newLeads = filtered.filter(i => i.status === 'pending')
  const scheduledLeads = filtered.filter(i => i.status === 'approved')
  const projectSold = filtered.filter(i => {
    if (i.status !== 'sold') return false
    const age = soldAgeDays(i.soldAt)
    return age === null || age < SOLD_TO_COMPLETED_DAYS
  })
  const projectsCompleted = filtered.filter(i => {
    if (i.status !== 'sold') return false
    const age = soldAgeDays(i.soldAt)
    return age !== null && age >= SOLD_TO_COMPLETED_DAYS
  })
  const cancelledProjects = filtered.filter(i => i.status === 'declined')

  const stages = [
    { title: 'New Leads', subtitle: undefined, subtitleColor: undefined, icon: Inbox, color: 'bg-amber-500', borderColor: 'border-amber-300', bgColor: 'bg-amber-50 dark:bg-amber-950/20', items: newLeads },
    { title: 'Scheduled Leads', subtitle: undefined, subtitleColor: undefined, icon: CalendarCheck, color: 'bg-emerald-500', borderColor: 'border-emerald-300', bgColor: 'bg-emerald-50 dark:bg-emerald-950/20', items: scheduledLeads },
    { title: 'Sold, Active', subtitle: undefined, subtitleColor: undefined, icon: Handshake, color: 'bg-primary', borderColor: 'border-primary/30', bgColor: 'bg-primary/5 dark:bg-primary/10', items: projectSold },
    { title: 'Projects Completed', subtitle: undefined, subtitleColor: undefined, icon: Archive, color: 'bg-slate-500', borderColor: 'border-slate-300', bgColor: 'bg-slate-50 dark:bg-slate-950/20', items: projectsCompleted },
    { title: 'Cancelled Projects', subtitle: undefined, subtitleColor: undefined, icon: X, color: 'bg-destructive', borderColor: 'border-destructive/30', bgColor: 'bg-destructive/5 dark:bg-destructive/10', items: cancelledProjects },
  ]

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  } satisfies Variants
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  } satisfies Variants

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Workflow" description="Pipeline overview across all stages">
        <Badge variant="outline" className="text-xs gap-1">
          <GitBranch className="h-3 w-3" />
          {allItems.length} total leads
        </Badge>
      </PageHeader>

      {/* Search */}
      <motion.div variants={item}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, project, vendor, rep, or lead ID..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </motion.div>

      {/* Pipeline Summary — 5 columns matching vendor dashboard lifecycle */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {stages.map((stage, idx) => (
            <div key={stage.title} className="flex items-center gap-2 sm:gap-3 flex-1">
              <div className={cn('flex-1 rounded-xl border p-3 sm:p-4 text-center', stage.bgColor, stage.borderColor)} data-workflow-stage={stage.title} data-workflow-count={stage.items.length}>
                <div className={cn('inline-flex items-center justify-center rounded-lg p-2 mb-2', stage.color)}>
                  <stage.icon className="h-4 w-4 text-white" />
                </div>
                <p className="text-2xl font-bold font-heading">{stage.items.length}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{stage.title}</p>
                {stage.subtitle && (
                  <p className={cn('text-[9px] font-semibold uppercase tracking-wider mt-0.5', stage.subtitleColor ?? 'text-muted-foreground')}>
                    {stage.subtitle}
                  </p>
                )}
              </div>
              {idx < stages.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0 hidden lg:block" />
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Kanban Columns */}
      <div className="flex flex-col gap-4">
        {stages.map((stage) => {
          const isOpen = openSections[stage.title] || false
          return (
          <motion.div key={stage.title} variants={item}>
            <Card className="rounded-xl shadow-sm">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setOpenSections(prev => ({ ...prev, [stage.title]: !prev[stage.title] }))}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn('rounded-lg p-1.5', stage.color)}>
                        <stage.icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex flex-col">
                        <CardTitle className="text-sm font-heading">{stage.title}</CardTitle>
                        {stage.subtitle && (
                          <span className={cn('text-[10px] font-semibold uppercase tracking-wider leading-none mt-0.5', stage.subtitleColor ?? 'text-muted-foreground')}>
                            {stage.subtitle}
                          </span>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs">{stage.items.length}</Badge>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </button>
              <AnimatePresence initial={false}>
              {isOpen && (
              <motion.div
                key="workflow-stage-expanded"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
              <CardContent className="space-y-2 max-h-[400px] overflow-y-auto pt-0">
                {stage.items.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    No items in this stage
                  </div>
                ) : (
                  stage.items.map((lead) => (
                    <div
                      key={lead.id}
                      className={cn(
                        'rounded-lg border p-3 space-y-2 hover:shadow-md transition cursor-pointer',
                        stage.bgColor
                      )}
                      data-workflow-lead={lead.id}
                      data-workflow-lead-stage={stage.title}
                      onClick={() => setSelectedProjectId(lead.id)}
                    >
                      <div className="flex items-center gap-2">
                        <AvatarInitials initials={lead.initials} color="#64748b" size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{lead.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{lead.project}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {fmtDate(lead.date)}
                        </span>
                        {lead.vendor && (
                          <span className="flex items-center gap-1 truncate">
                            <User className="h-3 w-3" />
                            {lead.vendor}
                          </span>
                        )}
                        {lead.rep && (
                          <span className="flex items-center gap-1 truncate text-primary">
                            <UserCheck className="h-3 w-3" />
                            {lead.rep}
                          </span>
                        )}
                      </div>
                      {lead.soldAt && (
                        <p className="text-[10px] text-primary font-medium">
                          Sold {fmtDate(lead.soldAt)}
                        </p>
                      )}
                      {lead.pendingCancel && (
                        <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-500/40">
                          Cancel request pending
                        </Badge>
                      )}
                      {lead.status === 'sold' && lead.saleAmount && lead.saleAmount > 0 && (() => {
                        // Mirror vendor-banking display shape (kratos msg
                        // 1776742302054 P0): Sale Total / Vendor's Share <pct>%
                        // (emerald) / BuildConnect Commission <pct>% (amber).
                        // Vendor sees "Your <pct>%" in banking; admin sees
                        // "Vendor's <pct>%" — same numbers, inverse register.
                        const commissionPct = resolveCommissionPct(lead.vendor)
                        const vendorPct = 100 - commissionPct
                        const bcAmount = Math.round(lead.saleAmount * (commissionPct / 100))
                        const vendorAmount = lead.saleAmount - bcAmount
                        return (
                          <div className="rounded bg-background/80 p-2 space-y-1 text-[10px] border">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Sale Total</span>
                              <span className="font-bold">${lead.saleAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                              <span className="font-medium">Vendor's Share {vendorPct}%</span>
                              <span className="font-bold">${vendorAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-amber-700 dark:text-amber-400">
                              <span className="font-medium">BuildConnect Commission {commissionPct}%</span>
                              <span className="font-bold">${bcAmount.toLocaleString()}</span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ))
                )}
              </CardContent>
              </motion.div>
              )}
              </AnimatePresence>
            </Card>
          </motion.div>
          )
        })}
      </div>

      {/* Project Detail Dialog — shared ProjectDetailDialog (ship #140) used
          across /admin/workflow + /admin/homeowners + /admin/transactions so
          the same canonical detail view opens in-place regardless of entry
          surface. */}
      <ProjectDetailDialog
        open={!!selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
        projectId={selectedProjectId}
        viewMode="admin-workflow"
      />
    </motion.div>
  )
}
