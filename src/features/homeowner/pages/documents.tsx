import {
  FileText,
  Download,
  Trash2,
  FolderOpen,
  Folder,
  IdCard,
  Plus,
  MapPin,
  User2,
  Loader2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import {
  useHomeownerDocsStore,
  type HomeownerDoc,
  type HomeownerDocType,
} from '@/stores/homeowner-documents-store'
import {
  DOC_TYPE_ORDER,
  DOC_TYPE_LABEL,
  DOC_TYPE_ICON,
  formatDocDate,
  friendlyDocTitle,
  uploaderChip,
} from '@/lib/homeowner-doc-display'
import { useProjectsStore } from '@/stores/projects-store'
import { AssociationDocActionCard } from '@/features/homeowner/components/association-doc-action-card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { uploadIdDocument, clearIdDocument } from '@/lib/upload-id-document'
import { toast } from 'sonner'

// PR-331 — Documents page reorg per Rod photo 318 caption:
//   "organized this in boxes of the projects with the documents like
//    licence, permit, sketch and other documents not like this is a mess"
// + followups "by project and contractor" + bidirectional vendor↔homeowner.
//
// Layout:
//   1. Photo ID (top-level identity-gate, unchanged from PR-242)
//   2. One box per sent_project (project + contractor pairing) with body
//      organized by doc_type and an Upload CTA per box (doc_type picker)
//   3. "Customer documents" cross-project box for vendor-uploaded
//      homeowner-level docs that carry NULL sent_project_id.

interface SentProjectGroup {
  sentProjectId: string | null
  serviceName: string
  vendorCompany: string | null
  address: string | null
  sentAt: string | null
  status: string | null
  docs: HomeownerDoc[]
  // Migration 066 / task_066 — drive the engagement-time association-doc
  // action card. Action card renders when projectAssociation='yes' AND
  // engaged (soldAt set) AND no association_permit doc on this project.
  projectAssociation: 'yes' | 'no' | undefined
  soldAt: string | null
}

export function HomeownerDocumentsPage() {
  const profile = useAuthStore((s) => s.profile)
  const docs = useHomeownerDocsStore((s) => s.docs)
  const loadDocs = useHomeownerDocsStore((s) => s.loadDocs)
  const removeDoc = useHomeownerDocsStore((s) => s.removeDoc)
  const addDoc = useHomeownerDocsStore((s) => s.addDoc)
  const getSignedUrl = useHomeownerDocsStore((s) => s.getSignedUrl)
  const initializedFor = useHomeownerDocsStore((s) => s.initializedFor)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const [idPreviewOpen, setIdPreviewOpen] = useState(false)
  const [idBusy, setIdBusy] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<HomeownerDoc | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (profile?.id && initializedFor !== profile.id) {
      void loadDocs(profile.id)
    }
  }, [profile?.id, initializedFor, loadDocs])

  const idDocumentUrl = profile?.id_document_url
  const handleIdUpload = async (file: File) => {
    if (idBusy) return
    setIdBusy(true)
    try {
      await uploadIdDocument(file)
    } catch {
      toast.error('Could not upload ID. Please try again.')
    } finally {
      setIdBusy(false)
    }
  }
  const handleIdRemove = async () => {
    if (idBusy) return
    setIdBusy(true)
    try {
      await clearIdDocument()
    } catch {
      toast.error('Could not remove ID. Please try again.')
    } finally {
      setIdBusy(false)
    }
  }

  const myDocs = useMemo(
    () => (profile?.id ? docs.filter((d) => d.homeownerId === profile.id) : []),
    [docs, profile?.id],
  )

  const resolveAnchor = (doc: HomeownerDoc): string | null => {
    return doc.sentProjectId ?? doc.project_id ?? null
  }

  const projectGroups = useMemo<SentProjectGroup[]>(() => {
    const projectsById = new Map(sentProjects.map((p) => [p.id, p]))
    // Arc-15 d2 — vendorId → company reverse-lookup from sentProjects.
    // Used to attribute NULL-bucket docs (no resolvable sent_project) to
    // their vendor when doc.vendorId is set. Same vendor across multiple
    // NULL-bucket docs → one box per vendor; docs without vendorId are
    // omitted (no Unattributed catch-all).
    const vendorCompanyById = new Map<string, string>()
    for (const sp of sentProjects) {
      const vid = sp.contractor?.vendor_id ?? sp.vendor_id
      const company = sp.contractor?.company
      if (vid && company && !vendorCompanyById.has(vid)) {
        vendorCompanyById.set(vid, company)
      }
    }

    const buckets = new Map<string, SentProjectGroup>()
    const VENDOR_BUCKET_PREFIX = '__vendor__'

    for (const doc of myDocs) {
      const anchor = resolveAnchor(doc)
      const project = anchor ? projectsById.get(anchor) : undefined
      if (project) {
        const key = project.id
        let bucket = buckets.get(key)
        if (!bucket) {
          bucket = {
            sentProjectId: project.id,
            serviceName: project.item.serviceName,
            vendorCompany: project.contractor.company ?? null,
            address:
              project.homeowner?.address ?? doc.address ?? null,
            sentAt: project.sentAt ?? null,
            status: project.status ?? null,
            docs: [],
            projectAssociation: project.projectAssociation,
            soldAt: project.soldAt ?? null,
          }
          buckets.set(key, bucket)
        }
        bucket.docs.push(doc)
        continue
      }
      // Arc-15 d2 — NULL-bucket split-by-vendorId. Docs without a
      // resolvable sent_project are grouped per vendor so each vendor's
      // homeowner-level uploads land in their own box matching Rod's
      // "separate boxes" intent. Docs with no vendorId are omitted from
      // render (data-integrity issue surfaced backend-side, not here).
      if (!doc.vendorId) continue
      const key = `${VENDOR_BUCKET_PREFIX}${doc.vendorId}`
      let bucket = buckets.get(key)
      if (!bucket) {
        const vendorCompany = vendorCompanyById.get(doc.vendorId) ?? null
        bucket = {
          sentProjectId: null,
          serviceName: vendorCompany
            ? `Customer documents — ${vendorCompany}`
            : 'Customer documents',
          vendorCompany,
          address: doc.address ?? null,
          sentAt: null,
          status: null,
          docs: [],
          projectAssociation: undefined,
          soldAt: null,
        }
        buckets.set(key, bucket)
      }
      bucket.docs.push(doc)
    }

    // task_066 — seed an empty bucket for engaged + association=YES
    // projects so the Action-needed card appears even when the homeowner
    // has no other docs uploaded yet (otherwise the doc-walk above
    // wouldn't create the box).
    for (const sp of sentProjects) {
      if (sp.projectAssociation !== 'yes') continue
      if (!sp.soldAt) continue
      if (buckets.has(sp.id)) continue
      buckets.set(sp.id, {
        sentProjectId: sp.id,
        serviceName: sp.item.serviceName,
        vendorCompany: sp.contractor.company ?? null,
        address: sp.homeowner?.address ?? null,
        sentAt: sp.sentAt ?? null,
        status: sp.status ?? null,
        docs: [],
        projectAssociation: sp.projectAssociation,
        soldAt: sp.soldAt ?? null,
      })
    }

    for (const bucket of buckets.values()) {
      bucket.docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }

    return Array.from(buckets.values()).sort((a, b) => {
      if (a.sentProjectId === null && b.sentProjectId !== null) return 1
      if (b.sentProjectId === null && a.sentProjectId !== null) return -1
      const aLatest = a.sentAt ?? a.docs[0]?.createdAt ?? ''
      const bLatest = b.sentAt ?? b.docs[0]?.createdAt ?? ''
      return bLatest.localeCompare(aLatest)
    })
  }, [myDocs, sentProjects])

  const handleDocPreview = async (doc: HomeownerDoc) => {
    setPreviewDoc(doc)
    setPreviewUrl(null)
    setPreviewLoading(true)
    const url = await getSignedUrl(doc.storagePath)
    setPreviewLoading(false)
    if (!url) {
      setPreviewDoc(null)
      toast.error('Could not load document. Please try again.')
      return
    }
    setPreviewUrl(url)
  }

  const handlePreviewOpenChange = (open: boolean) => {
    if (!open) {
      setPreviewDoc(null)
      setPreviewUrl(null)
      setPreviewLoading(false)
    }
  }

  const handleRemove = (id: string) => {
    void removeDoc(id)
  }

  const handleUploadToBox = async (
    group: SentProjectGroup,
    docType: HomeownerDocType,
    file: File,
  ) => {
    if (!profile?.id) return
    const result = await addDoc({
      homeownerId: profile.id,
      category: 'other',
      filename: file.name,
      blob: file,
      sentProjectId: group.sentProjectId,
      docType,
      address: group.address ?? null,
      uploadedBy: 'homeowner',
    })
    if (!result) {
      toast.error('Could not upload document. Please try again.')
      return
    }
    toast.success(`${DOC_TYPE_LABEL[docType]} added`)
  }

  const hasAnyDocs = projectGroups.length > 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold font-heading text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your project records and signed documents, organized by project and contractor.
        </p>
      </div>

      <PhotoIdSection
        idDocumentUrl={idDocumentUrl}
        idBusy={idBusy}
        onUpload={handleIdUpload}
        onRemove={handleIdRemove}
        onPreviewOpen={() => setIdPreviewOpen(true)}
      />

      {idDocumentUrl && (
        <Dialog open={idPreviewOpen} onOpenChange={setIdPreviewOpen}>
          <DialogContent className="sm:max-w-lg p-2">
            <img src={idDocumentUrl} alt="ID Document preview" className="w-full h-auto rounded" />
          </DialogContent>
        </Dialog>
      )}

      {!hasAnyDocs ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-14 flex flex-col items-center gap-3 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No project documents yet</p>
          <p className="text-xs text-muted-foreground/70 max-w-xs">
            Project records will appear here automatically when you send a project to a contractor.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {projectGroups.map((group) => (
            <ProjectBox
              key={group.sentProjectId ?? '__customer__'}
              group={group}
              onPreview={handleDocPreview}
              onRemove={handleRemove}
              onUpload={handleUploadToBox}
            />
          ))}
        </div>
      )}

      <DocPreviewDialog
        doc={previewDoc}
        url={previewUrl}
        loading={previewLoading}
        onOpenChange={handlePreviewOpenChange}
      />
    </div>
  )
}

function DocPreviewDialog({
  doc,
  url,
  loading,
  onOpenChange,
}: {
  doc: HomeownerDoc | null
  url: string | null
  loading: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!doc) return null
  const filename = doc.filename || friendlyDocTitle(doc)
  const isPdf =
    doc.mimeType === 'application/pdf' || /\.pdf(\?|$)/i.test(filename)
  const isImage =
    doc.mimeType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|heic|avif|svg)(\?|$)/i.test(filename)
  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl p-3 gap-3"
        data-testid="doc-preview-modal"
      >
        <div className="pr-8">
          <p
            className="text-sm font-semibold text-foreground truncate"
            data-testid="doc-preview-title"
          >
            {friendlyDocTitle(doc)}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/20 overflow-hidden flex items-center justify-center min-h-[40vh]">
          {loading || !url ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">Loading preview…</span>
            </div>
          ) : isPdf ? (
            <iframe
              src={url}
              title={filename}
              className="w-full h-[70vh] bg-white"
              data-testid="doc-preview-iframe"
            />
          ) : isImage ? (
            <img
              src={url}
              alt={filename}
              className="max-h-[70vh] w-auto object-contain"
              data-testid="doc-preview-image"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground text-center px-6">
              <FileText className="h-8 w-8 text-muted-foreground/60" />
              <p className="text-xs">
                Preview not available for this file type. Use Download below to
                open it.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          {url && (
            <a
              href={url}
              download={filename}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
              data-testid="doc-preview-download"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PhotoIdSection({
  idDocumentUrl,
  idBusy,
  onUpload,
  onRemove,
  onPreviewOpen,
}: {
  idDocumentUrl?: string | null
  idBusy: boolean
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
  onPreviewOpen: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <IdCard className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Photo ID</h2>
        <span className="text-destructive text-xs">*Required</span>
      </div>
      <div className="rounded-xl border bg-card p-4">
        {idDocumentUrl ? (
          <div className="flex flex-row items-start gap-3">
            <button
              type="button"
              onClick={onPreviewOpen}
              className="w-16 h-16 md:w-40 md:h-40 lg:w-48 lg:h-48 rounded-lg overflow-hidden border shrink-0 hover:ring-2 hover:ring-primary transition cursor-pointer"
            >
              <img src={idDocumentUrl} alt="ID Document" className="w-full h-full object-cover" />
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">ID on file</p>
                <p className="text-xs text-muted-foreground">Click image to preview</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="cursor-pointer inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition w-full sm:w-auto">
                  Replace
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    disabled={idBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void onUpload(file)
                      e.target.value = ''
                    }}
                    className="hidden"
                  />
                </label>
                <a
                  href={idDocumentUrl}
                  download="id-document"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition w-full sm:w-auto"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => void onRemove()}
                  disabled={idBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-muted transition w-full sm:w-auto disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 py-4 rounded-lg border-2 border-dashed border-muted-foreground/30 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition">
            <Plus className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground font-medium">Upload ID Document</span>
            <input
              type="file"
              accept="image/*,.pdf"
              disabled={idBusy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onUpload(file)
                e.target.value = ''
              }}
              className="hidden"
            />
          </label>
        )}
        <p className="text-[10px] text-muted-foreground leading-relaxed mt-3">
          A valid photo ID is required before you can send a project to a contractor. It's used to verify your identity and for any paperwork tied to your project. Your information is kept secure and confidential.
        </p>
      </div>
    </div>
  )
}

function ProjectBox({
  group,
  onPreview,
  onRemove,
  onUpload,
}: {
  group: SentProjectGroup
  onPreview: (doc: HomeownerDoc) => void
  onRemove: (id: string) => void
  onUpload: (group: SentProjectGroup, docType: HomeownerDocType, file: File) => Promise<void>
}) {
  const [pickerDocType, setPickerDocType] = useState<HomeownerDocType>('other')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const docsByType = useMemo(() => {
    const m = new Map<HomeownerDocType, HomeownerDoc[]>()
    for (const d of group.docs) {
      const t = (d.docType ?? 'other') as HomeownerDocType
      const arr = m.get(t) ?? []
      arr.push(d)
      m.set(t, arr)
    }
    return m
  }, [group.docs])

  // Arc-18 — Upload gate per Rod photo 323: "only add documents if project
  // is assigned to a vendor and scheduled". status IN (approved, sold) is the
  // canonical "scheduled" axis — booking.{date,time} exists from intake but is
  // only LOCKED-IN at vendor-approval. NULL-bucket boxes have no project so
  // they're always gate-blocked.
  const uploadGate: {
    allowed: boolean
    reason: 'no-project' | 'not-scheduled' | 'inactive' | 'allowed'
  } = !group.sentProjectId || !group.vendorCompany
    ? { allowed: false, reason: 'no-project' }
    : group.status === 'pending'
      ? { allowed: false, reason: 'not-scheduled' }
      : group.status === 'approved' || group.status === 'sold'
        ? { allowed: true, reason: 'allowed' }
        : { allowed: false, reason: 'inactive' }

  const helperText: Record<typeof uploadGate.reason, string> = {
    'no-project': 'Documents must be attached to a project',
    'not-scheduled':
      'Upload becomes available once your contractor confirms the appointment',
    inactive: 'This project is no longer active',
    allowed: '',
  }

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uploadGate.allowed) return
    void onUpload(group, pickerDocType, file)
  }

  // task_066 — engagement-time association-doc action card. Renders only
  // when projectAssociation='yes' AND project is engaged (soldAt set) AND
  // no association_permit doc is on file for this sent_project. Self-
  // hides when any condition stops holding (upload lands -> last gate
  // clears via the docs selector below).
  const hasAssociationDoc = group.docs.some(
    (d) => d.docType === 'association_permit',
  )
  const showAssociationActionCard =
    !!group.sentProjectId
    && group.projectAssociation === 'yes'
    && !!group.soldAt
    && !hasAssociationDoc

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3" data-sent-project-id={group.sentProjectId ?? 'customer'}>
      {showAssociationActionCard && group.sentProjectId && (
        <AssociationDocActionCard
          sentProjectId={group.sentProjectId}
          address={group.address}
        />
      )}
      <div className="flex items-start gap-2">
        <Folder className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">{group.serviceName}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            {group.vendorCompany && (
              <span className="inline-flex items-center gap-1">
                <User2 className="h-3 w-3" />
                {group.vendorCompany}
              </span>
            )}
            {group.address && (
              <span className="inline-flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3" />
                {group.address}
              </span>
            )}
            {group.sentAt && <span>· Sent {formatDocDate(group.sentAt)}</span>}
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {group.docs.length} {group.docs.length === 1 ? 'document' : 'documents'}
        </span>
      </div>

      <div className="space-y-3">
        {DOC_TYPE_ORDER.map((docType) => {
          const docsOfType = docsByType.get(docType) ?? []
          if (docsOfType.length === 0) return null
          const Icon = DOC_TYPE_ICON[docType]
          return (
            <div key={docType} className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <span>{DOC_TYPE_LABEL[docType]}</span>
                <span className="text-muted-foreground/60">·</span>
                <span>{docsOfType.length}</span>
              </div>
              <div className="space-y-1.5 pl-5">
                {docsOfType.map((doc) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    onPreview={onPreview}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="pt-2 border-t space-y-1.5">
        <div className="flex items-center gap-2">
          <Select
            value={pickerDocType}
            onValueChange={(v) => setPickerDocType(v as HomeownerDocType)}
            disabled={!uploadGate.allowed}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs" data-doc-type-picker>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPE_ORDER.map((t) => (
                <SelectItem key={t} value={t}>
                  {DOC_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={!uploadGate.allowed}
            data-upload-trigger
            data-upload-gated={!uploadGate.allowed}
            data-gate-reason={uploadGate.reason}
          >
            <Plus className="h-3.5 w-3.5" />
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handlePickFile}
            disabled={!uploadGate.allowed}
            className="hidden"
          />
        </div>
        {!uploadGate.allowed && (
          <p
            className="text-[11px] text-muted-foreground"
            data-testid="upload-gated-helper"
          >
            {helperText[uploadGate.reason]}
          </p>
        )}
      </div>
    </div>
  )
}

function DocRow({
  doc,
  onPreview,
  onRemove,
}: {
  doc: HomeownerDoc
  onPreview: (doc: HomeownerDoc) => void
  onRemove: (id: string) => void
}) {
  const chip = uploaderChip(doc)
  return (
    <div
      data-doc-id={doc.id}
      data-doc-type={doc.docType ?? 'unknown'}
      role="button"
      tabIndex={0}
      onClick={() => onPreview(doc)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPreview(doc)
        }
      }}
      className="flex items-start gap-2 rounded-lg border bg-background px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-doc-open-trigger
    >
      <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{friendlyDocTitle(doc)}</p>
        <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground mt-0.5">
          <span>{formatDocDate(doc.createdAt)}</span>
          {chip && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>{chip}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(doc.id)
          }}
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
