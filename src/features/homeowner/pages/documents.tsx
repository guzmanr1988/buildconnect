import { FileText, Download, Trash2, FolderOpen } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useHomeownerDocsStore } from '@/stores/homeowner-documents-store'
import { Button } from '@/components/ui/button'

export function HomeownerDocumentsPage() {
  const profile = useAuthStore((s) => s.profile)
  const { getDocsForHomeowner, removeDoc } = useHomeownerDocsStore()

  const docs = profile?.id ? getDocsForHomeowner(profile.id) : []
  const sorted = [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold font-heading text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your project submission records and signed documents.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-14 flex flex-col items-center gap-3 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No documents yet</p>
          <p className="text-xs text-muted-foreground/70 max-w-xs">
            Your project submission records will appear here automatically when you send a project to a contractor.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3"
            >
              <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.filename}</p>
                {(doc.vendorCompany || doc.serviceName) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[doc.serviceName, doc.vendorCompany].filter(Boolean).join(' · ')}
                  </p>
                )}
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
      )}
    </div>
  )
}
