import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import {
  Inbox, DollarSign, CalendarCheck, Target, MapPin, BadgeCheck,
  Trash2, ArrowRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { KpiCard } from '@/components/shared/kpi-card'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useVendorScope, useResolvedVendor } from '@/lib/vendor-scope'
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
  const { vendorId: VENDOR_ID } = useVendorScope()
  const vendor = useResolvedVendor()
  const mockLeads = useEffectiveMockLeads()

  // Auth-redirect guard: non-vendor profile (e.g. QA persona left in
  // auth-store) shouldn't render this page. Redirect homeowners + admins.
  useEffect(() => {
    if (profile !== null && profile.role !== 'vendor') {
      navigate(profile.role === 'homeowner' ? '/home' : '/admin', { replace: true })
    }
  }, [profile, navigate])

  // Demo-mode Clear Demo Data flow (preserved from pre-#293 dashboard).
  const demoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
  const [clearDemoDialogOpen, setClearDemoDialogOpen] = useState(false)
  const demoDataHidden = useAdminModerationStore((s) => s.demoDataHidden)
  const setDemoDataHidden = useAdminModerationStore((s) => s.setDemoDataHidden)
  const handleClearDemoData = () => {
    useProjectsStore.setState({
      sentProjects: [],
      assignedRepByLead: {},
      leadStatusOverrides: {},
    })
    try {
      localStorage.removeItem('buildconnect-projects')
      localStorage.setItem(
        'buildconnect-projects',
        JSON.stringify({
          state: { sentProjects: [], assignedRepByLead: {}, leadStatusOverrides: {} },
          version: 0,
        }),
      )
      localStorage.removeItem('buildconnect-pending-item')
      localStorage.removeItem('buildconnect-selected-contractor')
      localStorage.removeItem('buildconnect-selected-booking')
      localStorage.removeItem('buildconnect-homeowner-info')
      localStorage.removeItem('buildconnect-id-document')
    } catch { /* storage errors non-fatal */ }
    setDemoDataHidden(true)
    setClearDemoDialogOpen(false)
  }
  const handleRestoreDemoData = () => {
    setDemoDataHidden(false)
  }

  // Leads-derivation for KPI counts (cancellation-aware bucketing).
  // Same shape as pre-#293; live-status overrides + cancellation
  // sub-state both flow through.
  const statusMap: Record<string, Lead['status']> = { pending: 'pending', approved: 'confirmed', declined: 'rejected', sold: 'completed' }
  const homeownerLeads: Lead[] = useMemo(() => sentProjects
    .map((p) => ({
      id: `L-${p.id.slice(0, 4).toUpperCase()}`,
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
      service_category: p.item.serviceId as Lead['service_category'],
      permit_choice: Object.values(p.item.selections).flat().includes('permit'),
      financing: Object.values(p.item.selections).flat().includes('financed'),
      pack_items: p.item.selections,
      slot: p.sentAt,
      received_at: p.sentAt,
    })), [sentProjects, VENDOR_ID])

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
  const pipelineValue = activeLeads.reduce((sum, l) => sum + l.value, 0)
  const confirmedLeads = leads.filter((l) => !isCancelled(l) && l.status === 'confirmed')
  const bookedThisMonth = confirmedLeads.length
  const totalDecided = leads.filter((l) =>
    !isCancelled(l) && ['confirmed', 'completed', 'rejected', 'cancelled'].includes(l.status),
  ).length + leads.filter(isCancelled).length
  const wins = leads.filter((l) => !isCancelled(l) && (l.status === 'confirmed' || l.status === 'completed')).length
  const winRate = totalDecided > 0 ? Math.round((wins / totalDecided) * 100) : 0

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
      {/* Vendor Profile Card */}
      <motion.div variants={item}>
        <Card className="rounded-xl">
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
                <div className="flex items-center gap-2 shrink-0">
                  {demoDataHidden && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={handleRestoreDemoData}
                      aria-label="Restore demo data"
                    >
                      <span className="hidden sm:inline">Restore Demo Data</span>
                      <span className="sm:hidden">Restore</span>
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
                    <span className="hidden sm:inline">Clear Demo Data</span>
                  </Button>
                </div>
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

      {/* Ship #293 — Lead Workflow link. Discoverability into the
          pipeline-stage funnel that lives at /vendor/lead-workflow. */}
      <motion.div variants={item}>
        <Link
          to="/vendor/lead-workflow"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          data-vendor-dashboard-lead-workflow-link
        >
          View Lead Workflow
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </motion.div>

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
