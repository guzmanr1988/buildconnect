import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { GitBranch, Inbox, CheckCircle2, Handshake, ArrowRight, User, Calendar, MapPin, Archive, Phone, Mail, Search, ChevronDown, ChevronUp, UserCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useProjectsStore } from '@/stores/projects-store'
import { MOCK_LEADS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface PipelineItem {
  id: string
  name: string
  project: string
  date: string
  initials: string
  vendor?: string
}

export default function WorkflowPage() {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  // Convert sent projects into pipeline items
  const projectItems = useMemo(() => sentProjects.map((p) => ({
    id: p.id,
    name: p.homeowner?.name || 'Customer',
    project: p.item.serviceName,
    date: p.sentAt,
    initials: (p.homeowner?.name || 'C').split(' ').map(n => n[0]).join(''),
    vendor: p.contractor?.company,
    rep: p.assignedRep?.name,
    status: p.status,
    soldAt: p.soldAt,
    saleAmount: p.saleAmount,
  })), [sentProjects])

  // Mock leads as pipeline items — rep comes from the lead-keyed override map
  // populated when the vendor confirms the lead with a rep picked.
  const mockItems = useMemo(() => MOCK_LEADS.map((l) => ({
    id: l.id,
    name: l.homeowner_name,
    project: l.project.split('—')[0].trim(),
    date: l.received_at,
    initials: l.homeowner_name.split(' ').map(n => n[0]).join(''),
    vendor: 'MH Home Solutions',
    rep: assignedRepByLead[l.id]?.name,
    status: l.status === 'confirmed' ? 'approved' : l.status === 'completed' ? 'sold' : l.status === 'rejected' ? 'declined' : 'pending',
    soldAt: undefined,
  })), [assignedRepByLead])

  const allItems = [...projectItems, ...mockItems]
  const q = searchQuery.toLowerCase()
  const filtered = q ? allItems.filter(i => i.name.toLowerCase().includes(q) || i.project.toLowerCase().includes(q)) : allItems

  const newLeads = filtered.filter(i => i.status === 'pending')
  const confirmed = filtered.filter(i => i.status === 'approved')
  const sold = filtered.filter(i => i.status === 'sold')
  const archived = filtered.filter(i => i.status === 'declined')

  const stages = [
    { title: 'New Leads', icon: Inbox, color: 'bg-amber-500', borderColor: 'border-amber-300', bgColor: 'bg-amber-50 dark:bg-amber-950/20', items: newLeads },
    { title: 'Scheduled', icon: CheckCircle2, color: 'bg-emerald-500', borderColor: 'border-emerald-300', bgColor: 'bg-emerald-50 dark:bg-emerald-950/20', items: confirmed },
    { title: 'Sold', icon: Handshake, color: 'bg-primary', borderColor: 'border-primary/30', bgColor: 'bg-primary/5 dark:bg-primary/10', items: sold },
    { title: 'Archived', icon: Archive, color: 'bg-slate-500', borderColor: 'border-slate-300', bgColor: 'bg-slate-50 dark:bg-slate-950/20', items: archived },
  ]

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  }
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  }

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
            placeholder="Search customers by name or project..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </motion.div>

      {/* Pipeline Summary */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {stages.map((stage, idx) => (
            <div key={stage.title} className="flex items-center gap-2 sm:gap-4 flex-1">
              <div className={cn('flex-1 rounded-xl border p-3 sm:p-4 text-center', stage.bgColor, stage.borderColor)}>
                <div className={cn('inline-flex items-center justify-center rounded-lg p-2 mb-2', stage.color)}>
                  <stage.icon className="h-4 w-4 text-white" />
                </div>
                <p className="text-2xl font-bold font-heading">{stage.items.length}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{stage.title}</p>
              </div>
              {idx < stages.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0 hidden sm:block" />
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
                      <CardTitle className="text-sm font-heading">{stage.title}</CardTitle>
                      <Badge variant="secondary" className="text-xs">{stage.items.length}</Badge>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </button>
              {isOpen && (
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
                      onClick={() => {
                        const sp = sentProjects.find((p) => p.id === lead.id)
                        setSelectedItem({ ...lead, project_data: sp || null })
                      }}
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
                      {lead.saleAmount && lead.saleAmount > 0 && (
                        <div className="rounded bg-background/80 p-2 space-y-1 text-[10px] border">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total</span>
                            <span className="font-bold">${lead.saleAmount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                            <span>Vendor (85%)</span>
                            <span className="font-bold">${Math.round(lead.saleAmount * 0.85).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-amber-700 dark:text-amber-400">
                            <span>BuildConnect (15%)</span>
                            <span className="font-bold">${Math.round(lead.saleAmount * 0.15).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
              )}
            </Card>
          </motion.div>
          )
        })}
      </div>

      {/* Project Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center gap-2">
                  <AvatarInitials initials={selectedItem.initials} color="#64748b" size="sm" />
                  {selectedItem.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Project</span>
                    <span className="font-medium">{selectedItem.project}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="secondary" className="text-xs capitalize">{selectedItem.status}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium">{fmtDate(selectedItem.date)}</span>
                  </div>
                  {selectedItem.vendor && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vendor</span>
                      <span className="font-medium">{selectedItem.vendor}</span>
                    </div>
                  )}
                </div>

                {/* Project details from store */}
                {selectedItem.project_data && (
                  <>
                    {/* Homeowner info */}
                    {selectedItem.project_data.homeowner && (
                      <div className="rounded-xl border p-4 space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer Info</h4>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{selectedItem.project_data.homeowner.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{selectedItem.project_data.homeowner.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{selectedItem.project_data.homeowner.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{selectedItem.project_data.homeowner.address}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Selections */}
                    <div className="rounded-xl border p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project Selections</h4>
                      {Object.entries(selectedItem.project_data.item.selections).map(([key, values]: [string, any]) => (
                        <div key={key} className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-muted-foreground capitalize min-w-[60px]">{key.replace(/_/g, ' ')}:</span>
                          {values.map((v: string) => (
                            <Badge key={v} variant="secondary" className="text-[10px] capitalize">{v.replace(/_/g, ' ')}</Badge>
                          ))}
                        </div>
                      ))}
                    </div>

                    {/* Window/Door details */}
                    {selectedItem.project_data.item.windowSelections?.length > 0 && (
                      <div className="rounded-xl border p-4 space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Windows</h4>
                        {selectedItem.project_data.item.windowSelections.map((w: any) => (
                          <div key={w.id} className="flex flex-wrap gap-1.5 text-[10px]">
                            <Badge variant="outline">{w.size.replace('x', '"×')}" ×{w.quantity}</Badge>
                            <Badge variant="secondary">{w.type}</Badge>
                            <Badge variant="outline">{w.frameColor}</Badge>
                            <Badge variant="outline">{w.glassColor}</Badge>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedItem.project_data.item.doorSelections?.length > 0 && (
                      <div className="rounded-xl border p-4 space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Doors</h4>
                        {selectedItem.project_data.item.doorSelections.map((d: any) => (
                          <div key={d.id} className="flex flex-wrap gap-1.5 text-[10px]">
                            <Badge variant="outline">{d.size.replace('x', '"×')}" ×{d.quantity}</Badge>
                            <Badge variant="secondary">{d.type}</Badge>
                            <Badge variant="outline">{d.frameColor}</Badge>
                            <Badge variant="outline">{d.glassColor}</Badge>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Commission breakdown for sold */}
                    {selectedItem.saleAmount && selectedItem.saleAmount > 0 && (
                      <div className="rounded-xl border p-4 space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commission</h4>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sale Total</span>
                            <span className="font-bold">${selectedItem.saleAmount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                            <span>Vendor (85%)</span>
                            <span className="font-bold">${Math.round(selectedItem.saleAmount * 0.85).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-amber-700 dark:text-amber-400">
                            <span>BuildConnect (15%)</span>
                            <span className="font-bold">${Math.round(selectedItem.saleAmount * 0.15).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rejection reason */}
                    {selectedItem.project_data.rejectionReason && (
                      <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-1">
                        <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Rejection Reason</h4>
                        <p className="text-sm text-red-700">{selectedItem.project_data.rejectionReason}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <Button variant="outline" className="w-full mt-2" onClick={() => setSelectedItem(null)}>
                Close
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
