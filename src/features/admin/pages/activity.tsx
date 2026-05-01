import { useState, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  Activity as ActivityIcon, Search, Inbox, CheckCircle2, UserCheck,
  RotateCcw, X as XIcon, Handshake, MessageCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { ProjectDetailDialog } from '@/components/shared/project-detail-dialog'
import { useProjectsStore } from '@/stores/projects-store'
import { MOCK_VENDORS } from '@/lib/mock-data'
import {
  useEffectiveMockLeads,
  useEffectiveMockClosedSales,
  useEffectiveMockMessages,
  useEffectiveMockHomeowners,
} from '@/lib/mock-data-effective'
import { deriveInitials } from '@/lib/initials'
import { cn } from '@/lib/utils'

// Ship #241 — admin Activity tab (MVP option C).
// Derived-from-state event feed. Reads existing persisted timestamps on
// sentProjects, leadConfirmedAtByLead, repAssignedAtByLead,
// rescheduleRequestsByLead, cancellationRequestsByLead, MOCK_CLOSED_SALES,
// MOCK_MESSAGES to synthesize a chronological activity feed.
//
// Known limitations documented to Rodolfo on ship:
//   - Cancellation resolved-timestamps not tracked (only requested).
//   - Runtime user-sent messages not captured (only MOCK_MESSAGES fixture).
//   - No proposal-counter-proposal history — reschedule shows current-state
//     request only, not the back-and-forth thread.
// Full-fidelity audit log (follow-up task) will migrate this page to read
// from a store-backed useActivityLogStore instrumented from every state-
// change action.

type EventType =
  | 'submitted'
  | 'confirmed'
  | 'rep_assigned'
  | 'reschedule_requested'
  | 'reschedule_resolved'
  | 'cancellation_requested'
  | 'sold'
  | 'message'

interface ActivityEvent {
  id: string
  timestamp: string
  type: EventType
  actorRole: 'vendor' | 'homeowner' | 'system'
  actorName: string
  vendorId?: string
  homeownerId?: string
  leadId?: string
  projectId?: string
  title: string
  description: string
}

const EVENT_TYPE_CONFIG: Record<EventType, { label: string; icon: LucideIcon; iconColor: string; tint: string }> = {
  submitted: { label: 'Submitted', icon: Inbox, iconColor: 'text-primary', tint: 'bg-primary/10' },
  confirmed: { label: 'Confirmed', icon: CheckCircle2, iconColor: 'text-sky-600', tint: 'bg-sky-100 dark:bg-sky-900/20' },
  rep_assigned: { label: 'Rep assigned', icon: UserCheck, iconColor: 'text-emerald-600', tint: 'bg-emerald-100 dark:bg-emerald-900/20' },
  reschedule_requested: { label: 'Reschedule requested', icon: RotateCcw, iconColor: 'text-amber-600', tint: 'bg-amber-100 dark:bg-amber-900/20' },
  reschedule_resolved: { label: 'Reschedule resolved', icon: RotateCcw, iconColor: 'text-slate-600', tint: 'bg-slate-100 dark:bg-slate-800/40' },
  cancellation_requested: { label: 'Cancellation', icon: XIcon, iconColor: 'text-destructive', tint: 'bg-destructive/10' },
  sold: { label: 'Sold', icon: Handshake, iconColor: 'text-primary', tint: 'bg-primary/15' },
  message: { label: 'Message', icon: MessageCircle, iconColor: 'text-muted-foreground', tint: 'bg-muted/40' },
}

const ALL_EVENT_TYPES: EventType[] = Object.keys(EVENT_TYPE_CONFIG) as EventType[]

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminActivityPage() {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const leadConfirmedAtByLead = useProjectsStore((s) => s.leadConfirmedAtByLead)
  const repAssignedAtByLead = useProjectsStore((s) => s.repAssignedAtByLead)
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const rescheduleRequestsByLead = useProjectsStore((s) => s.rescheduleRequestsByLead)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)

  // Ship #250 — effective-fixture hooks honor the demoDataHidden flag.
  const mockLeads = useEffectiveMockLeads()
  const mockClosedSales = useEffectiveMockClosedSales()
  const mockMessages = useEffectiveMockMessages()
  const mockHomeowners = useEffectiveMockHomeowners()

  const [selectedVendorId, setSelectedVendorId] = useState<string>('all')
  const [selectedHomeownerId, setSelectedHomeownerId] = useState<string>('all')
  const [enabledTypes, setEnabledTypes] = useState<Set<EventType>>(new Set(ALL_EVENT_TYPES))
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const events = useMemo<ActivityEvent[]>(() => {
    const out: ActivityEvent[] = []

    // 1. Lead submissions — MOCK_LEADS.received_at (fixture) + sentProjects.sentAt (runtime)
    mockLeads.forEach((l) => {
      const vendor = MOCK_VENDORS.find((v) => v.id === l.vendor_id)
      out.push({
        id: `submit-${l.id}`,
        timestamp: l.received_at,
        type: 'submitted',
        actorRole: 'homeowner',
        actorName: l.homeowner_name,
        vendorId: l.vendor_id,
        homeownerId: l.homeowner_id,
        leadId: l.id,
        title: 'New lead submitted',
        description: `${l.homeowner_name} → ${vendor?.company ?? 'Vendor'} · ${l.project.split(' — ')[0]}`,
      })
    })
    sentProjects.forEach((p) => {
      const leadId = `L-${p.id.slice(0, 4).toUpperCase()}`
      const vendor = p.contractor?.vendor_id
        ? MOCK_VENDORS.find((v) => v.id === p.contractor!.vendor_id)
        : MOCK_VENDORS.find((v) => v.company === p.contractor?.company)
      out.push({
        id: `submit-sp-${p.id}`,
        timestamp: p.sentAt,
        type: 'submitted',
        actorRole: 'homeowner',
        actorName: p.homeowner?.name ?? 'Homeowner',
        vendorId: vendor?.id,
        leadId,
        projectId: p.id,
        title: 'New lead submitted',
        description: `${p.homeowner?.name ?? 'Homeowner'} → ${p.contractor?.company ?? 'Vendor'} · ${p.item.serviceName}`,
      })
    })

    // 2. Lead confirmed
    Object.entries(leadConfirmedAtByLead).forEach(([leadId, at]) => {
      if (!at) return
      const mockLead = mockLeads.find((l) => l.id === leadId)
      const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === leadId)
      const vendor = mockLead
        ? MOCK_VENDORS.find((v) => v.id === mockLead.vendor_id)
        : (sp?.contractor?.vendor_id
            ? MOCK_VENDORS.find((v) => v.id === sp.contractor!.vendor_id)
            : MOCK_VENDORS.find((v) => v.company === sp?.contractor?.company))
      const homeownerName = mockLead?.homeowner_name ?? sp?.homeowner?.name ?? 'Homeowner'
      out.push({
        id: `confirm-${leadId}`,
        timestamp: at,
        type: 'confirmed',
        actorRole: 'vendor',
        actorName: vendor?.company ?? 'Vendor',
        vendorId: vendor?.id,
        homeownerId: mockLead?.homeowner_id,
        leadId,
        projectId: sp?.id,
        title: 'Lead confirmed',
        description: `${vendor?.company ?? 'Vendor'} confirmed appointment with ${homeownerName}`,
      })
    })

    // 3. Rep assigned
    Object.entries(repAssignedAtByLead).forEach(([leadId, at]) => {
      if (!at) return
      const rep = assignedRepByLead[leadId]
      if (!rep) return
      const mockLead = mockLeads.find((l) => l.id === leadId)
      const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === leadId)
      const vendor = mockLead
        ? MOCK_VENDORS.find((v) => v.id === mockLead.vendor_id)
        : (sp?.contractor?.vendor_id
            ? MOCK_VENDORS.find((v) => v.id === sp.contractor!.vendor_id)
            : MOCK_VENDORS.find((v) => v.company === sp?.contractor?.company))
      out.push({
        id: `rep-${leadId}`,
        timestamp: at,
        type: 'rep_assigned',
        actorRole: 'vendor',
        actorName: vendor?.company ?? 'Vendor',
        vendorId: vendor?.id,
        homeownerId: mockLead?.homeowner_id,
        leadId,
        projectId: sp?.id,
        title: 'Account rep assigned',
        description: `${rep.name} assigned by ${vendor?.company ?? 'vendor'}`,
      })
    })

    // 4+5. Reschedule events
    Object.entries(rescheduleRequestsByLead).forEach(([leadId, r]) => {
      if (!r) return
      const mockLead = mockLeads.find((l) => l.id === leadId)
      const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === leadId)
      const vendor = mockLead
        ? MOCK_VENDORS.find((v) => v.id === mockLead.vendor_id)
        : (sp?.contractor?.vendor_id
            ? MOCK_VENDORS.find((v) => v.id === sp.contractor!.vendor_id)
            : MOCK_VENDORS.find((v) => v.company === sp?.contractor?.company))
      out.push({
        id: `resched-req-${leadId}`,
        timestamp: r.requestedAt,
        type: 'reschedule_requested',
        actorRole: r.requestedBy === 'vendor' ? 'vendor' : 'homeowner',
        actorName: r.requestedBy === 'vendor' ? (vendor?.company ?? 'Vendor') : (mockLead?.homeowner_name ?? sp?.homeowner?.name ?? 'Homeowner'),
        vendorId: vendor?.id,
        homeownerId: mockLead?.homeowner_id,
        leadId,
        projectId: sp?.id,
        title: `${r.requestedBy === 'vendor' ? 'Vendor' : 'Homeowner'} requested reschedule`,
        description: `Proposed: ${r.proposedDate} · ${r.proposedTime}${r.reason ? ' — ' + r.reason : ''}`,
      })
      if (r.resolvedAt) {
        out.push({
          id: `resched-res-${leadId}`,
          timestamp: r.resolvedAt,
          type: 'reschedule_resolved',
          actorRole: r.requestedBy === 'vendor' ? 'homeowner' : 'vendor',
          actorName: r.requestedBy === 'vendor'
            ? (mockLead?.homeowner_name ?? sp?.homeowner?.name ?? 'Homeowner')
            : (vendor?.company ?? 'Vendor'),
          vendorId: vendor?.id,
          homeownerId: mockLead?.homeowner_id,
          leadId,
          projectId: sp?.id,
          title: `Reschedule ${r.status}`,
          description: r.status === 'approved'
            ? `Moved to ${r.proposedDate} · ${r.proposedTime}`
            : 'Original time kept',
        })
      }
    })

    // 6. Cancellation requested
    Object.entries(cancellationRequestsByLead).forEach(([leadId, c]) => {
      if (!c) return
      const mockLead = mockLeads.find((l) => l.id === leadId)
      const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === leadId)
      const vendor = mockLead
        ? MOCK_VENDORS.find((v) => v.id === mockLead.vendor_id)
        : (sp?.contractor?.vendor_id
            ? MOCK_VENDORS.find((v) => v.id === sp.contractor!.vendor_id)
            : MOCK_VENDORS.find((v) => v.company === sp?.contractor?.company))
      out.push({
        id: `cancel-${leadId}`,
        timestamp: c.requestedAt,
        type: 'cancellation_requested',
        actorRole: 'homeowner',
        actorName: mockLead?.homeowner_name ?? sp?.homeowner?.name ?? 'Homeowner',
        vendorId: vendor?.id,
        homeownerId: mockLead?.homeowner_id,
        leadId,
        projectId: sp?.id,
        title: `Cancellation ${c.status}`,
        description: c.reason ?? (c.explanation ?? 'No reason provided'),
      })
    })

    // 7. Lead sold — sentProjects.soldAt + MOCK_CLOSED_SALES.closed_at
    sentProjects.forEach((p) => {
      if (p.status !== 'sold' || !p.soldAt) return
      const leadId = `L-${p.id.slice(0, 4).toUpperCase()}`
      const vendor = p.contractor?.vendor_id
        ? MOCK_VENDORS.find((v) => v.id === p.contractor!.vendor_id)
        : MOCK_VENDORS.find((v) => v.company === p.contractor?.company)
      out.push({
        id: `sold-sp-${p.id}`,
        timestamp: p.soldAt,
        type: 'sold',
        actorRole: 'vendor',
        actorName: vendor?.company ?? p.contractor?.company ?? 'Vendor',
        vendorId: vendor?.id,
        leadId,
        projectId: p.id,
        title: 'Lead sold',
        description: `${vendor?.company ?? p.contractor?.company ?? 'Vendor'} sold "${p.item.serviceName}" to ${p.homeowner?.name ?? 'homeowner'}${p.saleAmount ? ` for $${p.saleAmount.toLocaleString()}` : ''}`,
      })
    })
    mockClosedSales.forEach((cs) => {
      const vendor = MOCK_VENDORS.find((v) => v.id === cs.vendor_id)
      out.push({
        id: `sold-cs-${cs.id}`,
        timestamp: cs.closed_at,
        type: 'sold',
        actorRole: 'vendor',
        actorName: vendor?.company ?? 'Vendor',
        vendorId: cs.vendor_id,
        homeownerId: cs.homeowner_id,
        leadId: cs.lead_id,
        title: 'Lead sold',
        description: `${vendor?.company ?? 'Vendor'} closed "${cs.project}" with ${cs.homeowner_name} for $${cs.sale_amount.toLocaleString()}`,
      })
    })

    // 8. Messages (seeded only — runtime messages land with follow-up ship)
    mockMessages.forEach((m) => {
      const lead = mockLeads.find((l) => l.id === m.lead_id)
      const vendorSender = MOCK_VENDORS.find((v) => v.id === m.sender_id)
      const isVendor = !!vendorSender
      const actorName = isVendor
        ? vendorSender!.company
        : (lead?.homeowner_name ?? 'Homeowner')
      out.push({
        id: `msg-${m.id}`,
        timestamp: m.created_at,
        type: 'message',
        actorRole: isVendor ? 'vendor' : 'homeowner',
        actorName,
        vendorId: lead?.vendor_id,
        homeownerId: lead?.homeowner_id,
        leadId: m.lead_id,
        title: `${isVendor ? 'Vendor' : 'Homeowner'} message`,
        description: m.content
          ? (m.content.length > 120 ? m.content.slice(0, 120) + '…' : m.content)
          : (m.message_type === 'quote' ? 'Quote sent' : 'Attachment sent'),
      })
    })

    return out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [sentProjects, leadConfirmedAtByLead, repAssignedAtByLead, assignedRepByLead, rescheduleRequestsByLead, cancellationRequestsByLead, mockLeads, mockClosedSales, mockMessages])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return events.filter((e) => {
      if (selectedVendorId !== 'all' && e.vendorId !== selectedVendorId) return false
      if (selectedHomeownerId !== 'all' && e.homeownerId !== selectedHomeownerId) return false
      if (!enabledTypes.has(e.type)) return false
      if (q) {
        const hay = `${e.title} ${e.description} ${e.actorName} ${e.leadId ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [events, selectedVendorId, selectedHomeownerId, enabledTypes, searchQuery])

  const grouped = useMemo(() => {
    const buckets: { day: string; events: ActivityEvent[] }[] = []
    filtered.forEach((e) => {
      const day = fmtDay(e.timestamp)
      const last = buckets[buckets.length - 1]
      if (last && last.day === day) last.events.push(e)
      else buckets.push({ day, events: [e] })
    })
    return buckets
  }, [filtered])

  const toggleType = (t: EventType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const container: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } },
  }
  const itemV: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Activity" description="Every state change across vendors, homeowners, and projects">
        <Badge variant="outline" className="text-xs gap-1">
          <ActivityIcon className="h-3 w-3" />
          {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
        </Badge>
      </PageHeader>

      {/* Filters row */}
      <motion.div variants={itemV}>
        <Card className="rounded-xl">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search activity by name, project, lead ID…"
                  className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <Select value={selectedVendorId} onValueChange={(v) => setSelectedVendorId(v ?? 'all')}>
                <SelectTrigger className="h-10 w-[200px] text-sm">
                  <SelectValue placeholder="All vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vendors</SelectItem>
                  {MOCK_VENDORS.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedHomeownerId} onValueChange={(v) => setSelectedHomeownerId(v ?? 'all')}>
                <SelectTrigger className="h-10 w-[200px] text-sm">
                  <SelectValue placeholder="All homeowners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All homeowners</SelectItem>
                  {mockHomeowners.map((h) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Event-type chips */}
            <div className="flex flex-wrap gap-1.5">
              {ALL_EVENT_TYPES.map((t) => {
                const cfg = EVENT_TYPE_CONFIG[t]
                const active = enabledTypes.has(t)
                const Icon = cfg.icon
                return (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={active ? 'secondary' : 'outline'}
                    onClick={() => toggleType(t)}
                    className={cn('h-7 gap-1.5 text-xs', active && cfg.tint)}
                  >
                    <Icon className={cn('h-3 w-3', active && cfg.iconColor)} />
                    {cfg.label}
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Feed */}
      {grouped.length === 0 ? (
        <motion.div variants={itemV}>
          <Card className="rounded-xl">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No activity matches the current filters.
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        grouped.map(({ day, events: dayEvents }) => (
          <motion.div key={day} variants={itemV} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{day}</h3>
            <Card className="rounded-xl divide-y">
              {dayEvents.map((e) => {
                const cfg = EVENT_TYPE_CONFIG[e.type]
                const Icon = cfg.icon
                const clickable = !!e.projectId || !!e.leadId
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={!clickable}
                    data-activity-row
                    data-activity-type={e.type}
                    data-activity-lead-id={e.leadId ?? ''}
                    data-activity-project-id={e.projectId ?? ''}
                    onClick={() => {
                      if (e.projectId) setSelectedProjectId(e.projectId)
                      else if (e.leadId) setSelectedProjectId(e.leadId)
                    }}
                    className={cn(
                      'w-full flex items-start gap-3 p-4 text-left transition',
                      clickable ? 'hover:bg-muted/40 cursor-pointer' : 'cursor-default',
                    )}
                  >
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg shrink-0', cfg.tint)}>
                      <Icon className={cn('h-4 w-4', cfg.iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{e.title}</p>
                        {e.leadId && (
                          <span className="font-mono text-[10px] text-muted-foreground">{e.leadId}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <AvatarInitials
                          initials={deriveInitials(e.actorName)}
                          color={e.actorRole === 'vendor' ? '#0ea5e9' : e.actorRole === 'homeowner' ? '#10b981' : '#64748b'}
                          size="sm"
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {e.actorName} · {e.actorRole}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{fmtTime(e.timestamp)}</span>
                  </button>
                )
              })}
            </Card>
          </motion.div>
        ))
      )}

      <ProjectDetailDialog
        open={!!selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
        projectId={selectedProjectId}
        viewMode="admin-workflow"
      />
    </motion.div>
  )
}
