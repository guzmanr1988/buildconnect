import { FileText, Download, Trash2, FolderOpen, Folder, IdCard, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useHomeownerDocsStore, type HomeownerDoc } from '@/stores/homeowner-documents-store'
import { useProjectsStore } from '@/stores/projects-store'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { uploadIdDocument, clearIdDocument } from '@/lib/upload-id-document'
import { toast } from 'sonner'

interface ProjectGroup {
  projectId: string | null
  serviceName: string
  vendorCompany: string | null
  docs: HomeownerDoc[]
}

export function HomeownerDocumentsPage() {
  const profile = useAuthStore((s) => s.profile)
  const { getDocsForHomeowner, removeDoc } = useHomeownerDocsStore()
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const [idPreviewOpen, setIdPreviewOpen] = useState(false)
  const [idBusy, setIdBusy] = useState(false)

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

  const docs = profile?.id ? getDocsForHomeowner(profile.id) : []

  const groups = useMemo<ProjectGroup[]>(() => {
    const projectsById = new Map(sentProjects.map((p) => [p.id, p]))
    const buckets = new Map<string, ProjectGroup>()

    for (const doc of docs) {
      const project = doc.project_id ? projectsById.get(doc.project_id) : undefined
      const key = project ? project.id : '__other__'
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = project
          ? {
              projectId: project.id,
              serviceName: project.item.serviceName,
              vendorCompany: project.contractor.company,
              docs: [],
            }
          : {
              projectId: null,
              serviceName: 'Other documents',
              vendorCompany: null,
              docs: [],
            }
        buckets.set(key, bucket)
      }
      bucket.docs.push(doc)
    }

    for (const bucket of buckets.values()) {
      bucket.docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }

    return Array.from(buckets.values()).sort((a, b) => {
      if (a.projectId === null) return 1
      if (b.projectId === null) return -1
      const aLatest = a.docs[0]?.createdAt ?? ''
      const bLatest = b.docs[0]?.createdAt ?? ''
      return bLatest.localeCompare(aLatest)
    })
  }, [docs, sentProjects])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold font-heading text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your project submission records and signed documents, grouped by project.
        </p>
      </div>

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
                onClick={() => setIdPreviewOpen(true)}
                className="w-16 h-16 rounded-lg overflow-hidden border shrink-0 hover:ring-2 hover:ring-primary transition cursor-pointer"
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
                        if (file) void handleIdUpload(file)
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
                    onClick={() => void handleIdRemove()}
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
                  if (file) void handleIdUpload(file)
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

      {idDocumentUrl && (
        <Dialog open={idPreviewOpen} onOpenChange={setIdPreviewOpen}>
          <DialogContent className="sm:max-w-lg p-2">
            <img src={idDocumentUrl} alt="ID Document preview" className="w-full h-auto rounded" />
          </DialogContent>
        </Dialog>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-14 flex flex-col items-center gap-3 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No project documents yet</p>
          <p className="text-xs text-muted-foreground/70 max-w-xs">
            Your project submission records will appear here automatically when you send a project to a contractor.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.projectId ?? 'other'} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">{group.serviceName}</h2>
                {group.vendorCompany && (
                  <span className="text-xs text-muted-foreground">· {group.vendorCompany}</span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {group.docs.length} {group.docs.length === 1 ? 'document' : 'documents'}
                </span>
              </div>
              <div className="space-y-2">
                {group.docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3"
                  >
                    <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(doc.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                      >
                        <a href={doc.dataUrl} download={doc.filename} title="Download">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDoc(doc.id)}
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
