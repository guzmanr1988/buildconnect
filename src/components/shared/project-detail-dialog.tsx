import { useMemo, useState } from 'react'
import { User, Phone, Mail, MapPin, Calendar, Clock, UserCheck, RefreshCw, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { useEffectiveMockLeads, useEffectiveMockClosedSales } from '@/lib/mock-data-effective'
import { deriveInitials } from '@/lib/initials'
import { DIALOG_HORIZONTAL_GRID } from '@/lib/dialog-layouts'
import { PRICE_LINE_ITEM_PRESETS } from '@/lib/price-line-item-presets'
import { windowCatalogUnitPrice, doorCatalogUnitPrice, garageDoorCatalogUnitPrice, computeWindowsDoorsCatalogTotal } from '@/lib/configurator-catalog-price'
import { useVendorCatalogStore } from '@/stores/vendor-catalog-store'
import { mapsUrl, telHref } from '@/lib/contact-links'
import { RoofSpecCard } from '@/components/shared/roof-spec-card'

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
  // Ship #148 transaction-fallback: when projectId can't resolve to a
  // sentProject or MOCK_LEAD (e.g. Supabase commission row with no
  // homeowner context to bridge on), the caller may pass the source
  // transaction so the Dialog can still render the Commission split +
  // Linked Vendor — never an empty-context Dialog shell.
  transactionFallback?: {
    id: string
    type: 'commission' | 'membership' | 'payout'
    company: string
    detail: string
    customer?: string
    amount: number
    date: string
  } | null
  // Ship #363 — scope admin-workflow layout changes to the workflow
  // pop-menu only. All other consumers omit this prop (default layout).
  viewMode?: 'admin-workflow' | 'default'
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ProjectDetailDialog({ open, onClose, projectId, transactionFallback, viewMode = 'default' }: ProjectDetailDialogProps) {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  // Ship #197 (Rodolfo-direct 2026-04-21 pivot #16) — "full project
  // details on workflow". Extend the shared dialog to surface all
  // audit-relevant fields admin needs: booking slot, vendor confirm
  // timestamp (#166), rep-assignment timestamp (#166), current
  // reschedule request state (#191), cancellation request (already
  // partial), ID document thumbnail. Raw-map selectors return
  // undefined or the entity — stable per the banked zustand-selector-
  // stable-reference rule.
  const leadConfirmedAtByLead = useProjectsStore((s) => s.leadConfirmedAtByLead)
  const repAssignedAtByLead = useProjectsStore((s) => s.repAssignedAtByLead)
  const rescheduleRequestsByLead = useProjectsStore((s) => s.rescheduleRequestsByLead)
  // Ship #250 — effective-fixture hooks honor the demoDataHidden flag.
  const mockLeads = useEffectiveMockLeads()
  const mockClosedSales = useEffectiveMockClosedSales()
  const getVendorPrice = useVendorCatalogStore((s) => s.getPrice)
  const isAdminWorkflow = viewMode === 'admin-workflow'
  const [windowsExpanded, setWindowsExpanded] = useState(false)
  const [doorsExpanded, setDoorsExpanded] = useState(false)

  // Resolve effective commission_pct for a given vendor company — inline
  // because used twice below (selectedItem + commissionPct fallback).
  const resolvePct = (company: string | undefined): number => {
    if (!company) return 15
    const v = MOCK_VENDORS.find((x) => x.company === company)
    if (!v) return 15
    return vendorCommissionOverrides[v.id] ?? v.commission_pct
  }

  const selectedItem = useMemo(() => {
    if (!projectId) {
      // Ship #148 transaction-fallback: projectId didn't match any project/
      // lead fixture; fall back to rendering the commission context from
      // the transaction itself. Reverse the commission math to derive
      // sale total from tx.amount + current commission_pct so the split
      // renders correctly.
      if (transactionFallback && transactionFallback.type === 'commission') {
        const pct = resolvePct(transactionFallback.company)
        const saleAmount = pct > 0 ? Math.round((transactionFallback.amount * 100) / pct) : transactionFallback.amount
        const customerName = transactionFallback.customer || 'Customer'
        return {
          id: transactionFallback.id,
          name: customerName,
          project: transactionFallback.detail.replace(/^Commission on /i, '').trim(),
          date: transactionFallback.date,
          initials: deriveInitials(customerName),
          vendor: transactionFallback.company,
          rep: undefined as string | undefined,
          status: 'sold' as const,
          soldAt: transactionFallback.date,
          saleAmount,
          project_data: null as any,
        }
      }
      return null
    }

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
        initials: deriveInitials(sp.homeowner?.name || 'Customer'),
        vendor: sp.contractor?.company,
        rep: sp.assignedRep?.name,
        status: cancelApproved ? 'declined' : sp.status,
        soldAt: sp.soldAt,
        saleAmount: sp.saleAmount,
        project_data: sp,
        // Ship #197 — audit fields. Pulled by leadKey (sentProject
        // path) for reschedule + timestamp + cancellation lookups.
        _leadKey: leadKey,
        _bookingDate: sp.booking?.date,
        _bookingTime: sp.booking?.time,
        _confirmedAt: sp.confirmedAt ?? leadConfirmedAtByLead[leadKey],
        _repAssignedAt: sp.repAssignedAt ?? repAssignedAtByLead[leadKey],
        _rescheduleRequest: rescheduleRequestsByLead[leadKey],
        _cancellationRequest: cReq,
        _idDocument: sp.idDocument,
        // Ship #269 — homeowner.id snapshot for admin auditing /
        // dispute-support. Surfaces only when populated (post-#269
        // sendProject calls); legacy persisted entries fall through.
        _homeownerId: sp.homeowner_id,
      }
    }

    // Fall back to MOCK_LEADS fixture path
    const l = mockLeads.find((x) => x.id === projectId)
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
    const closedSale = mockClosedSales.find((c) => c.lead_id === l.id)
    // Ship #150: synthesize minimal homeowner + selections context from
    // MOCK_LEADS fields so Customer Info + Project Selections sections
    // render on the lead-bridge path (apollo caught these missing on
    // tx-row-opened Dialogs where bridge resolves to a MOCK_LEAD).
    // priceLineItems intentionally omitted: MOCK_LEADS have no real vendor-priced
    // breakdown snapshot. Breakdown card hides via null-gate on consumer surfaces
    // (hide > fabricated numbers per Upsale semantic lock + MATH IS GOD).
    const syntheticProjectData = {
      homeowner: {
        name: l.homeowner_name,
        phone: l.phone,
        email: l.email,
        address: l.address,
      },
      item: {
        serviceName: l.project.split('—')[0].trim(),
        serviceId: l.service_category,
        selections: l.pack_items as Record<string, string[]>,
      },
    }
    return {
      id: l.id,
      name: l.homeowner_name,
      project: l.project.split('—')[0].trim(),
      date: l.received_at,
      initials: deriveInitials(l.homeowner_name),
      vendor: vendor?.company ?? 'Unknown vendor',
      rep: assignedRepByLead[l.id]?.name,
      status: mappedStatus,
      soldAt: closedSale?.closed_at,
      saleAmount: closedSale?.sale_amount,
      project_data: syntheticProjectData as any,
      // Ship #197 — audit fields for MOCK_LEAD path. Booking slot
      // synthesized from l.slot; timestamps + reschedule lookups key
      // by lead.id directly.
      _leadKey: l.id,
      _bookingDate: l.slot ? l.slot.split('T')[0] : undefined,
      _bookingTime: l.slot ? (l.slot.split('T')[1]?.slice(0, 5) ?? undefined) : undefined,
      _confirmedAt: leadConfirmedAtByLead[l.id],
      _repAssignedAt: repAssignedAtByLead[l.id],
      _rescheduleRequest: rescheduleRequestsByLead[l.id],
      _cancellationRequest: cReq,
      _idDocument: undefined,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sentProjects, leadStatusOverrides, cancellationRequestsByLead, assignedRepByLead, transactionFallback, vendorCommissionOverrides, leadConfirmedAtByLead, repAssignedAtByLead, rescheduleRequestsByLead, mockLeads, mockClosedSales])

  const commissionPct = resolvePct(selectedItem?.vendor)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Ship #309 — Bin-A horizontal-PC treatment. PC widens to
          sm:max-w-3xl + content sections wrap in 2-col grid via
          DIALOG_HORIZONTAL_GRID shared constant (n=2 consumer with
          Lead Detail Modal #308; #103 single-source-of-truth). Mobile
          portrait preserved exactly. Left column: identity + customer
          context. Right column: selections + audit + commission. */}
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        {selectedItem && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-2">
                <AvatarInitials initials={selectedItem.initials} color="#64748b" size="sm" />
                {selectedItem.name}
              </DialogTitle>
            </DialogHeader>
            <div className={`${DIALOG_HORIZONTAL_GRID} mt-2`}>
            <div className="space-y-4">
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

              {selectedItem.project_data?.homeowner && (
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
                      <a href={telHref(selectedItem.project_data.homeowner.phone)} className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label={`Call ${selectedItem.project_data.homeowner.name}`}>
                        <Phone className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{selectedItem.project_data.homeowner.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={mapsUrl(selectedItem.project_data.homeowner.address)} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline transition-colors">{selectedItem.project_data.homeowner.address}</a>
                    </div>
                  </div>
                </div>
              )}

              {/* Commission card — left col only in admin-workflow mode. */}
              {(() => {
                if (!isAdminWorkflow) return null
                const isTxContext = !!transactionFallback && transactionFallback.type === 'commission'
                const statusGateHeld = selectedItem.status === 'sold' && selectedItem.saleAmount && selectedItem.saleAmount > 0
                if (!isTxContext && !statusGateHeld) return null
                const vendorPct = 100 - commissionPct
                const txAmount = transactionFallback?.type === 'commission' ? transactionFallback.amount : null
                const saleAmount = (selectedItem.saleAmount && selectedItem.saleAmount > 0)
                  ? selectedItem.saleAmount
                  : (txAmount && commissionPct > 0 ? Math.round((txAmount * 100) / commissionPct) : 0)
                if (saleAmount <= 0) return null
                const bcAmount = Math.round(saleAmount * (commissionPct / 100))
                const vendorAmount = saleAmount - bcAmount
                return (
                  <div className="rounded-xl border p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commission</h4>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sale Total</span>
                        <span className="font-bold">${saleAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                        <span className="font-medium">Vendor's Share {vendorPct}%</span>
                        <span className="font-bold">${vendorAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 mt-1">
                        <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">BuildConnect Commission {commissionPct}%</span>
                        <span className="text-xl font-bold text-amber-700 dark:text-amber-400">${bcAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Audit Trail — admin-workflow mode: left col under Commission. */}
              {(() => {
                if (!isAdminWorkflow) return null
                const extra = selectedItem as typeof selectedItem & {
                  _bookingDate?: string
                  _bookingTime?: string
                  _confirmedAt?: string
                  _repAssignedAt?: string
                  _rescheduleRequest?: { requestedBy: string; proposedDate: string; proposedTime: string; originalDate: string; originalTime: string; status: string; reason?: string }
                  _cancellationRequest?: { status: string; reason?: string; explanation?: string }
                  _idDocument?: string
                  _homeownerId?: string
                }
                const hasAny =
                  extra._bookingDate ||
                  extra._confirmedAt ||
                  extra._repAssignedAt ||
                  extra._rescheduleRequest ||
                  extra._cancellationRequest ||
                  extra._idDocument ||
                  extra._homeownerId
                if (!hasAny) return null
                return (
                  <div className="rounded-xl border p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Audit Trail</h4>
                    <div className="space-y-2 text-sm">
                      {extra._bookingDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">Booked slot</span>
                          <span className="font-medium">
                            {extra._bookingDate}{extra._bookingTime ? ` · ${extra._bookingTime}` : ''}
                          </span>
                        </div>
                      )}
                      {extra._confirmedAt && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">Vendor confirmed</span>
                          <span className="font-medium">{fmtDate(extra._confirmedAt)}</span>
                        </div>
                      )}
                      {extra._repAssignedAt && (
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">Rep assigned</span>
                          <span className="font-medium">{fmtDate(extra._repAssignedAt)}</span>
                        </div>
                      )}
                      {extra._cancellationRequest && (
                        <div className="flex items-start gap-2">
                          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="flex items-center gap-2">
                              <span className="text-muted-foreground min-w-[108px]">Cancellation</span>
                              <Badge variant="outline" className="text-[10px] capitalize">{extra._cancellationRequest.status}</Badge>
                            </p>
                            {extra._cancellationRequest.reason && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">
                                "{extra._cancellationRequest.reason}"
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {extra._rescheduleRequest && (
                        <div className="flex items-start gap-2">
                          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-0.5">
                            <p className="flex items-center gap-2">
                              <span className="text-muted-foreground min-w-[108px]">Reschedule</span>
                              <Badge variant="outline" className="text-[10px] capitalize">{extra._rescheduleRequest.status}</Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {extra._rescheduleRequest.requestedBy}-initiated
                              </span>
                            </p>
                            <p className="text-xs text-foreground/80">
                              {extra._rescheduleRequest.proposedDate} · {extra._rescheduleRequest.proposedTime}
                              <span className="text-muted-foreground ml-1.5">
                                (was {extra._rescheduleRequest.originalDate} · {extra._rescheduleRequest.originalTime})
                              </span>
                            </p>
                            {extra._rescheduleRequest.reason && (
                              <p className="text-xs text-muted-foreground italic">
                                "{extra._rescheduleRequest.reason}"
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {extra._idDocument && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">ID on file</span>
                          <img
                            src={extra._idDocument}
                            alt="Customer ID"
                            className="h-12 w-20 rounded border object-cover"
                          />
                        </div>
                      )}
                      {extra._homeownerId && (
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">Homeowner ID</span>
                          <span className="font-mono text-[11px] text-foreground/80 break-all">
                            {extra._homeownerId}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
            {/* RIGHT COLUMN — selections + audit + commission */}
            <div className="space-y-4">
              {selectedItem.project_data && (
                <>
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

                  {/* Roof Spec — shown for roofing items only */}
                  {selectedItem.project_data.item.serviceId === 'roofing' && (() => {
                    const item = selectedItem.project_data.item as any
                    return (
                      <RoofSpecCard
                        roofMeasurement={item.roofMeasurement}
                        metalRoofSelection={item.metalRoofSelection}
                        roofAddonLinearFt={item.roofAddonLinearFt}
                        roofPermit={item.roofPermit}
                      />
                    )
                  })()}

                  {selectedItem.project_data.item.windowSelections && selectedItem.project_data.item.windowSelections.length > 0 && (() => {
                    const pd = selectedItem.project_data
                    const wLineItems: Array<{ id: string; amount: number }> =
                      pd.priceLineItems?.length > 0
                        ? pd.priceLineItems
                        : (PRICE_LINE_ITEM_PRESETS[pd.item?.serviceId as keyof typeof PRICE_LINE_ITEM_PRESETS] ?? [])
                    const wdProductLine = wLineItems.find((l) => l.id === 'wd-product')
                    const totalWQty: number = pd.item.windowSelections.reduce((s: number, w: any) => s + w.quantity, 0)
                    const totalDQty: number = (pd.item.doorSelections ?? []).reduce((s: number, d: any) => s + d.quantity, 0)
                    const totalUnits = totalWQty + totalDQty
                    const fmt = (n: number) => `$${n.toLocaleString()}`
                    type WRow = { w: any; unitPrice: number; hasCatalogPrice: boolean; lineTotal: number | null }
                    const windowRows: WRow[] = pd.item.windowSelections.map((w: any) => {
                      const unitPrice = windowCatalogUnitPrice(w, getVendorPrice, pd.item.serviceId)
                      const hasCatalogPrice = unitPrice > 0
                      const lineTotal = hasCatalogPrice
                        ? unitPrice * w.quantity
                        : (wdProductLine && totalUnits > 0 ? Math.round(wdProductLine.amount / totalUnits * w.quantity) : null)
                      return { w, unitPrice, hasCatalogPrice, lineTotal }
                    })
                    const windowsTotal = windowRows.reduce((s: number, r: WRow) => s + (r.lineTotal ?? 0), 0)
                    const wVisible = isAdminWorkflow ? windowsExpanded : true
                    return (
                      <div className="rounded-xl border p-4 space-y-2">
                        {isAdminWorkflow ? (
                          <button
                            type="button"
                            className="w-full flex items-center justify-between"
                            onClick={() => setWindowsExpanded((e) => !e)}
                          >
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Windows</h4>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{totalWQty} window{totalWQty !== 1 ? 's' : ''} · {fmt(windowsTotal)}</span>
                              {windowsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </div>
                          </button>
                        ) : (
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Windows</h4>
                        )}
                        {wVisible && windowRows.map(({ w, unitPrice, hasCatalogPrice, lineTotal }) => (
                          <div key={w.id} className="flex items-center justify-between text-[10px]">
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="outline">{w.size.replace('x', '"×')}" ×{w.quantity}</Badge>
                              <Badge variant="secondary">{w.type}</Badge>
                              <Badge variant="outline">{w.frameColor}</Badge>
                              <Badge variant="outline">{w.glassColor}</Badge>
                            </div>
                            {hasCatalogPrice ? (
                              <div className="flex items-center gap-1 text-xs ml-2">
                                <span className="text-muted-foreground">{w.quantity}</span>
                                <span className="text-muted-foreground">×</span>
                                <span className="font-medium">{fmt(unitPrice)}</span>
                                <span className="text-muted-foreground">=</span>
                                <span className="font-bold text-primary">{fmt(unitPrice * w.quantity)}</span>
                              </div>
                            ) : lineTotal !== null ? (
                              <span className="ml-2 text-xs font-bold text-primary whitespace-nowrap">{fmt(lineTotal)}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {selectedItem.project_data.item.doorSelections && selectedItem.project_data.item.doorSelections.length > 0 && (() => {
                    const pd = selectedItem.project_data
                    const dLineItems: Array<{ id: string; amount: number }> =
                      pd.priceLineItems?.length > 0
                        ? pd.priceLineItems
                        : (PRICE_LINE_ITEM_PRESETS[pd.item?.serviceId as keyof typeof PRICE_LINE_ITEM_PRESETS] ?? [])
                    const wdProductLine2 = dLineItems.find((l) => l.id === 'wd-product')
                    const totalWQty2: number = (pd.item.windowSelections ?? []).reduce((s: number, w: any) => s + w.quantity, 0)
                    const totalDQty: number = pd.item.doorSelections.reduce((s: number, d: any) => s + d.quantity, 0)
                    const totalUnits2 = totalWQty2 + totalDQty
                    const fmt = (n: number) => `$${n.toLocaleString()}`
                    type DRow = { d: any; unitPrice: number; hasCatalogPrice: boolean; lineTotal: number | null }
                    const doorRows: DRow[] = pd.item.doorSelections.map((d: any) => {
                      const unitPrice = doorCatalogUnitPrice(d, getVendorPrice, pd.item.serviceId)
                      const hasCatalogPrice = unitPrice > 0
                      const lineTotal = hasCatalogPrice
                        ? unitPrice * d.quantity
                        : (wdProductLine2 && totalUnits2 > 0 ? Math.round(wdProductLine2.amount / totalUnits2 * d.quantity) : null)
                      return { d, unitPrice, hasCatalogPrice, lineTotal }
                    })
                    const doorsTotal = doorRows.reduce((s: number, r: DRow) => s + (r.lineTotal ?? 0), 0)
                    const dVisible = isAdminWorkflow ? doorsExpanded : true
                    return (
                      <div className="rounded-xl border p-4 space-y-2">
                        {isAdminWorkflow ? (
                          <button
                            type="button"
                            className="w-full flex items-center justify-between"
                            onClick={() => setDoorsExpanded((e) => !e)}
                          >
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Doors</h4>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{totalDQty} door{totalDQty !== 1 ? 's' : ''} · {fmt(doorsTotal)}</span>
                              {doorsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </div>
                          </button>
                        ) : (
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Doors</h4>
                        )}
                        {dVisible && doorRows.map(({ d, unitPrice, hasCatalogPrice, lineTotal }) => (
                          <div key={d.id} className="flex items-center justify-between text-[10px]">
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="outline">{d.size.replace('x', '"×')}" ×{d.quantity}</Badge>
                              <Badge variant="secondary">{d.type}</Badge>
                              <Badge variant="outline">{d.frameColor}</Badge>
                              <Badge variant="outline">{d.glassColor}</Badge>
                            </div>
                            {hasCatalogPrice ? (
                              <div className="flex items-center gap-1 text-xs ml-2">
                                <span className="text-muted-foreground">{d.quantity}</span>
                                <span className="text-muted-foreground">×</span>
                                <span className="font-medium">{fmt(unitPrice)}</span>
                                <span className="text-muted-foreground">=</span>
                                <span className="font-bold text-primary">{fmt(unitPrice * d.quantity)}</span>
                              </div>
                            ) : lineTotal !== null ? (
                              <span className="ml-2 text-xs font-bold text-primary whitespace-nowrap">{fmt(lineTotal)}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Phase C — Garage Doors, Install Windows, Install Doors, Permit price cards (catalog-first) */}
                  {(() => {
                    const pd = selectedItem.project_data
                    const lineItems: Array<{ id: string; label: string; amount: number }> =
                      pd.priceLineItems && pd.priceLineItems.length > 0
                        ? pd.priceLineItems
                        : (PRICE_LINE_ITEM_PRESETS[pd.item?.serviceId as keyof typeof PRICE_LINE_ITEM_PRESETS] ?? [])
                    const findLine = (id: string) => lineItems.find((l) => l.id === id)
                    const gd = pd.item?.garageDoorSelection
                    const ws = pd.item?.windowSelections as Array<{ id: string; quantity: number }> | undefined
                    const ds = pd.item?.doorSelections as Array<{ id: string; quantity: number }> | undefined
                    const hasAny = gd?.type || (ws?.length) || (ds?.length) || lineItems.find((l) => l.label?.toLowerCase().includes('permit'))
                    if (!hasAny) return null
                    const fmtD = (n: number) => `$${n.toLocaleString()}`
                    return (
                      <>
                        {gd?.type && (() => {
                          const catalogUnit = garageDoorCatalogUnitPrice(gd as any, getVendorPrice, pd.item.serviceId)
                          const garageLine = findLine('wd-garage-door')
                          const hasCatalog = catalogUnit > 0
                          const displayPrice = hasCatalog ? catalogUnit : garageLine?.amount
                          if (!displayPrice) return null
                          return (
                            <div className="rounded-xl border p-4 space-y-2">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Garage Doors</h4>
                              <div className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-primary/5">
                                <span className="font-medium">
                                  {gd.type === 'single_garage' ? 'Single Garage Door' : 'Double Garage Door'}
                                </span>
                                {hasCatalog ? (
                                  <div className="flex items-center gap-1 text-sm">
                                    <span className="text-muted-foreground">1 ×</span>
                                    <span className="font-medium">{fmtD(catalogUnit)}</span>
                                    <span className="text-muted-foreground">=</span>
                                    <span className="font-bold text-primary">{fmtD(catalogUnit)}</span>
                                  </div>
                                ) : (
                                  <span className="font-bold text-primary">{fmtD(displayPrice)}</span>
                                )}
                              </div>
                              {(gd.size || gd.color || gd.glass) && (
                                <div className="flex flex-wrap gap-1.5 px-2 text-[10px]">
                                  {gd.type === 'double_garage' && gd.size && (
                                    <Badge variant="outline" className="text-[10px]">{gd.size === 'gd_4_panels' ? '4 Panels' : '5 Panels'}</Badge>
                                  )}
                                  {gd.color && <Badge variant="outline" className="text-[10px]">{gd.color.charAt(0).toUpperCase() + gd.color.slice(1)}</Badge>}
                                  {gd.glass && <Badge variant="outline" className="text-[10px]">Glass: {gd.glass.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}</Badge>}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                        {ws && ws.length > 0 && (() => {
                          const installWindowsLine = findLine('wd-install-windows')
                          const totalQty = ws.reduce((s, w) => s + w.quantity, 0)
                          const catalogUnit = getVendorPrice(pd.item.serviceId, 'install_windows')
                          const hasCatalog = catalogUnit > 0
                          const displayTotal = hasCatalog ? catalogUnit * totalQty : installWindowsLine?.amount
                          if (!displayTotal) return null
                          return (
                            <div className="rounded-xl border p-4 space-y-2">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Install Windows</h4>
                              <div className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-primary/5">
                                <span className="text-muted-foreground">Installation labor</span>
                                {hasCatalog ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">{totalQty} ×</span>
                                    <span className="font-medium">{fmtD(catalogUnit)}</span>
                                    <span className="text-xs text-muted-foreground">=</span>
                                    <span className="font-bold text-primary">{fmtD(displayTotal)}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">×{totalQty}</span>
                                    <span className="font-bold text-primary">{fmtD(displayTotal)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                        {ds && ds.length > 0 && (() => {
                          const installDoorsLine = findLine('wd-install-doors')
                          const totalQty = ds.reduce((s, d) => s + d.quantity, 0)
                          const catalogUnit = getVendorPrice(pd.item.serviceId, 'install_doors')
                          const hasCatalog = catalogUnit > 0
                          const displayTotal = hasCatalog ? catalogUnit * totalQty : installDoorsLine?.amount
                          if (!displayTotal) return null
                          return (
                            <div className="rounded-xl border p-4 space-y-2">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Install Doors</h4>
                              <div className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-primary/5">
                                <span className="text-muted-foreground">Installation labor</span>
                                {hasCatalog ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">{totalQty} ×</span>
                                    <span className="font-medium">{fmtD(catalogUnit)}</span>
                                    <span className="text-xs text-muted-foreground">=</span>
                                    <span className="font-bold text-primary">{fmtD(displayTotal)}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">×{totalQty}</span>
                                    <span className="font-bold text-primary">{fmtD(displayTotal)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                        {(() => {
                          const permitLine = lineItems.find((l) => l.label?.toLowerCase().includes('permit'))
                          const catalogPrice = getVendorPrice(pd.item.serviceId, 'permit')
                          const hasCatalog = catalogPrice > 0
                          const displayPrice = hasCatalog ? catalogPrice : permitLine?.amount
                          if (!displayPrice) return null
                          return (
                            <div className="rounded-xl border p-4 space-y-2">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Permit</h4>
                              <div className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-primary/5">
                                <span className="text-muted-foreground">Permit Fee</span>
                                <span className="font-bold text-primary">{fmtD(displayPrice)}</span>
                              </div>
                            </div>
                          )
                        })()}
                        {(() => {
                          if (!pd.saleAmount || pd.status !== 'sold') return null
                          const catalogTotal = computeWindowsDoorsCatalogTotal(pd.item as any, lineItems, getVendorPrice)
                          const upsaleAmount = pd.saleAmount - catalogTotal
                          if (upsaleAmount <= 0) return null
                          return (
                            <div className="rounded-xl border p-4 space-y-2">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upsale</h4>
                              <div className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-primary/5">
                                <span className="text-muted-foreground">Upsale</span>
                                <span className="font-bold text-primary">{fmtD(upsaleAmount)}</span>
                              </div>
                            </div>
                          )
                        })()}
                      </>
                    )
                  })()}

                  {/* Ship #336 Phase A — Pricing Breakdown read-only section.
                      Snapshotted from PRICE_LINE_ITEM_PRESETS at sendProject
                      time per banked feedback_immutable_ledger_freeze_at_write
                      so the per-project breakdown locks at intake.
                      Ship #337 Phase A finishing-touch — added fallback to
                      PRICE_LINE_ITEM_PRESETS via item.serviceId lookup so
                      legacy sentProjects pre-#336 (lacking the snapshot) +
                      mockLead-derived synthetic data still render the
                      preset breakdown. Per banked CHAIN IS GOD: fallback
                      is consumer-render-layer only — no schema-change
                      to Lead type and no vendor-lead-stages.ts mapping
                      modification. */}
                  {(() => {
                    const pd = selectedItem.project_data
                    const snapshot = pd.priceLineItems
                    const serviceId = pd.item?.serviceId
                    const fallback = serviceId
                      ? PRICE_LINE_ITEM_PRESETS[serviceId as keyof typeof PRICE_LINE_ITEM_PRESETS]
                      : undefined
                    const priceLineItems = snapshot && snapshot.length > 0 ? snapshot : fallback
                    if (!priceLineItems || priceLineItems.length === 0) return null

                    const isSold = pd.status === 'sold'
                    type LineItem = { id: string; label: string; amount: number }
                    let displayLineItems: LineItem[] = priceLineItems as LineItem[]
                    let displayTotal = (priceLineItems as LineItem[]).reduce((sum, l) => sum + (l.amount || 0), 0)

                    // For windows_doors (pre-sale and sold): compute catalog-priced subtotals.
                    // Pre-sale: displayTotal = catalogSum. Sold: append Upsale = saleAmount - catalogSum
                    // so breakdown total = saleAmount (Rodolfo: Upsale is delta over original quoted price).
                    if (serviceId === 'windows_doors') {
                      const item = pd.item as any
                      const totalWQty = item.windowSelections?.reduce((s: number, w: any) => s + w.quantity, 0) ?? 0
                      const totalDQty = item.doorSelections?.reduce((s: number, d: any) => s + d.quantity, 0) ?? 0
                      const totalUnits = totalWQty + totalDQty
                      const wdProductLine = (priceLineItems as LineItem[]).find((l) => l.id === 'wd-product')

                      let windowsAmt = 0
                      for (const w of item.windowSelections ?? []) {
                        const unit = windowCatalogUnitPrice(w, getVendorPrice, serviceId)
                        if (unit > 0) windowsAmt += unit * w.quantity
                        else if (wdProductLine && totalUnits > 0) windowsAmt += Math.round(wdProductLine.amount / totalUnits * w.quantity)
                      }
                      let doorsAmt = 0
                      for (const d of item.doorSelections ?? []) {
                        const unit = doorCatalogUnitPrice(d, getVendorPrice, serviceId)
                        if (unit > 0) doorsAmt += unit * d.quantity
                        else if (wdProductLine && totalUnits > 0) doorsAmt += Math.round(wdProductLine.amount / totalUnits * d.quantity)
                      }
                      let garageAmt = 0
                      const gd = item.garageDoorSelection
                      if (gd?.type) {
                        const gdUnit = garageDoorCatalogUnitPrice(gd, getVendorPrice, serviceId)
                        const gdLine = (priceLineItems as LineItem[]).find((l) => l.id === 'wd-garage-door')
                        garageAmt = gdUnit > 0 ? gdUnit : (gdLine?.amount ?? 0)
                      }
                      let installWAmt = 0
                      if (totalWQty > 0) {
                        const catalogInstallW = getVendorPrice(serviceId, 'install_windows')
                        const wInstallLine = (priceLineItems as LineItem[]).find((l) => l.id === 'wd-install-windows')
                        installWAmt = catalogInstallW > 0 ? catalogInstallW * totalWQty : (wInstallLine?.amount ?? 0)
                      }
                      let installDAmt = 0
                      if (totalDQty > 0) {
                        const catalogInstallD = getVendorPrice(serviceId, 'install_doors')
                        const dInstallLine = (priceLineItems as LineItem[]).find((l) => l.id === 'wd-install-doors')
                        installDAmt = catalogInstallD > 0 ? catalogInstallD * totalDQty : (dInstallLine?.amount ?? 0)
                      }
                      let permitAmt = 0
                      const hasPermit = item.selections && Object.values(item.selections as Record<string, string[]>).flat().includes('permit')
                      if (hasPermit) {
                        const catalogPermit = getVendorPrice(serviceId, 'permit')
                        const permitLine = (priceLineItems as LineItem[]).find((l) => l.label?.toLowerCase().includes('permit'))
                        permitAmt = catalogPermit > 0 ? catalogPermit : (permitLine?.amount ?? 0)
                      }

                      const catalogLines: LineItem[] = [
                        { id: 'wd-product', label: 'Windows & Doors (Product)', amount: windowsAmt + doorsAmt },
                        { id: 'wd-install-windows', label: 'Window Installation', amount: installWAmt },
                        { id: 'wd-install-doors', label: 'Door Installation', amount: installDAmt },
                        { id: 'wd-garage-door', label: 'Garage Door', amount: garageAmt },
                        { id: 'wd-permit', label: 'Permit Fee', amount: permitAmt },
                      ].filter((l) => l.amount > 0)
                      const catalogSum = catalogLines.reduce((s, l) => s + l.amount, 0)
                      if (catalogSum > 0) {
                        const saleAmt = selectedItem.saleAmount ?? 0
                        const upsale = isSold && saleAmt > catalogSum ? saleAmt - catalogSum : 0
                        const finalLines: LineItem[] = upsale > 0
                          ? [...catalogLines, { id: 'upsale-adj', label: 'Upsale', amount: upsale }]
                          : catalogLines
                        displayLineItems = finalLines
                        displayTotal = finalLines.reduce((s, l) => s + l.amount, 0)
                      }
                    }

                    return (
                      <div className="rounded-xl border p-4 space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pricing Breakdown</h4>
                        <div className="space-y-1.5 text-sm">
                          {displayLineItems.map((line) => {
                            const li = line as typeof line & { priceUnit?: string; unitRate?: number; unitQuantity?: number }
                            return (
                              <div key={line.id} className="flex justify-between items-start gap-2">
                                <div className="flex flex-col min-w-0">
                                  <span className="text-muted-foreground">{line.label}</span>
                                  {li.priceUnit && li.unitRate !== undefined && li.unitQuantity !== undefined && (
                                    <span className="text-[10px] text-muted-foreground/70">
                                      ${li.unitRate.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/{li.priceUnit === 'square' ? 'square' : li.priceUnit === 'sqft' ? 'sqft' : 'lin ft'} × {li.unitQuantity.toLocaleString()} {li.priceUnit === 'square' ? 'squares' : li.priceUnit === 'sqft' ? 'sqft' : 'lin ft'}
                                    </span>
                                  )}
                                </div>
                                <span className="font-medium shrink-0">${line.amount.toLocaleString()}</span>
                              </div>
                            )
                          })}
                          <div className="border-t pt-1.5 flex justify-between">
                            <span className="font-semibold">Total</span>
                            <span className="font-bold">${displayTotal.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {selectedItem.project_data.rejectionReason && (
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-1">
                      <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Rejection Reason</h4>
                      <p className="text-sm text-red-700">{selectedItem.project_data.rejectionReason}</p>
                    </div>
                  )}
                </>
              )}

              {/* Audit Trail — default mode only; admin-workflow moves this to left col. */}
              {(() => {
                if (isAdminWorkflow) return null
                const extra = selectedItem as typeof selectedItem & {
                  _bookingDate?: string
                  _bookingTime?: string
                  _confirmedAt?: string
                  _repAssignedAt?: string
                  _rescheduleRequest?: { requestedBy: string; proposedDate: string; proposedTime: string; originalDate: string; originalTime: string; status: string; reason?: string }
                  _cancellationRequest?: { status: string; reason?: string; explanation?: string }
                  _idDocument?: string
                  _homeownerId?: string
                }
                const hasAny =
                  extra._bookingDate ||
                  extra._confirmedAt ||
                  extra._repAssignedAt ||
                  extra._rescheduleRequest ||
                  extra._cancellationRequest ||
                  extra._idDocument ||
                  extra._homeownerId
                if (!hasAny) return null
                return (
                  <div className="rounded-xl border p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Audit Trail</h4>
                    <div className="space-y-2 text-sm">
                      {extra._bookingDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">Booked slot</span>
                          <span className="font-medium">
                            {extra._bookingDate}{extra._bookingTime ? ` · ${extra._bookingTime}` : ''}
                          </span>
                        </div>
                      )}
                      {extra._confirmedAt && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">Vendor confirmed</span>
                          <span className="font-medium">{fmtDate(extra._confirmedAt)}</span>
                        </div>
                      )}
                      {extra._repAssignedAt && (
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">Rep assigned</span>
                          <span className="font-medium">{fmtDate(extra._repAssignedAt)}</span>
                        </div>
                      )}
                      {extra._cancellationRequest && (
                        <div className="flex items-start gap-2">
                          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="flex items-center gap-2">
                              <span className="text-muted-foreground min-w-[108px]">Cancellation</span>
                              <Badge variant="outline" className="text-[10px] capitalize">{extra._cancellationRequest.status}</Badge>
                            </p>
                            {extra._cancellationRequest.reason && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">
                                "{extra._cancellationRequest.reason}"
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {extra._rescheduleRequest && (
                        <div className="flex items-start gap-2">
                          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-0.5">
                            <p className="flex items-center gap-2">
                              <span className="text-muted-foreground min-w-[108px]">Reschedule</span>
                              <Badge variant="outline" className="text-[10px] capitalize">{extra._rescheduleRequest.status}</Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {extra._rescheduleRequest.requestedBy}-initiated
                              </span>
                            </p>
                            <p className="text-xs text-foreground/80">
                              {extra._rescheduleRequest.proposedDate} · {extra._rescheduleRequest.proposedTime}
                              <span className="text-muted-foreground ml-1.5">
                                (was {extra._rescheduleRequest.originalDate} · {extra._rescheduleRequest.originalTime})
                              </span>
                            </p>
                            {extra._rescheduleRequest.reason && (
                              <p className="text-xs text-muted-foreground italic">
                                "{extra._rescheduleRequest.reason}"
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {extra._idDocument && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">ID on file</span>
                          <img
                            src={extra._idDocument}
                            alt="Customer ID"
                            className="h-12 w-20 rounded border object-cover"
                          />
                        </div>
                      )}
                      {extra._homeownerId && (
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground min-w-[108px]">Homeowner ID</span>
                          <span className="font-mono text-[11px] text-foreground/80 break-all">
                            {extra._homeownerId}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Commission — default mode: tail of right col (original position). */}
              {(() => {
                if (isAdminWorkflow) return null
                const isTxContext = !!transactionFallback && transactionFallback.type === 'commission'
                const statusGateHeld = selectedItem.status === 'sold' && selectedItem.saleAmount && selectedItem.saleAmount > 0
                if (!isTxContext && !statusGateHeld) return null
                const vendorPct = 100 - commissionPct
                const txAmount = transactionFallback?.type === 'commission' ? transactionFallback.amount : null
                const saleAmount = (selectedItem.saleAmount && selectedItem.saleAmount > 0)
                  ? selectedItem.saleAmount
                  : (txAmount && commissionPct > 0 ? Math.round((txAmount * 100) / commissionPct) : 0)
                if (saleAmount <= 0) return null
                const bcAmount = Math.round(saleAmount * (commissionPct / 100))
                const vendorAmount = saleAmount - bcAmount
                return (
                  <div className="rounded-xl border p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commission</h4>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sale Total</span>
                        <span className="font-bold">${saleAmount.toLocaleString()}</span>
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
