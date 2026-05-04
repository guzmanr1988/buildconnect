import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, FileText, Percent, AlertTriangle, ChevronRight, ChevronDown, Briefcase, Phone, MapPin, Users, CreditCard, Download, Mail, User, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { EmptyState } from '@/components/shared/empty-state'
import { ProjectDetailDialog } from '@/components/shared/project-detail-dialog'
import { NonCircumventionAgreementDialog } from '@/components/shared/non-circumvention-agreement-dialog'
import { CURRENT_AGREEMENT_VERSION } from '@/lib/non-circumvention-agreement'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useVendorEmployeesStore, EMPLOYEE_STATUS_LABELS, type VendorEmployee } from '@/stores/vendor-employees-store'
import { useVendorBillingStore, PAYMENT_METHOD_LABELS } from '@/stores/vendor-billing-store'
import { useVendorHomeownerDocsStore, VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS } from '@/stores/vendor-homeowner-documents-store'
import { useVendorCatalogStore } from '@/stores/vendor-catalog-store'
import { MOCK_VENDORS, MOCK_CATALOG } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { useAssigneeMap } from '@/lib/hooks/use-assignee-map'
import type { LeadStatus, ServiceCategory } from '@/types'

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  roofing: 'Roofing',
  windows_doors: 'Windows & Doors',
  pool: 'Pool',
  driveways: 'Driveways',
  fencing: 'Fencing',
  pergolas: 'Pergolas',
  air_conditioning: 'Air Conditioning',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  wall_paneling: 'Wall Paneling',
  garage: 'Garage',
  house_painting: 'House Painting',
  blinds: 'Blinds',
}

// Ship #284 — admin per-vendor detail page (Rodolfo-direct, mock-data
// only per banked rule). Section-split: card-side keeps vendor info +
// closed sales + total revenue + Message + Suspend + Verify. Detail
// page gets Commission Fee + Agreement (sign-status + Reprompt) +
// All Detailed Projects (clickable per-project rows).
//
// Header inline per banked surface-vs-deep audit (vendor profile-header
// vs admin-detail-header diverge on actions/metadata; surface-match
// without deep-match — no extraction).
//
// MOCK data only. lib/api/vendors.ts predates revert scope, remains
// untouched. No Supabase wire-up.

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  sold: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
  rescheduled: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

export default function AdminVendorDetail() {
  const { vendorId: rawId } = useParams<{ vendorId: string }>()
  const vendorId = rawId ? decodeURIComponent(rawId) : ''
  const vendor = useMemo(() => MOCK_VENDORS.find((v) => v.id === vendorId), [vendorId])

  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  const setVendorCommission = useAdminModerationStore((s) => s.setVendorCommission)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  const mockLeads = useEffectiveMockLeads()

  const employeesByVendor = useVendorEmployeesStore((s) => s.employeesByVendor)
  const hydrateAdminEmployees = useVendorEmployeesStore((s) => s.hydrateAdmin)
  useEffect(() => {
    if (vendorId) hydrateAdminEmployees(vendorId)
  }, [vendorId, hydrateAdminEmployees])
  const paymentMethodsByVendor = useVendorBillingStore((s) => s.paymentMethodsByVendor)
  const paymentMethods = useMemo(() => paymentMethodsByVendor[vendorId] ?? [], [paymentMethodsByVendor, vendorId])
  const docsByVendorByHomeowner = useVendorHomeownerDocsStore((s) => s.docsByVendorByHomeowner)
  const vendorCatalogServices = useVendorCatalogStore((s) => s.services)

  const vendorCatalogItems = useMemo(
    () => MOCK_CATALOG.filter((ci) => ci.vendor_id === vendorId && ci.active),
    [vendorId],
  )

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [agreementViewOpen, setAgreementViewOpen] = useState(false)
  const [repromptConfirmOpen, setRepromptConfirmOpen] = useState(false)
  const [repsExpanded, setRepsExpanded] = useState(false)
  const [selectedRep, setSelectedRep] = useState<VendorEmployee | null>(null)

  // Ship #286 — Rodolfo-direct: explicit Save button on Commission Fee
  // so user sees confirmation that their % is persisted, not implicit
  // auto-save on each keystroke. Local draft state decouples input
  // from store; Save button commits via setVendorCommission + toast.
  // Drafts sync back when store changes from outside (e.g., another
  // tab edits the same vendor) so the input doesn't get stuck on a
  // stale-value while the canonical store moves underneath.
  const persistedCommissionPct = vendor
    ? (vendorCommissionOverrides[vendor.id] ?? vendor.commission_pct)
    : 15
  const [draftCommission, setDraftCommission] = useState(String(persistedCommissionPct))
  useEffect(() => {
    setDraftCommission(String(persistedCommissionPct))
  }, [persistedCommissionPct])
  const assigneeMap = useAssigneeMap(vendor?.id ?? '')

  const allProjects = useMemo(() => {
    if (!vendor) return []
    const rows: { id: string; date: string; project: string; status: string; clickId: string; leadId: string; source: 'sent' | 'lead' }[] = []

    sentProjects
      .filter((sp) => {
        if (sp.contractor?.vendor_id) return sp.contractor.vendor_id === vendor.id
        return sp.contractor?.company === vendor.company
      })
      .forEach((sp) => {
        rows.push({
          id: `sp-${sp.id}`,
          date: sp.sentAt,
          project: sp.item.serviceName + (sp.homeowner?.name ? ` · ${sp.homeowner.name}` : ''),
          status: sp.status,
          clickId: sp.id,
          leadId: `L-${sp.id.slice(0, 4).toUpperCase()}`,
          source: 'sent',
        })
      })

    mockLeads
      .filter((l) => l.vendor_id === vendor.id)
      .forEach((l) => {
        const cReq = cancellationRequestsByLead[l.id]
        const cancelApproved = cReq?.status === 'approved'
        const effectiveStatus = cancelApproved ? 'cancelled' : (leadStatusOverrides[l.id] ?? l.status)
        rows.push({
          id: `ml-${l.id}`,
          date: l.received_at ?? l.slot ?? new Date().toISOString(),
          project: l.project + ` · ${l.homeowner_name}`,
          status: effectiveStatus,
          clickId: l.id,
          leadId: l.id,
          source: 'lead',
        })
      })

    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [vendor, sentProjects, mockLeads, leadStatusOverrides, cancellationRequestsByLead])

  if (!vendor) {
    return (
      <div className="space-y-6">
        <Link to="/admin/vendors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to vendors
        </Link>
        <EmptyState
          icon={AlertTriangle}
          title="Vendor not found"
          description={`No vendor with id ${vendorId} in the registry.`}
        />
      </div>
    )
  }

  // Ship #286 — Save-button validation + handler. draftAsNumber parses
  // the live input; valid range 1-50% (matches existing min/max attrs).
  // hasUnsavedChanges drives Save button enabled state — disabled when
  // value matches store (no-op) or when invalid (NaN / out-of-range).
  const draftAsNumber = Number(draftCommission)
  const isDraftValid = !Number.isNaN(draftAsNumber) && draftAsNumber >= 1 && draftAsNumber <= 50
  const hasUnsavedChanges = isDraftValid && draftAsNumber !== persistedCommissionPct

  const handleSaveCommission = () => {
    if (!isDraftValid) {
      toast.error('Commission must be between 1 and 50%')
      return
    }
    setVendorCommission(vendor.id, draftAsNumber)
    toast.success(`Commission saved at ${draftAsNumber}%`)
  }

  const signed = vendor.noncircumvention_agreement_signed_at
  const signedDate = signed ? fmtDate(signed) : null
  const agreementVersion = vendor.noncircumvention_agreement_version
  const isAgreementCurrent = agreementVersion === CURRENT_AGREEMENT_VERSION

  return (
    <div className="space-y-6">
      <Link to="/admin/vendors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to vendors
      </Link>

      <PageHeader title={vendor.company} description={vendor.name} />

      {/* Header card inline (per banked surface-vs-deep audit — vendor
          profile-header vs admin-detail-header diverge on actions; no
          extraction). No actions in header — Suspend/Verify/Message
          stay on the card-side per Rodolfo spec. */}
      <Card className="rounded-xl">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <AvatarInitials initials={vendor.initials} color={vendor.avatar_color} size="lg" />
          <div className="flex-1 min-w-0 space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-semibold truncate">{vendor.company}</h2>
              {vendor.verified && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
              )}
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize bg-muted text-muted-foreground">
                {vendor.status}
              </span>
            </div>
            <p className="text-muted-foreground">{vendor.name}</p>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>{vendor.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{vendor.address}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section: Commission Fee — Ship #286 explicit Save button.
          Pre-#286 onChange auto-saved on each keystroke; user couldn't
          tell if their value persisted. Now: input updates local
          draft only; Save Changes button commits via setVendorCommission
          + toast confirmation (matches existing "Save Changes" +
          toast.success convention from admin/users + admin/banking +
          admin/products per banked cross-file-idiom-consistency). */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          <h2 className="font-heading text-lg font-semibold">Commission Fee</h2>
        </div>
        <Card className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40">
          {/* Ship #287 → #288 — layout reorder + vertical-hierarchy
              preservation. Description "Platform fee on each closed
              sale" stays on its OWN row above (matches Rodolfo
              screenshot). Controls row below uses justify-between to
              distribute Save (left) + input/% (right). #287 collapsed
              description inline with controls on desktop via single-
              flex justify-between; #288 corrects by wrapping controls
              in a sub-flex so description preserves its block-level
              row above. Input sized w-28/h-10/text-base per Rodolfo
              "a bit bigger" annotation (kept from #287). */}
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Platform fee on each closed sale</p>
            {/* Ship #289 — mobile layout fix. Pre-#289 controls row used
                flex-col sm:flex-row pattern; on mobile the col-stack made
                Save button stretch full-width + input/% wrapper left-
                aligned below. Total content width (Save ~130px + gap +
                input 112px + % ~15px) fits comfortably at mobile
                viewports (320px+ with 40px container padding leaves
                280px+ available). flex-row ALWAYS keeps Save left +
                input/% right via justify-between across breakpoints,
                matching desktop layout Rodolfo confirmed wanted. */}
            <div className="flex items-center justify-between gap-3">
              <Button
                size="sm"
                onClick={handleSaveCommission}
                disabled={!hasUnsavedChanges}
                data-admin-vendor-commission-save
              >
                Save Changes
              </Button>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={draftCommission}
                  onChange={(e) => setDraftCommission(e.target.value)}
                  className="w-28 h-10 text-center text-base font-bold"
                  data-admin-vendor-commission-input
                />
                <span className="text-base font-semibold text-amber-700 dark:text-amber-400">%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section: Agreement */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Non-Circumvention Agreement</h2>
        </div>
        <Card className="rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              {signed ? (
                <>
                  <p className="text-sm font-medium text-foreground">Signed {signedDate}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Version {agreementVersion ?? '—'}
                    {!isAgreementCurrent && agreementVersion && (
                      <span className="ml-1 text-amber-700 dark:text-amber-400">(stale)</span>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Not signed</p>
              )}
            </div>
            <Button variant="outline" size="sm" disabled={!signed} onClick={() => setAgreementViewOpen(true)}>
              View
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRepromptConfirmOpen(true)}>
              Reprompt
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Section: Products — PRODUCT-IS-GOD Phase A visibility (PR 1).
          Lists active CatalogItems for this vendor. Active-service count =
          priced options in vendor-catalog-store for the matching serviceId.
          Click-action is TBD in PR 6; circle is a status indicator only. */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Products</h2>
          <span className="text-sm text-muted-foreground">({vendorCatalogItems.length})</span>
        </div>
        {vendorCatalogItems.length === 0 ? (
          <Card className="rounded-xl">
            <CardContent className="p-5 text-sm text-muted-foreground">No products configured yet.</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {vendorCatalogItems.map((ci) => {
              const svc = vendorCatalogServices.find((s) => s.serviceId === ci.category)
              const activeCount = svc?.enabled
                ? Object.values(svc.pricing).filter((cents) => cents > 0).length
                : 0
              return (
                <Card key={ci.id} className="rounded-xl" data-admin-vendor-product={ci.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-medium text-foreground">{ci.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {CATEGORY_LABELS[ci.category] ?? ci.category}
                      </p>
                    </div>
                    <div
                      className={cn(
                        'flex items-center justify-center rounded-full h-9 px-3 text-xs font-semibold shrink-0',
                        activeCount > 0
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground',
                      )}
                      data-admin-vendor-product-active-count={ci.id}
                    >
                      {activeCount} active
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Section: All Detailed Projects */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">All Projects</h2>
          <span className="text-sm text-muted-foreground">({allProjects.length})</span>
        </div>
        {allProjects.length === 0 ? (
          <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">No projects yet for {vendor.company}.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {allProjects.map((p) => (
              <Card
                key={p.id}
                className="rounded-xl cursor-pointer hover:shadow-md transition"
                onClick={() => setSelectedProjectId(p.clickId)}
                data-admin-vendor-project-row={p.id}
                data-admin-vendor-project-source={p.source}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{p.project}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{fmtDate(p.date)}</span>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_BADGE_CLASS[p.status as LeadStatus | string] ?? 'bg-muted text-muted-foreground')}>
                        {p.status}
                      </span>
                      {(() => {
                        const a = assigneeMap[p.leadId]
                        return a ? (
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {a.name}
                            {a.isSelf && <span className="text-primary font-medium">you</span>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">Unassigned</span>
                        )
                      })()}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Section: Account Reps — collapsible, default collapsed */}
      {(() => {
        const employees = employeesByVendor[vendor.id] ?? []
        return (
          <section className="space-y-3">
            <button
              className="flex items-center gap-2 w-full text-left group"
              onClick={() => setRepsExpanded((v) => !v)}
            >
              <Users className="h-5 w-5 text-primary shrink-0" />
              <h2 className="font-heading text-lg font-semibold flex-1">Account Reps</h2>
              <span className="text-sm text-muted-foreground">({employees.length})</span>
              {repsExpanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />}
            </button>
            {repsExpanded && (
              employees.length === 0 ? (
                <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">No staff on file for {vendor.company}.</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {employees.map((emp) => (
                    <Card
                      key={emp.id}
                      className="rounded-xl cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setSelectedRep(emp)}
                    >
                      <CardContent className="p-4 flex items-start gap-4">
                        <div
                          className="mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: emp.avatarColor }}
                        >
                          {emp.firstName[0]}{emp.lastName[0]}
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="font-medium text-foreground">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-muted-foreground">{emp.title} — {emp.department}</p>
                          <p className="text-xs text-muted-foreground">{emp.email} · {emp.phone}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                            emp.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            emp.status === 'on_leave' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                            'bg-muted text-muted-foreground'
                          )}>
                            {EMPLOYEE_STATUS_LABELS[emp.status]}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            )}
          </section>
        )
      })()}

      {/* Rep detail dialog */}
      <Dialog open={!!selectedRep} onOpenChange={(open) => !open && setSelectedRep(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Account Rep Profile</DialogTitle>
            <DialogDescription>{vendor.company}</DialogDescription>
          </DialogHeader>
          {selectedRep && (
            <div className="space-y-4 py-1">
              <div className="flex items-center gap-4">
                <div
                  className="h-14 w-14 shrink-0 rounded-full flex items-center justify-center text-lg font-bold text-white"
                  style={{ backgroundColor: selectedRep.avatarColor }}
                >
                  {selectedRep.firstName[0]}{selectedRep.lastName[0]}
                </div>
                <div>
                  <p className="text-lg font-semibold font-heading">{selectedRep.firstName} {selectedRep.lastName}</p>
                  <p className="text-sm text-muted-foreground">{selectedRep.title}</p>
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium mt-1',
                    selectedRep.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                    selectedRep.status === 'on_leave' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {EMPLOYEE_STATUS_LABELS[selectedRep.status]}
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee Code</span>
                  <span className="font-mono font-medium">{selectedRep.employeeCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department</span>
                  <span className="font-medium">{selectedRep.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start Date</span>
                  <span className="font-medium">{new Date(selectedRep.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {selectedRep.managerName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reports To</span>
                    <span className="font-medium">{selectedRep.managerName}</span>
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-muted/50 p-4 space-y-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium ml-auto">{selectedRep.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium ml-auto">{selectedRep.phone}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">Address</span>
                  <span className="font-medium ml-auto text-right max-w-[60%]">{selectedRep.address}</span>
                </div>
              </div>
              {(selectedRep.emergencyContactName) && (
                <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Emergency Contact</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{selectedRep.emergencyContactName}</span>
                  </div>
                  {selectedRep.emergencyContactRelationship && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Relationship</span>
                      <span className="font-medium">{selectedRep.emergencyContactRelationship}</span>
                    </div>
                  )}
                  {selectedRep.emergencyContactPhone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone</span>
                      <span className="font-medium">{selectedRep.emergencyContactPhone}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedRep(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section: Banking */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Banking</h2>
          <span className="text-sm text-muted-foreground">({paymentMethods.length})</span>
        </div>
        {paymentMethods.length === 0 ? (
          <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">No payment methods on file.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {paymentMethods.map((pm) => (
              <Card key={pm.id} className="rounded-xl">
                <CardContent className="p-4 flex items-center gap-4">
                  <CreditCard className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium text-foreground">
                      {pm.brand ?? PAYMENT_METHOD_LABELS[pm.kind]} •••• {pm.last4}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pm.holder}
                      {pm.expiry && <span> · Exp {pm.expiry}</span>}
                      {pm.bankName && <span> · {pm.bankName}</span>}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground capitalize">
                    {pm.purpose}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Section: Documents (cross-homeowner god-view) */}
      {(() => {
        const allDocs = Object.values(docsByVendorByHomeowner[vendor.id] ?? {}).flat()
        const byHomeowner = allDocs.reduce<Record<string, typeof allDocs>>((acc, doc) => {
          const key = doc.homeowner_email
          acc[key] = [...(acc[key] ?? []), doc]
          return acc
        }, {})
        return (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-lg font-semibold">Documents</h2>
              <span className="text-sm text-muted-foreground">({allDocs.length})</span>
            </div>
            {allDocs.length === 0 ? (
              <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">No documents uploaded by {vendor.company} yet.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {Object.entries(byHomeowner).map(([email, docs]) => (
                  <div key={email} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">{email}</p>
                    {docs.map((doc) => (
                      <Card key={doc.id} className="rounded-xl">
                        <CardContent className="p-3 flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{doc.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.customLabel ?? VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS[doc.category]} · {fmtDate(doc.uploadedAt)}
                            </p>
                          </div>
                          <a
                            href={doc.dataUrl}
                            download={doc.filename}
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })()}

      {/* Project detail dialog (#248 dual-lookup pattern, #279 cs.lead_id
          fix learned for closed-sale rows — sentProjects pass sp.id,
          mockLeads pass l.id which IS the L-XXXX format the dialog
          resolves via mockLeads.find). */}
      <ProjectDetailDialog
        open={!!selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
        projectId={selectedProjectId}
      />

      {/* Agreement view dialog */}
      {agreementViewOpen && (
        <NonCircumventionAgreementDialog
          mode="view"
          open
          onOpenChange={(o) => !o && setAgreementViewOpen(false)}
          profile={vendor}
        />
      )}

      {/* Reprompt confirmation — destructive-confirm-four-refinement
          per banked default. Reuses the same shape as admin/vendors.tsx
          existing Reprompt dialog. */}
      <Dialog open={repromptConfirmOpen} onOpenChange={setRepromptConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Force re-sign of agreement?</DialogTitle>
            <DialogDescription>
              {vendor.company} will be locked out of their portal on next login until they re-sign the current agreement. Their previously-signed audit record will remain on file. Use this when the agreement language has materially changed and prior consent no longer applies.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            If you only need to nudge a vendor without locking them out, send a message instead.
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRepromptConfirmOpen(false)}>
              Keep current signature
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => {
                // TODO Tranche-2: write reprompt-flag to vendor's
                // profile via Supabase so the gate at vendor-layout
                // sees it on next login. For mock-mode this is a
                // toast + admin-record stub — real cross-session
                // enforcement waits on backend wiring.
                toast.success(`Reprompt sent — ${vendor.company} will see the agreement on next login.`)
                setRepromptConfirmOpen(false)
              }}
            >
              Reprompt sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
