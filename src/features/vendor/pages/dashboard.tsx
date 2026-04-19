import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Inbox, DollarSign, CalendarCheck, Target, MapPin, BadgeCheck,
  Phone, Mail, Ruler, FileCheck, CreditCard, CalendarClock,
  Check, X, RotateCcw, Clock, ChevronDown, ChevronUp, Handshake, Archive,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Separator } from '@/components/ui/separator'
import { KpiCard } from '@/components/shared/kpi-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { MOCK_VENDORS, MOCK_LEADS, MOCK_CLOSED_SALES, MOCK_AVAILABLE_SLOTS } from '@/lib/mock-data'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectsStore } from '@/stores/projects-store'
import { cn } from '@/lib/utils'
import type { Lead, Vendor } from '@/types'

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
  // from profile when not.
  const vendor: Vendor | null = useMemo(() => {
    if (mockVendorId) {
      const m = MOCK_VENDORS.find((v) => v.id === mockVendorId)
      if (m) return m
    }
    if (!profile) return null
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: 'vendor',
      phone: profile.phone ?? '',
      address: profile.address ?? '',
      company: profile.company ?? profile.name,
      avatar_color: profile.avatar_color ?? '#3b82f6',
      initials: profile.initials ?? profile.name.slice(0, 2).toUpperCase(),
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

  const mockLeads = useMemo(() => MOCK_LEADS.filter((l) => l.vendor_id === VENDOR_ID), [VENDOR_ID])
  const closedSales = useMemo(() => MOCK_CLOSED_SALES.filter((s) => s.vendor_id === VENDOR_ID), [VENDOR_ID])

  // Convert sent projects from homeowner side into lead-like objects
  const statusMap: Record<string, Lead['status']> = { pending: 'pending', approved: 'confirmed', declined: 'rejected', sold: 'completed' }
  const homeownerLeads: Lead[] = useMemo(() => sentProjects.map((p) => ({
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
  })), [sentProjects, VENDOR_ID])

  // Per-lead status overrides — applied on top of homeowner-leads + mock-leads
  // so that vendor actions (Confirm / Reject / Reschedule / Mark-as-Sold) move
  // a lead between sections regardless of whether the lead is backed by a
  // sentProject (homeowner-bus channel) or a static MOCK_LEAD (pre-launch test
  // harness). Keeps the "mock stays as test harness, but flows must close the
  // loop as if real" rule working for the mock path too (Rod directive).
  const [leadStatusOverrides, setLeadStatusOverrides] = useState<Record<string, Lead['status']>>({})
  const setLeadStatus = (leadId: string, status: Lead['status']) => {
    setLeadStatusOverrides((prev) => ({ ...prev, [leadId]: status }))
  }

  // Put homeowner leads first so they appear at the top, then apply overrides.
  const leads = useMemo(() => {
    const combined = [...homeownerLeads, ...mockLeads]
    return combined.map((l) =>
      leadStatusOverrides[l.id] ? { ...l, status: leadStatusOverrides[l.id] } : l
    )
  }, [mockLeads, homeownerLeads, leadStatusOverrides])

  // Lead categories
  const newLeads = leads.filter((l) => l.status === 'pending' || l.status === 'rescheduled')
  const confirmedLeads = leads.filter((l) => l.status === 'confirmed')
  const soldLeads = leads.filter((l) => l.status === 'completed')
  const archivedLeads = leads.filter((l) => l.status === 'rejected')

  // KPI calculations
  const activeLeads = leads.filter((l) => l.status === 'pending' || l.status === 'confirmed' || l.status === 'rescheduled')
  const pipelineValue = activeLeads.reduce((sum, l) => sum + l.value, 0)
  const bookedThisMonth = confirmedLeads.length
  const totalDecided = leads.filter((l) => ['confirmed', 'completed', 'rejected'].includes(l.status)).length
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
  const [rejectionReason, setRejectionReason] = useState('')

  // Section collapse state
  // Single-open accordion: at most one lead-status tile open at a time
  // (kratos msg 1776576047204). Null = all closed.
  type LeadTileId = 'new' | 'confirmed' | 'sold' | 'archived'
  const [openTile, setOpenTile] = useState<LeadTileId | null>(null)
  const toggleTile = (id: LeadTileId) => setOpenTile((prev) => (prev === id ? null : id))

  const selectedSlot = MOCK_AVAILABLE_SLOTS.find((s) => s.date === rescheduleDate)

  const openLead = (lead: Lead) => {
    setSelected(lead)
    setSheetOpen(true)
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
    return (
      <Card
        className="rounded-xl shadow-sm hover:shadow-md transition cursor-pointer group"
        onClick={() => openLead(lead)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <AvatarInitials
                initials={lead.homeowner_name.split(' ').map((n) => n[0]).join('')}
                color="#64748b"
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
                  {lead.homeowner_name}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{lead.project}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-sm font-bold">{fmt(lead.value)}</span>
                  <StatusBadge status={lead.status} />
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">{fmtDate(lead.received_at)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{lead.id}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  function LeadStatusTile({
    title,
    count,
    color,
    icon: Icon,
    open,
    onToggle,
    children,
  }: {
    title: string
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
            <p className="text-sm font-medium text-foreground truncate">{title}</p>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">{count}</Badge>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </div>
        {/* Expanded content — renders inline under the summary row, inside the same Card. */}
        {open && children && (
          <div className="border-t border-border/40 bg-muted/10 p-3">
            {children}
          </div>
        )}
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
          title="Sold Leads"
          count={soldLeads.length}
          color="bg-primary"
          icon={Handshake}
          open={openTile === 'sold'}
          onToggle={() => toggleTile('sold')}
        >
          <div className="grid gap-3">
            {soldLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No sold leads yet.</p>
            ) : (
              soldLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        </LeadStatusTile>
        <LeadStatusTile
          title="Archived Leads"
          count={archivedLeads.length}
          color="bg-slate-500"
          icon={Archive}
          open={openTile === 'archived'}
          onToggle={() => toggleTile('archived')}
        >
          <div className="grid gap-3">
            {archivedLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No archived leads.</p>
            ) : (
              archivedLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
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
                <DialogTitle className="font-heading text-base leading-tight">{selected.project}</DialogTitle>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selected.status} />
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

              {/* Project */}
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
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {selected.service_category.replace(/_/g, ' ')}
                    </Badge>
                  </div>
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
                      <X className="h-4 w-4" /> Rejected
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
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => {
                          // Always flip the lead-status override so mock-leads move too.
                          setLeadStatus(selected.id, 'confirmed')
                          const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === selected.id)
                          if (sp) {
                            updateProjectStatus(sp.id, 'approved')
                          }
                          // Auto-close the lead-detail modal after Confirm fires (kratos msg 1776576431450).
                          setSheetOpen(false)
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
    </motion.div>
  )
}
