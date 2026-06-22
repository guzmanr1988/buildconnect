import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Download, Trash2, FolderOpen, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import {
  useHomeownerDocsStore,
  type HomeownerDoc,
  type HomeownerDocType,
} from '@/stores/homeowner-documents-store'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DOC_TYPE_ORDER,
  DOC_TYPE_LABEL,
  DOC_TYPE_ICON,
  formatDocDate,
  friendlyDocTitle,
  uploaderChipForVendor,
} from '@/lib/homeowner-doc-display'

// PR-449 — Vendor-side mirror of the homeowner ProjectBox widget on
// /home/documents (documents.tsx ProjectBox L444-606). Mounted inside the
// vendor lead-inbox expanded card (lead-inbox.tsx) in the slot that the
// Permit/Financing chips row vacated. Same supabase table
// (homeowner_documents), same storage bucket (homeowner-documents), same
// path shape ({homeowner_id}/{sent_project_id}/{doc_type}/{doc_id}.<ext>).
//
// Bidirectional: vendor uploads (uploaded_by='vendor', visible to
// homeowner) + vendor downloads/views homeowner-uploaded docs scoped to
// this sent_project_id. Per-project filter on sent_project_id.
//
// RLS dependency: vendor read+write to homeowner_documents rows + storage
// objects is hephaestus's parallel-late axis (Rod-ack-gated infra-class
// change per banked feedback_rod_directive_no_outages_ever). Until RLS
// lands, the per-project fetch returns 0 rows (RLS silently filters) and
// uploads fail silently in the store. UI shows empty-state — no toast/
// error noise so staging stays clean.
//
// Self-managed local state (NOT homeowner-documents-store) so vendor rows
// don't pollute the homeowner store's docs[] array.

interface VendorProjectDocumentsPanelProps {
  sentProjectId: string | null
  homeownerId: string | null
}

export function VendorProjectDocumentsPanel({
  sentProjectId,
  homeownerId,
}: VendorProjectDocumentsPanelProps) {
  const profile = useAuthStore((s) => s.profile)
  const addDoc = useHomeownerDocsStore((s) => s.addDoc)
  const getSignedUrl = useHomeownerDocsStore((s) => s.getSignedUrl)

  const [docs, setDocs] = useState<HomeownerDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [pickerDocType, setPickerDocType] = useState<HomeownerDocType>('other')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Per-project fetch scoped by sent_project_id. RLS gates whether vendor
  // sees rows; pre-RLS this returns []. No error toast on empty/RLS-block
  // so vendor card stays quiet during the gated-rollout window.
  const loadDocs = async () => {
    if (!sentProjectId) {
      setDocs([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('homeowner_documents')
        .select('*')
        .eq('sent_project_id', sentProjectId)
        .order('created_at', { ascending: false })
      if (error) {
        // Silent on RLS-deny — pre-landing this is the expected path.
        setDocs([])
        return
      }
      const mapped: HomeownerDoc[] = (data ?? []).map((row: any) => ({
        id: row.id,
        homeownerId: row.homeowner_id,
        category: row.category,
        filename: row.filename,
        storagePath: row.storage_path,
        createdAt: row.created_at,
        project_id: row.project_id,
        sentProjectId: row.sent_project_id,
        docType: row.doc_type,
        address: row.address,
        uploadedBy: row.uploaded_by,
        vendorId: row.vendor_id,
        sizeBytes: row.size_bytes,
        mimeType: row.mime_type,
      }))
      setDocs(mapped)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDocs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentProjectId])

  const docsByType = useMemo(() => {
    const m = new Map<HomeownerDocType, HomeownerDoc[]>()
    for (const d of docs) {
      const t = (d.docType ?? 'other') as HomeownerDocType
      const arr = m.get(t) ?? []
      arr.push(d)
      m.set(t, arr)
    }
    return m
  }, [docs])

  // Resolve vendor id. profile.vendor_id is the canonical FK on vendor
  // role profiles; falls back to profile.id for stub/mock paths.
  const resolvedVendorId =
    (profile as any)?.vendor_id ?? profile?.id ?? null

  const canUpload = Boolean(sentProjectId && homeownerId)

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !canUpload || !homeownerId || uploading) return
    setUploading(true)
    try {
      const result = await addDoc({
        homeownerId,
        category: 'other',
        filename: file.name,
        blob: file,
        sentProjectId,
        docType: pickerDocType,
        uploadedBy: 'vendor',
        vendorId: resolvedVendorId ?? undefined,
      })
      if (!result) {
        // Pre-RLS this fires when storage policy denies write; keep silent
        // during staging. Switch to a toast.error post-RLS-landing.
        return
      }
      // Optimistic local prepend so the vendor sees their upload land
      // without a second roundtrip.
      setDocs((prev) => [result, ...prev])
      toast.success(`${DOC_TYPE_LABEL[pickerDocType]} uploaded`)
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (doc: HomeownerDoc) => {
    const url = await getSignedUrl(doc.storagePath)
    if (!url) {
      toast.error('Could not generate download link. Please try again.')
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.download = doc.filename
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Vendor can remove only docs they uploaded themselves. Homeowner-
  // uploaded rows are read-only on the vendor side to prevent cross-
  // tenant destructive ops (defense even with RLS — UI confirms intent).
  const handleRemove = async (doc: HomeownerDoc) => {
    if (doc.uploadedBy !== 'vendor') return
    try {
      await supabase.storage
        .from('homeowner-documents')
        .remove([doc.storagePath])
        .catch(() => undefined)
      const { error } = await supabase
        .from('homeowner_documents')
        .delete()
        .eq('id', doc.id)
      if (error) {
        toast.error('Could not remove document.')
        return
      }
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch {
      toast.error('Could not remove document.')
    }
  }

  const renderedSections = DOC_TYPE_ORDER.map((docType) => {
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
            <VendorDocRow
              key={doc.id}
              doc={doc}
              onDownload={handleDownload}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </div>
    )
  })

  const hasAny = docs.length > 0

  return (
    <div
      className="rounded-xl border bg-card p-4 space-y-3"
      data-vendor-documents-panel
      data-sent-project-id={sentProjectId ?? ''}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Project documents</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {docs.length} {docs.length === 1 ? 'document' : 'documents'}
        </span>
      </div>

      {hasAny ? (
        <div className="space-y-3">{renderedSections}</div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4 text-center" data-vendor-documents-empty>
          <FolderOpen className="h-6 w-6 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            {loading ? 'Loading documents…' : 'No documents yet'}
          </p>
        </div>
      )}

      <div className="pt-2 border-t space-y-1.5">
        <div className="flex items-center gap-2">
          <Select
            value={pickerDocType}
            onValueChange={(v) => setPickerDocType(v as HomeownerDocType)}
            disabled={!canUpload || uploading}
          >
            <SelectTrigger
              className="h-8 w-[140px] text-xs"
              data-doc-type-picker
              onClick={(e) => e.stopPropagation()}
            >
              <SelectValue />
            </SelectTrigger>
            {/* Root-cause fix for Rod-direct task_1780804150936_308:
                Base UI Select defaults to alignItemWithTrigger=true, which
                vertically centers the SELECTED item over the trigger and
                extends earlier items UPWARD — that's what visually bled
                over the Project Details card above the documents panel.
                Forcing align-to-bottom (side="bottom", alignItemWithTrigger
                =false) makes the dropdown open BELOW the trigger only,
                like a traditional dropdown, removing the upward overhang.
                Global ui/select.tsx left untouched; this is a call-site
                fix per banked dropdown-overlap-root-cause-first guardrail. */}
            <SelectContent
              alignItemWithTrigger={false}
              side="bottom"
              sideOffset={4}
              align="start"
            >
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
            onClick={(e) => {
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
            disabled={!canUpload || uploading}
            data-vendor-upload-trigger
          >
            <Plus className="h-3.5 w-3.5" />
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handlePickFile}
            disabled={!canUpload || uploading}
            className="hidden"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {!canUpload && (
          <p className="text-[11px] text-muted-foreground">
            Upload becomes available once the lead is attached to a project.
          </p>
        )}
      </div>
    </div>
  )
}

function VendorDocRow({
  doc,
  onDownload,
  onRemove,
}: {
  doc: HomeownerDoc
  onDownload: (doc: HomeownerDoc) => void
  onRemove: (doc: HomeownerDoc) => void
}) {
  const chip = uploaderChipForVendor(doc)
  const canRemove = doc.uploadedBy === 'vendor'
  return (
    <div
      data-vendor-doc-id={doc.id}
      data-doc-type={doc.docType ?? 'unknown'}
      className="flex items-start gap-2 rounded-lg border bg-background px-3 py-2"
    >
      <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {friendlyDocTitle(doc)}
        </p>
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
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation()
            onDownload(doc)
          }}
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(doc)
            }}
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
