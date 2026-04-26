import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, FileText, Percent, AlertTriangle, ChevronRight, Briefcase, Phone, MapPin } from 'lucide-react'
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
import { MOCK_VENDORS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import type { LeadStatus } from '@/types'

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

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [agreementViewOpen, setAgreementViewOpen] = useState(false)
  const [repromptConfirmOpen, setRepromptConfirmOpen] = useState(false)

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

  const allProjects = useMemo(() => {
    if (!vendor) return []
    const rows: { id: string; date: string; project: string; status: string; clickId: string; source: 'sent' | 'lead' }[] = []

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
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-sm text-muted-foreground">Platform fee on each closed sale</span>
            <div className="sm:ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={draftCommission}
                  onChange={(e) => setDraftCommission(e.target.value)}
                  className="w-20 h-9 text-center text-sm font-bold"
                  data-admin-vendor-commission-input
                />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">%</span>
              </div>
              <Button
                size="sm"
                onClick={handleSaveCommission}
                disabled={!hasUnsavedChanges}
                data-admin-vendor-commission-save
              >
                Save Changes
              </Button>
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
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

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
