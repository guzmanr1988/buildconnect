import { useMemo } from 'react'
import { User, Phone, Mail, MapPin } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { MOCK_LEADS, MOCK_VENDORS, MOCK_CLOSED_SALES } from '@/lib/mock-data'

// Shared project-detail dialog — extracted from /admin/workflow in ship #140
// per kratos msg 1776744668266 so any admin surface can open the same
// canonical detail view IN PLACE without navigating away. Caller manages
// open-state + passes the projectId; the dialog self-resolves everything
// (pipeline data, sentProjects lookup, commission split via current
// per-vendor commission_pct override).

interface ProjectDetailDialogProps {
  open: boolean
  onClose: () => void
  projectId: string | null
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ProjectDetailDialog({ open, onClose, projectId }: ProjectDetailDialogProps) {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)

  const selectedItem = useMemo(() => {
    if (!projectId) return null

    // Prefer sentProjects (cart-created) match — richer data
    const sp = sentProjects.find((p) => p.id === projectId)
    if (sp) {
      const leadKey = `L-${sp.id.slice(0, 4).toUpperCase()}`
      const cReq = cancellationRequestsByLead[leadKey] ?? cancellationRequestsByLead[sp.id]
      const cancelApproved = cReq?.status === 'approved'
      return {
        id: sp.id,
        name: sp.homeowner?.name || 'Customer',
        project: sp.item.serviceName,
        date: sp.sentAt,
        initials: (sp.homeowner?.name || 'C').split(' ').map((n) => n[0]).join(''),
        vendor: sp.contractor?.company,
        rep: sp.assignedRep?.name,
        status: cancelApproved ? 'declined' : sp.status,
        soldAt: sp.soldAt,
        saleAmount: sp.saleAmount,
        project_data: sp,
      }
    }

    // Fall back to MOCK_LEADS fixture path
    const l = MOCK_LEADS.find((x) => x.id === projectId)
    if (!l) return null
    const rawStatus = leadStatusOverrides[l.id] ?? l.status
    const cReq = cancellationRequestsByLead[l.id]
    const cancelApproved = cReq?.status === 'approved'
    const mappedStatus = cancelApproved
      ? 'declined'
      : rawStatus === 'confirmed'
        ? 'approved'
        : rawStatus === 'completed'
          ? 'sold'
          : rawStatus === 'rejected'
            ? 'declined'
            : 'pending'
    const vendor = MOCK_VENDORS.find((v) => v.id === l.vendor_id)
    const closedSale = MOCK_CLOSED_SALES.find((c) => c.lead_id === l.id)
    return {
      id: l.id,
      name: l.homeowner_name,
      project: l.project.split('—')[0].trim(),
      date: l.received_at,
      initials: l.homeowner_name.split(' ').map((n) => n[0]).join(''),
      vendor: vendor?.company ?? 'Unknown vendor',
      rep: assignedRepByLead[l.id]?.name,
      status: mappedStatus,
      soldAt: closedSale?.closed_at,
      saleAmount: closedSale?.sale_amount,
      project_data: null as any,
    }
  }, [projectId, sentProjects, leadStatusOverrides, cancellationRequestsByLead, assignedRepByLead])

  const commissionPct = useMemo(() => {
    if (!selectedItem?.vendor) return 15
    const v = MOCK_VENDORS.find((x) => x.company === selectedItem.vendor)
    if (!v) return 15
    return vendorCommissionOverrides[v.id] ?? v.commission_pct
  }, [selectedItem?.vendor, vendorCommissionOverrides])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
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
                {selectedItem.rep && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rep</span>
                    <span className="font-medium">{selectedItem.rep}</span>
                  </div>
                )}
              </div>

              {selectedItem.project_data && (
                <>
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

                  <div className="rounded-xl border p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project Selections</h4>
                    {Object.entries(selectedItem.project_data.item.selections).map(([key, values]: [string, any]) => (
                      <div key={key} className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground capitalize min-w-[60px]">{key.replace(/_/g, ' ')}:</span>
                        {(values as string[]).map((v: string) => (
                          <Badge key={v} variant="secondary" className="text-[10px] capitalize">{v.replace(/_/g, ' ')}</Badge>
                        ))}
                      </div>
                    ))}
                  </div>

                  {selectedItem.project_data.item.windowSelections && selectedItem.project_data.item.windowSelections.length > 0 && (
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

                  {selectedItem.project_data.item.doorSelections && selectedItem.project_data.item.doorSelections.length > 0 && (
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

                  {selectedItem.project_data.rejectionReason && (
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-1">
                      <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Rejection Reason</h4>
                      <p className="text-sm text-red-700">{selectedItem.project_data.rejectionReason}</p>
                    </div>
                  )}
                </>
              )}

              {/* Commission breakdown — mirrors vendor-banking shape; respects
                  per-vendor commission_pct override. Gated on status==='sold'
                  so internally-inconsistent seed data (pending/approved lead
                  with a stray MOCK_CLOSED_SALES match) doesn't render a
                  commission split on non-sold projects. Ship #142 P0. */}
              {selectedItem.status === 'sold' && selectedItem.saleAmount && selectedItem.saleAmount > 0 && (() => {
                const vendorPct = 100 - commissionPct
                const bcAmount = Math.round(selectedItem.saleAmount * (commissionPct / 100))
                const vendorAmount = selectedItem.saleAmount - bcAmount
                return (
                  <div className="rounded-xl border p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commission</h4>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sale Total</span>
                        <span className="font-bold">${selectedItem.saleAmount.toLocaleString()}</span>
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
                  </div>
                )
              })()}
            </div>
            <Button variant="outline" className="w-full mt-2" onClick={onClose}>
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
