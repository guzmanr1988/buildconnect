import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import {
  MapPin,
  Calendar,
  MessageSquare,
  ShieldCheck,
  Ban,
  Users,
  FileText,
  Percent,
  Send,
  CheckCircle2,
  RotateCcw,
  MessageCircle,
  Check,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useVendorChangeRequestsStore } from '@/stores/vendor-change-requests-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { StatusBadge } from '@/components/shared/status-badge'
import { Input } from '@/components/ui/input'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { NonCircumventionAgreementDialog } from '@/components/shared/non-circumvention-agreement-dialog'
import { CURRENT_AGREEMENT_VERSION } from '@/lib/non-circumvention-agreement'
import {
  useEffectiveMockLeads,
  useEffectiveMockClosedSales,
} from '@/lib/mock-data-effective'
import type { LeadStatus, Vendor } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

export default function VendorsPage() {
  const changeRequests = useVendorChangeRequestsStore((s) => s.requests)
  const approveRequest = useVendorChangeRequestsStore((s) => s.approveRequest)
  const denyRequest = useVendorChangeRequestsStore((s) => s.denyRequest)
  const pendingChangeRequests = changeRequests.filter((r) => r.status === 'pending')

  // Cross-tab rehydrate: vendor-side change-requests + project status changes
  // persist to localStorage but don't cross-tab-sync. Rehydrate on tab-back
  // so admin sees the freshest state. Phase 2b admin-SoT per kratos msg
  // 1776725252468.
  const rehydrateRequests = useCallback(() => useVendorChangeRequestsStore.persist.rehydrate(), [])
  const rehydrateProjects = useCallback(() => useProjectsStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateRequests)
  useRefetchOnFocus(rehydrateProjects)

  // Per-vendor lead-status merge: MOCK_LEADS.status + vendor-side overrides.
  // Previously the per-vendor status counts ignored vendor confirm/reject
  // actions (only raw MOCK_LEADS.status seen); now the accordion accurately
  // reflects vendor state changes.
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  // Ship #250 — effective-fixture hooks honor the demoDataHidden flag.
  const mockLeads = useEffectiveMockLeads()
  const mockClosedSales = useEffectiveMockClosedSales()
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [resolveRequestId, setResolveRequestId] = useState<string | null>(null)
  const [resolveAction, setResolveAction] = useState<'approve' | 'deny'>('approve')
  const [resolveNote, setResolveNote] = useState('')
  // Ship #270 — agreement view + re-prompt state. agreementViewVendor
  // holds the vendor whose signed-snapshot opens in view-mode dialog.
  // repromptVendor holds the vendor pending re-prompt confirmation.
  const [agreementViewVendor, setAgreementViewVendor] = useState<Vendor | null>(null)
  const [repromptVendor, setRepromptVendor] = useState<Vendor | null>(null)
  // Ship #172 (task_1776719975617_951) — data-edit form state. Populated
  // from the effective vendor profile on openResolve so admin can tweak
  // the fields in place. Only non-empty trimmed fields are committed on
  // approve (see admin-moderation-store.applyVendorProfileEdit).
  const [editName, setEditName] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editEmail, setEditEmail] = useState('')

  const openResolve = (id: string, action: 'approve' | 'deny') => {
    setResolveRequestId(id)
    setResolveAction(action)
    setResolveNote('')
    // Pre-fill the data-edit form with the vendor's current effective
    // profile (raw MOCK_VENDOR + prior admin overrides) so the admin
    // sees the current values and can edit in place. Deny action does
    // not use the form so the pre-fill is harmless when hidden.
    const req = changeRequests.find((r) => r.id === id)
    if (req) {
      const rawVendor = MOCK_VENDORS.find((v) => v.id === req.vendorId)
      const override = vendorProfileOverrides[req.vendorId] ?? {}
      setEditName(override.name ?? rawVendor?.name ?? '')
      setEditCompany(override.company ?? rawVendor?.company ?? '')
      setEditPhone(override.phone ?? rawVendor?.phone ?? '')
      setEditAddress(override.address ?? rawVendor?.address ?? '')
      setEditEmail(override.email ?? rawVendor?.email ?? '')
    }
    setResolveDialogOpen(true)
  }
  const submitResolve = () => {
    if (!resolveRequestId) return
    const note = resolveNote.trim() || undefined
    if (resolveAction === 'approve') {
      // Ship #172 — atomic commit: apply field edits before marking
      // the request resolved so any downstream consumer that reads the
      // request + vendor-profile together sees the matching state on
      // the very next render. Store's applyVendorProfileEdit filters
      // empty / whitespace-only fields so unchanged inputs are no-ops.
      const req = changeRequests.find((r) => r.id === resolveRequestId)
      if (req) {
        applyVendorProfileEdit(req.vendorId, {
          name: editName,
          company: editCompany,
          phone: editPhone,
          address: editAddress,
          email: editEmail,
        })
      }
      approveRequest(resolveRequestId, note)
      toast.success('Request approved + profile updated')
    } else {
      denyRequest(resolveRequestId, note)
      toast.success('Request denied')
    }
    setResolveDialogOpen(false)
  }

  const navigate = useNavigate()
  // Commission % overrides now persist in admin-moderation-store (ship #130)
  // so edits ripple to revenue/reports/overview/banking via the shared store
  // instead of being trapped in local useState.
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)
  const setVendorCommission = useAdminModerationStore((s) => s.setVendorCommission)
  const vendorProfileOverrides = useAdminModerationStore((s) => s.vendorProfileOverrides)
  const applyVendorProfileEdit = useAdminModerationStore((s) => s.applyVendorProfileEdit)
  const [suspendedVendors, setSuspendedVendors] = useState<Set<string>>(new Set())
  const [verifiedVendors, setVerifiedVendors] = useState<Set<string>>(new Set())
  const [suspendTarget, setSuspendTarget] = useState<Vendor | null>(null)
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false)
  const [messageTarget] = useState<Vendor | null>(null)
  const [messageDialogOpen, setMessageDialogOpen] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [messageSent, setMessageSent] = useState(false)

  const updateCommission = (vendorId: string, pct: number) => {
    setVendorCommission(vendorId, pct)
  }

  const handleSuspend = (vendor: Vendor) => {
    setSuspendTarget(vendor)
    setSuspendDialogOpen(true)
  }

  const confirmSuspend = () => {
    if (suspendTarget) {
      setSuspendedVendors((prev) => {
        const next = new Set(prev)
        if (next.has(suspendTarget.id)) {
          next.delete(suspendTarget.id)
        } else {
          next.add(suspendTarget.id)
        }
        return next
      })
    }
    setSuspendDialogOpen(false)
  }

  const sendMessage = () => {
    setMessageSent(true)
    setTimeout(() => setMessageDialogOpen(false), 1500)
  }

  const handleVerify = (vendorId: string) => {
    setVerifiedVendors((prev) => new Set([...prev, vendorId]))
  }

  const getVendorStatus = (vendor: Vendor) => {
    if (suspendedVendors.has(vendor.id)) return 'suspended'
    return vendor.status
  }

  const isVerified = (vendor: Vendor) => vendor.verified || verifiedVendors.has(vendor.id)

  const vendorData = useMemo(() => {
    return MOCK_VENDORS.map((rawVendor) => {
      // Ship #172 — merge per-vendor profile overrides so the admin card
      // renders the effective post-approval state after a data-edit
      // commit. Raw MOCK_VENDOR fields remain the fallback; override
      // values win when present.
      const override = vendorProfileOverrides[rawVendor.id] ?? {}
      const vendor = { ...rawVendor, ...override }
      const rawLeads = mockLeads.filter((l) => l.vendor_id === vendor.id)
      // Apply vendor-side action overrides + admin-approved cancellations so
      // the per-vendor status counts reflect the full lifecycle.
      const leads = rawLeads.map((l) => {
        const cReq = cancellationRequestsByLead[l.id]
        const cancelApproved = cReq?.status === 'approved'
        // Ship #171 — cancellation-approved now surfaces as 'cancelled'
        // rather than the reused 'rejected' bucket. Per-vendor status
        // counts differentiate cancellations from rejections for admin
        // visibility.
        const effectiveStatus = cancelApproved ? 'cancelled' : (leadStatusOverrides[l.id] ?? l.status)
        return { ...l, status: effectiveStatus as LeadStatus }
      })
      const closedSales = mockClosedSales.filter((c) => c.vendor_id === vendor.id)
      const totalRevenue = closedSales.reduce((s, c) => s + c.sale_amount, 0)

      const statusCounts = leads.reduce(
        (acc, l) => {
          acc[l.status] = (acc[l.status] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

      return { vendor, leads, closedSales, totalRevenue, statusCounts }
    })
  }, [leadStatusOverrides, cancellationRequestsByLead, vendorProfileOverrides, mockLeads, mockClosedSales])

  return (
    <div className="space-y-6">
      <PageHeader title="Vendor Management" description={`${MOCK_VENDORS.length} registered vendors`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{MOCK_VENDORS.filter((v) => v.status === 'active').length} Active</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-sm">
            <span className="font-medium text-amber-800 dark:text-amber-400">
              {MOCK_VENDORS.filter((v) => v.status === 'pending').length} Pending
            </span>
          </div>
        </div>
      </PageHeader>

      {/* Pending Change Requests (ship Phase C per kratos msg 1776719583850).
          Admin-mediated vendor profile changes — vendors submit a request
          from /vendor/profile, admin approves or denies here. Approve marks
          resolved; actual data-edit happens side-channel for v1 (Tranche-2
          adds the data-edit form). */}
      {pendingChangeRequests.length > 0 && (
        <Card className="rounded-xl border-amber-300/60 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-700/40">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                Pending Change Requests ({pendingChangeRequests.length})
              </h3>
            </div>
            <div className="space-y-2">
              {pendingChangeRequests.map((req) => (
                <div key={req.id} className="rounded-lg border bg-background p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{req.vendorCompany}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {req.vendorName} · Submitted {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 border-emerald-400/60 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                        onClick={() => openResolve(req.id, 'approve')}
                      >
                        <Check className="h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5"
                        onClick={() => openResolve(req.id, 'deny')}
                      >
                        <X className="h-3 w-3" />
                        Deny
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap rounded bg-muted/40 p-2">
                    {req.requestedChange}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {resolveAction === 'approve' ? 'Approve Change Request' : 'Deny Change Request'}
            </DialogTitle>
            <DialogDescription>
              {resolveAction === 'approve'
                ? 'Edit the vendor profile fields below and commit. Changes land atomically with the approval.'
                : 'Mark this request as denied. Vendor can re-submit if needed.'}
            </DialogDescription>
          </DialogHeader>

          {/* Show the vendor's original free-text request so the admin
              sees the context while editing. Ship #172 — alongside the
              form instead of separately, to tighten the read-edit loop. */}
          {resolveRequestId && (() => {
            const req = changeRequests.find((r) => r.id === resolveRequestId)
            if (!req) return null
            return (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                <p className="font-semibold text-foreground mb-1">
                  {req.vendorCompany} · {req.vendorName}
                </p>
                <p className="text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {req.requestedChange}
                </p>
              </div>
            )
          })()}

          {/* Ship #172 — data-edit form. Shown only on approve (deny
              doesn't edit anything). Empty-string submits are filtered
              by the store so the admin can leave untouched fields alone. */}
          {resolveAction === 'approve' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Company</label>
                <Input
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Phone</label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Email</label>
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold">Address</label>
                <Input
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold">Note to vendor (optional)</label>
            <Textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder={resolveAction === 'approve' ? 'e.g. Updated address confirmed, applied' : 'e.g. Need proof of license for address change'}
              rows={3}
              className="text-sm resize-none"
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={resolveAction === 'approve' ? 'default' : 'destructive'}
              className="w-full sm:w-auto"
              onClick={submitResolve}
            >
              {resolveAction === 'approve' ? 'Approve + Commit' : 'Deny'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {vendorData.map(({ vendor, leads, closedSales, totalRevenue, statusCounts }, i) => (
          <motion.div key={vendor.id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
            <Card className="rounded-xl shadow-sm hover:shadow-md transition flex flex-col">
              <CardContent className="p-5 flex-1 flex flex-col">
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                  <AvatarInitials initials={vendor.initials} color={vendor.avatar_color} size="lg" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-semibold text-base truncate">{vendor.company}</h3>
                    <p className="text-sm text-muted-foreground truncate">{vendor.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          getVendorStatus(vendor) === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : getVendorStatus(vendor) === 'suspended'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        )}
                      >
                        {getVendorStatus(vendor) === 'active' ? 'Active' : getVendorStatus(vendor) === 'suspended' ? 'Suspended' : 'Pending'}
                      </span>
                      {isVerified(vendor) && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-2 mb-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{vendor.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Joined{' '}
                      {new Date(vendor.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Revenue Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Closed Sales</p>
                    <p className="text-lg font-bold font-heading">{closedSales.length}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
                    <p className="text-lg font-bold font-heading">${totalRevenue.toLocaleString()}</p>
                  </div>
                </div>

                {/* Commission % */}
                <div className="flex items-center gap-2 mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-3">
                  <Percent className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Commission Fee</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={vendorCommissionOverrides[vendor.id] ?? vendor.commission_pct}
                      onChange={(e) => updateCommission(vendor.id, Number(e.target.value))}
                      className="w-16 h-8 text-center text-sm font-bold"
                    />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">%</span>
                  </div>
                </div>

                {/* Ship #270 — Non-circumvention agreement status. MOCK_VENDORS
                    fixtures don't carry signed-state today (signatures live on
                    real vendor profiles after the Phase 1 sign-flow). Surface
                    is honest: shows Not Signed for unsigned, Signed YYYY-MM-DD
                    + version for signed. View opens audit-mode dialog with
                    snapshot. Reprompt fires destructive-confirm + toast +
                    Tranche-2 marker (real cross-session enforcement waits on
                    Supabase backend wiring). */}
                {(() => {
                  const signed = vendor.noncircumvention_agreement_signed_at
                  const signedDate = signed
                    ? new Date(signed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : null
                  const version = vendor.noncircumvention_agreement_version
                  const isCurrent = version === CURRENT_AGREEMENT_VERSION
                  return (
                    <div className="flex items-center gap-2 mb-4 rounded-lg border p-3 bg-card">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">Agreement</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {signed ? (
                            <>
                              Signed {signedDate} · {version ?? '—'}
                              {!isCurrent && version && (
                                <span className="ml-1 text-amber-700 dark:text-amber-400">(stale)</span>
                              )}
                            </>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">Not signed</span>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!signed}
                        onClick={() => setAgreementViewVendor(vendor)}
                      >
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setRepromptVendor(vendor)}
                      >
                        Reprompt
                      </Button>
                    </div>
                  )
                })()}

                {/* Action Buttons */}
                <div className="flex gap-2 mb-4">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => navigate(`/admin/messages?vendor=${vendor.id}`)}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    Message
                  </Button>
                  {suspendedVendors.has(vendor.id) ? (
                    <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleSuspend(vendor)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reinstate
                    </Button>
                  ) : (
                    <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => handleSuspend(vendor)}>
                      <Ban className="h-3.5 w-3.5" />
                      Suspend
                    </Button>
                  )}
                  {!isVerified(vendor) && (
                    <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleVerify(vendor.id)}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Verify
                    </Button>
                  )}
                </div>

                {/* Lead Accordion */}
                <Accordion type="single" collapsible className="mt-auto">
                  <AccordionItem value="leads">
                    <AccordionTrigger className="text-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>Leads ({leads.length})</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {leads.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No leads yet</p>
                      ) : (
                        <>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Project</TableHead>
                                <TableHead className="text-xs">Value</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {leads.map((lead) => (
                                <TableRow key={lead.id}>
                                  <TableCell className="text-xs font-medium max-w-[140px] truncate">
                                    {lead.project}
                                  </TableCell>
                                  <TableCell className="text-xs">${lead.value.toLocaleString()}</TableCell>
                                  <TableCell>
                                    <StatusBadge status={lead.status} className="text-[10px] px-2 py-0" />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>

                          {/* Status Summary */}
                          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                            {(['pending', 'confirmed', 'rejected', 'cancelled', 'rescheduled', 'completed'] as LeadStatus[]).map(
                              (status) =>
                                statusCounts[status] ? (
                                  <StatusBadge key={status} status={status} className="text-[10px]" />
                                ) : null
                            )}
                            <span className="ml-auto text-xs text-muted-foreground font-medium">
                              {leads.length} total
                            </span>
                          </div>
                        </>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Suspend Confirmation Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {suspendTarget && suspendedVendors.has(suspendTarget.id) ? 'Reinstate Vendor' : 'Suspend Vendor'}
            </DialogTitle>
            <DialogDescription>
              {suspendTarget && suspendedVendors.has(suspendTarget.id)
                ? `Are you sure you want to reinstate ${suspendTarget?.company}? They will regain access to leads and the platform.`
                : `Are you sure you want to suspend ${suspendTarget?.company}? They will lose access to new leads and the platform until reinstated.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>Cancel</Button>
            <Button
              variant={suspendTarget && suspendedVendors.has(suspendTarget.id) ? 'default' : 'destructive'}
              onClick={confirmSuspend}
              className={suspendTarget && suspendedVendors.has(suspendTarget.id) ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
            >
              {suspendTarget && suspendedVendors.has(suspendTarget.id) ? 'Reinstate' : 'Suspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Dialog */}
      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Message {messageTarget?.company}
            </DialogTitle>
            <DialogDescription>
              Send a message to {messageTarget?.name}
            </DialogDescription>
          </DialogHeader>
          {messageSent ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Message sent!</p>
            </div>
          ) : (
            <>
              <Textarea
                placeholder="Type your message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setMessageDialogOpen(false)}>Cancel</Button>
                <Button disabled={!messageText.trim()} onClick={sendMessage} className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Ship #270 — agreement view dialog (audit-mode). Renders only
          when admin clicks View on a signed vendor; passes the vendor
          as profile so the dialog reads its snapshot fields. */}
      {agreementViewVendor && (
        <NonCircumventionAgreementDialog
          mode="view"
          open
          onOpenChange={(o) => !o && setAgreementViewVendor(null)}
          profile={agreementViewVendor}
        />
      )}

      {/* Ship #270 — reprompt confirmation. Destructive-confirm-four-
          refinement applied: names-the-break, earned-diction,
          alternative-steer (Send a message), verb-matched-cancel. */}
      <Dialog open={!!repromptVendor} onOpenChange={(o) => !o && setRepromptVendor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Force re-sign of agreement?</DialogTitle>
            <DialogDescription>
              {repromptVendor?.company} will be locked out of their portal on next login until they re-sign the current agreement. Their previously-signed audit record will remain on file. Use this when the agreement language has materially changed and prior consent no longer applies.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            If you only need to nudge a vendor without locking them out, send a message instead.
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setRepromptVendor(null)}
            >
              Keep current signature
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => {
                if (!repromptVendor) return
                // TODO Tranche-2: write reprompt-flag to vendor's
                // profile via Supabase so the gate at vendor-layout
                // sees it on next login. For Phase 1 mock-mode, this
                // is a toast + admin-record stub — real cross-session
                // enforcement waits on backend wiring.
                toast.success(
                  `Reprompt sent — ${repromptVendor.company} will see the agreement on next login.`,
                )
                setRepromptVendor(null)
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
