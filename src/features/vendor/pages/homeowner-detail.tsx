import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MessageSquare, Mail, MapPin, Phone, Briefcase, FileText, Plus, Download, Trash2, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { EmptyState } from '@/components/shared/empty-state'
import { ProjectDetailDialog } from '@/components/shared/project-detail-dialog'
import { useVendorHomeowners } from '@/lib/hooks/use-vendor-homeowners'
import { useVendorScope, useResolvedVendor } from '@/lib/vendor-scope'
import { useProjectsStore } from '@/stores/projects-store'
import { useEffectiveMockLeads, useEffectiveMockClosedSales } from '@/lib/mock-data-effective'
import {
  useVendorHomeownerDocsStore,
  VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS,
  type VendorHomeownerDoc,
  type VendorHomeownerDocCategory,
} from '@/stores/vendor-homeowner-documents-store'

// Ship #278 — vendor-side per-homeowner detail page. Two sections:
// (1) Sold Projects — sold sentProjects for this vendor×homeowner +
//     MOCK_CLOSED_SALES bridged by lead_id → email.
// (2) Documents — vendor-uploaded permits/contracts/etc. via the
//     vendor-homeowner-documents-store (data-URL persist with
//     Tranche-2 Supabase Storage marker per banked rule).
// Per-homeowner navigation via :homeownerId URL param (URL-decoded
// email). 404 fallback if not in vendor scope.
//
// Banked principles applied:
// - useVendorHomeowners (extracted at n=2 per format-SoT-shared-helper)
// - destructive-confirm-four-refinement on Delete-doc action
// - label-as-contract: detail page is the active-tooling per-homeowner
//   surface; Sold Projects + Documents are the two operational concerns
//   vendor cares about per-homeowner

const CATEGORY_OPTIONS: VendorHomeownerDocCategory[] = [
  'driver_license',
  'permit',
  'contract',
  'quote',
  'photo',
  'other',
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function VendorHomeownerDetail() {
  const navigate = useNavigate()
  const { homeownerId: rawId } = useParams<{ homeownerId: string }>()
  const homeownerEmail = rawId ? decodeURIComponent(rawId) : ''
  const homeowners = useVendorHomeowners()
  const homeowner = homeowners.find((h) => h.email === homeownerEmail)

  const { vendorId } = useVendorScope()
  const vendor = useResolvedVendor()
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const mockLeads = useEffectiveMockLeads()
  const mockClosedSales = useEffectiveMockClosedSales()

  const docsStore = useVendorHomeownerDocsStore((s) => s.docsByVendorByHomeowner)
  const addDoc = useVendorHomeownerDocsStore((s) => s.addDoc)
  const removeDoc = useVendorHomeownerDocsStore((s) => s.removeDoc)
  const docs = useMemo(
    () => (vendor ? docsStore[vendor.id]?.[homeownerEmail] ?? [] : []),
    [docsStore, vendor, homeownerEmail],
  )

  // Upload UI state.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadCategory, setUploadCategory] = useState<VendorHomeownerDocCategory>('permit')
  const [customLabel, setCustomLabel] = useState('')
  const [pendingFilename, setPendingFilename] = useState<string | null>(null)
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<VendorHomeownerDoc | null>(null)
  // Ship #279 — Sold Projects row click opens ProjectDetailDialog (#248
  // dual-lookup pattern: sentProjects.id OR mockLeads.id resolves the
  // canonical detail view, regardless of which source the row came from).
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const soldProjects = useMemo(() => {
    if (!vendor) return []
    // (i) sold sentProjects scoped to this vendor × homeowner.
    const sold: { id: string; date: string; project: string; amount?: number; source: 'sent' | 'closed' }[] = []
    sentProjects
      .filter((sp) => {
        const vendorMatch = sp.contractor?.vendor_id
          ? sp.contractor.vendor_id === vendor.id
          : sp.contractor?.company === vendor.company
        return vendorMatch && sp.status === 'sold' && sp.homeowner?.email === homeownerEmail
      })
      .forEach((sp) => {
        sold.push({
          id: sp.id,
          date: sp.soldAt ?? sp.sentAt,
          project: sp.item.serviceName,
          amount: sp.saleAmount,
          source: 'sent',
        })
      })
    // (ii) MOCK_CLOSED_SALES scoped to this vendor + bridged via
    // lead.email match. Ship #279 — id is the lead_id (L-XXXX) so
    // ProjectDetailDialog resolves via mockLeads.find lookup path.
    // Pre-#279 stored cs.id which is the closed-sale UUID and would
    // miss both sentProjects and mockLeads lookup branches.
    mockClosedSales
      .filter((cs) => cs.vendor_id === vendorId)
      .forEach((cs) => {
        const lead = mockLeads.find((l) => l.id === cs.lead_id)
        if (!lead || lead.email !== homeownerEmail) return
        sold.push({
          id: cs.lead_id,
          date: cs.closed_at,
          project: cs.project,
          amount: cs.sale_amount,
          source: 'closed',
        })
      })
    return sold.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [vendor, vendorId, sentProjects, mockClosedSales, mockLeads, homeownerEmail])

  if (!homeowner) {
    return (
      <div className="space-y-6">
        <Link to="/vendor/homeowners" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to homeowners
        </Link>
        <EmptyState
          icon={AlertTriangle}
          title="Homeowner not in your roster"
          description="This homeowner hasn't sent you any leads or projects. They may be on another vendor's list."
        />
      </div>
    )
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingDataUrl(reader.result)
        setPendingFilename(file.name)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSubmitUpload = () => {
    if (!vendor || !pendingDataUrl || !pendingFilename) return
    if (uploadCategory === 'other' && !customLabel.trim()) {
      toast.error('Add a label for "Other" documents.')
      return
    }
    addDoc({
      vendor_id: vendor.id,
      homeowner_email: homeownerEmail,
      category: uploadCategory,
      customLabel: uploadCategory === 'other' ? customLabel.trim() : undefined,
      filename: pendingFilename,
      dataUrl: pendingDataUrl,
    })
    toast.success(`${VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS[uploadCategory]} uploaded for ${homeowner.name}.`)
    setPendingDataUrl(null)
    setPendingFilename(null)
    setCustomLabel('')
    setUploadCategory('permit')
  }

  const handleConfirmDelete = () => {
    if (!confirmDelete || !vendor) return
    removeDoc(vendor.id, homeownerEmail, confirmDelete.id)
    toast.success(`${confirmDelete.filename} removed.`)
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-6">
      <Link to="/vendor/homeowners" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to homeowners
      </Link>

      <PageHeader title={homeowner.name} description={homeowner.email} />

      {/* Header card — homeowner contact + actions */}
      <Card className="rounded-xl">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <AvatarInitials
            initials={homeowner.initials ?? homeowner.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
            color={homeowner.avatar_color ?? '#3b82f6'}
            size="lg"
          />
          <div className="flex-1 min-w-0 space-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" /><span>{homeowner.phone}</span></div>
            <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" /><span>{homeowner.address}</span></div>
            <div className="flex items-center gap-2"><Briefcase className="h-3.5 w-3.5 shrink-0" /><span>{homeowner.projectCount} {homeowner.projectCount === 1 ? 'project' : 'projects'} with you</span></div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/vendor/messages', { state: { homeownerId: homeowner.id, homeownerName: homeowner.name } })}>
              <MessageSquare className="h-3.5 w-3.5" />
              Message
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { window.location.href = `mailto:${homeowner.email}` }}>
              <Mail className="h-3.5 w-3.5" />
              Email
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Sold Projects */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h2 className="font-heading text-lg font-semibold">Sold Projects</h2>
          <span className="text-sm text-muted-foreground">({soldProjects.length})</span>
        </div>
        {soldProjects.length === 0 ? (
          <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">No sold projects yet for {homeowner.name}.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {soldProjects.map((p) => (
              <Card
                key={p.id}
                className="rounded-xl cursor-pointer hover:shadow-md transition"
                onClick={() => setSelectedProjectId(p.id)}
                data-vendor-sold-project-row={p.id}
                data-vendor-sold-project-source={p.source}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{p.project}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Sold {fmtDate(p.date)}</p>
                  </div>
                  {typeof p.amount === 'number' && p.amount > 0 && (
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">{fmtCurrency(p.amount)}</p>
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Documents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-lg font-semibold">Documents</h2>
            <span className="text-sm text-muted-foreground">({docs.length})</span>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Plus className="h-3.5 w-3.5" />
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Upload-pending picker (shown after file chosen, before submit) */}
        {pendingDataUrl && pendingFilename && (
          <Card className="rounded-xl border-primary/40">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium truncate">{pendingFilename}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Category</label>
                  <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as VendorHomeownerDocCategory)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((cat) => (
                        <SelectItem key={cat} value={cat}>{VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS[cat]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {uploadCategory === 'other' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Label</label>
                    <Input
                      placeholder="e.g. Inspection report"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      className="h-9"
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setPendingDataUrl(null); setPendingFilename(null); setCustomLabel(''); setUploadCategory('permit') }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSubmitUpload}>
                  Add to {homeowner.name}'s file
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {docs.length === 0 && !pendingDataUrl ? (
          <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">No documents yet. Upload permits, contracts, or other files for your records.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {docs.slice().reverse().map((d) => (
              <motion.div key={d.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <Card className="rounded-xl">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{d.filename}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {d.category === 'other' && d.customLabel ? d.customLabel : VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS[d.category]}
                        {' · '}
                        {fmtDate(d.uploadedAt)}
                      </p>
                    </div>
                    <a
                      href={d.dataUrl}
                      download={d.filename}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                    <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(d)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Ship #279 — full project detail via shared ProjectDetailDialog
          (#248 dual-lookup pattern: sentProjects.id OR mockLeads.id).
          Closed-sale source rows pass cs.lead_id (#279 fix) so the
          mockLeads-fallback path resolves the canonical detail view. */}
      <ProjectDetailDialog
        open={!!selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
        projectId={selectedProjectId}
      />

      {/* Destructive-confirm-four-refinement on Delete-doc */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Delete this document?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.filename} will be permanently removed from {homeowner.name}'s file. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            If you only want to replace this document with a newer version, upload the new file first; you can delete the old one after.
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setConfirmDelete(null)}>
              Keep document
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleConfirmDelete}>
              Delete document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
