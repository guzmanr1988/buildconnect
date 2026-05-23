import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MessageSquare, Mail, FileText, Plus, Download, Trash2, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { HomeownerDetailHeader } from '@/components/shared/homeowner-detail-header'
import { ProjectDetailDialog } from '@/components/shared/project-detail-dialog'
import { useVendorHomeowners } from '@/lib/hooks/use-vendor-homeowners'
import { useVendorScope, useResolvedVendor } from '@/lib/vendor-scope'
import { useProjectsStore } from '@/stores/projects-store'
import { useEffectiveMockLeads, useEffectiveMockClosedSales } from '@/lib/mock-data-effective'
import {
  uploadDocAsVendor,
  listDocsForVendorHomeowner,
  deleteDoc as deleteHomeownerDoc,
  getSignedUrl as getHomeownerDocSignedUrl,
} from '@/lib/api/homeowner-documents'
import type {
  HomeownerDoc,
  HomeownerDocType,
} from '@/stores/homeowner-documents-store'

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

// PR-331 — 9-val doc_type set (banked w/ homeowner_documents.doc_type CHECK)
const DOC_TYPE_OPTIONS: HomeownerDocType[] = [
  'license',
  'permit',
  'sketch',
  'measurement',
  'agreement',
  'contract',
  'quote',
  'photo',
  'other',
]

const DOC_TYPE_LABEL: Record<HomeownerDocType, string> = {
  license: 'License',
  permit: 'Permit',
  sketch: 'Sketch',
  measurement: 'Measurement',
  agreement: 'Agreement',
  contract: 'Contract',
  quote: 'Quote',
  photo: 'Photo',
  other: 'Other',
}

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

  // PR-331 — vendor sent_projects scoped to this homeowner; drives the
  // project-picker dropdown on upload + resolves homeowner_id (DB UUID,
  // not email — homeowner_documents.homeowner_id is uuid FK).
  const vendorSentProjectsForHomeowner = useMemo(() => {
    if (!vendor) return []
    return sentProjects.filter((sp) => {
      const vendorMatch = sp.contractor?.vendor_id
        ? sp.contractor.vendor_id === vendor.id
        : sp.contractor?.company === vendor.company
      return vendorMatch && sp.homeowner?.email === homeownerEmail
    })
  }, [vendor, sentProjects, homeownerEmail])

  const resolvedHomeownerId = useMemo(() => {
    return vendorSentProjectsForHomeowner.find((sp) => sp.homeowner_id)?.homeowner_id ?? null
  }, [vendorSentProjectsForHomeowner])

  // PR-331 — collapsed docs list reads through lib/api helper backed by
  // public.homeowner_documents. Vendor RLS gates rows (vendor_id =
  // auth.uid() OR sent_project_id IN vendor's sent_projects). Local
  // state keeps insert/delete optimistic on top of the loaded baseline.
  const [docs, setDocs] = useState<HomeownerDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)

  useEffect(() => {
    if (!vendor || !resolvedHomeownerId) {
      setDocs([])
      return
    }
    let cancelled = false
    setDocsLoading(true)
    listDocsForVendorHomeowner({ vendorId: vendor.id, homeownerId: resolvedHomeownerId })
      .then((rows) => {
        if (!cancelled) setDocs(rows)
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [vendor, resolvedHomeownerId])

  // Upload UI state — file kept as File (not data-URL) for direct Storage
  // upload; project-picker resolves sent_project_id (NULL = homeowner-level).
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadDocType, setUploadDocType] = useState<HomeownerDocType>('permit')
  const [uploadSentProjectId, setUploadSentProjectId] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<HomeownerDoc | null>(null)
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
    setPendingFile(file)
    e.target.value = ''
  }

  const handleSubmitUpload = async () => {
    if (!vendor || !pendingFile) return
    if (!resolvedHomeownerId) {
      toast.error('Cannot resolve homeowner ID. They may not have any projects with you yet.')
      return
    }
    setUploading(true)
    try {
      const inserted = await uploadDocAsVendor({
        vendorId: vendor.id,
        homeownerId: resolvedHomeownerId,
        sentProjectId: uploadSentProjectId,
        docType: uploadDocType,
        file: pendingFile,
      })
      if (!inserted) {
        toast.error('Upload failed. Please try again.')
        return
      }
      setDocs((prev) => [inserted, ...prev.filter((d) => d.id !== inserted.id)])
      toast.success(`${DOC_TYPE_LABEL[uploadDocType]} uploaded for ${homeowner.name}.`)
      setPendingFile(null)
      setUploadDocType('permit')
      setUploadSentProjectId(null)
    } catch {
      toast.error('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    try {
      const ok = await deleteHomeownerDoc(confirmDelete.id, confirmDelete.storagePath)
      if (ok) {
        setDocs((prev) => prev.filter((d) => d.id !== confirmDelete.id))
        toast.success(`${confirmDelete.filename} removed.`)
      } else {
        toast.error('Failed to delete document. Please try again.')
      }
    } catch {
      toast.error('Failed to delete document. Please try again.')
    }
    setConfirmDelete(null)
  }

  const handleDownload = async (doc: HomeownerDoc) => {
    const url = await getHomeownerDocSignedUrl(doc.storagePath)
    if (!url) {
      toast.error('Failed to generate download link.')
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.download = doc.filename
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="space-y-6">
      <Link to="/vendor/homeowners" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to homeowners
      </Link>

      <PageHeader title={homeowner.name} description={homeowner.email} />

      {/* Header card via HomeownerDetailHeader (extracted to shared
          component in #280 at n=2 consumers per banked format-SoT). */}
      <HomeownerDetailHeader
        name={homeowner.name}
        email={homeowner.email}
        phone={homeowner.phone}
        address={homeowner.address}
        avatar_color={homeowner.avatar_color}
        initials={homeowner.initials}
        projectsLabel={`${homeowner.projectCount} ${homeowner.projectCount === 1 ? 'project' : 'projects'} with you`}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/vendor/messages', { state: { homeownerId: homeowner.id, homeownerName: homeowner.name } })}>
              <MessageSquare className="h-3.5 w-3.5" />
              Message
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { window.location.href = `mailto:${homeowner.email}` }}>
              <Mail className="h-3.5 w-3.5" />
              Email
            </Button>
          </>
        }
      />


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
                      {/* Ship #291 — Rodolfo "a bit bigger" on dollar
                          amount. text-base on mobile (320px+ viewport
                          fits comfortably given content-width math:
                          256px available, $X,XXX ~70px + chevron 16px
                          = ~170px for truncating project-name) →
                          text-lg on sm+ for slightly fuller weight on
                          desktop. Mental-render-check pre-push per
                          banked helios-side responsive-render rule. */}
                      <p className="font-bold text-base sm:text-lg text-emerald-700 dark:text-emerald-400">{fmtCurrency(p.amount)}</p>
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Documents — PR-331 bidirectional view. Vendor sees
          docs they uploaded AND docs homeowner uploaded for this
          relationship (RLS-gated via vendor_id OR sent_project_id IN
          vendor's sent_projects). Upload writes to homeowner_documents
          unified table with sent_project_id linkage. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-lg font-semibold">Documents</h2>
            <span className="text-sm text-muted-foreground">({docs.length})</span>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={!resolvedHomeownerId}
            data-vendor-doc-upload-trigger
          >
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
        {pendingFile && (
          <Card className="rounded-xl border-primary/40">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium truncate">{pendingFile.name}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Project</label>
                  <Select
                    value={uploadSentProjectId ?? '__none__'}
                    onValueChange={(v) => setUploadSentProjectId(v === '__none__' ? null : v)}
                  >
                    <SelectTrigger className="h-9" data-vendor-doc-project-picker><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No project — homeowner-level doc</SelectItem>
                      {vendorSentProjectsForHomeowner.map((sp) => (
                        <SelectItem key={sp.id} value={sp.id}>
                          {sp.item.serviceName} · {fmtDate(sp.sentAt)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Document type</label>
                  <Select value={uploadDocType} onValueChange={(v) => setUploadDocType(v as HomeownerDocType)}>
                    <SelectTrigger className="h-9" data-vendor-doc-type-picker><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOC_TYPE_OPTIONS.map((dt) => (
                        <SelectItem key={dt} value={dt}>{DOC_TYPE_LABEL[dt]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPendingFile(null); setUploadDocType('permit'); setUploadSentProjectId(null) }}
                  disabled={uploading}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSubmitUpload} disabled={uploading}>
                  {uploading ? 'Uploading...' : `Add to ${homeowner.name}'s file`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {docsLoading ? (
          <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">Loading documents...</CardContent></Card>
        ) : docs.length === 0 && !pendingFile ? (
          <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">No documents yet. Upload permits, contracts, sketches, or other files. You'll also see documents the homeowner uploads for projects you're working on.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => {
              const isMine = d.vendorId === vendor?.id
              const project = d.sentProjectId
                ? vendorSentProjectsForHomeowner.find((sp) => sp.id === d.sentProjectId)
                : null
              const typeLabel = d.docType ? DOC_TYPE_LABEL[d.docType] : 'Document'
              return (
                <motion.div key={d.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  <Card className="rounded-xl" data-vendor-doc-id={d.id} data-vendor-doc-mine={isMine ? 'true' : 'false'}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{d.filename}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {typeLabel}
                          {project ? ` · ${project.item.serviceName}` : ' · Homeowner-level'}
                          {' · '}
                          {fmtDate(d.createdAt)}
                          {' · '}
                          {isMine ? 'Uploaded by you' : 'Uploaded by homeowner'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleDownload(d)}
                        data-vendor-doc-download={d.id}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </Button>
                      {isMine && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmDelete(d)}
                          data-vendor-doc-delete={d.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
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
