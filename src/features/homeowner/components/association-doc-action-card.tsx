import { useRef, useState } from 'react'
import { Loader2, Upload, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import {
  useHomeownerDocsStore,
  type HomeownerDocType,
} from '@/stores/homeowner-documents-store'

// Migration 066 / task_1780797727202_066 — homeowner-side "Action needed"
// surface for the engagement-time association permit upload. Rendered on
// /home/documents (per-project ProjectBox) and on appointment-status when
// projectAssociation='yes' AND sentProject.soldAt is set AND no
// association_permit doc exists for this sent_project_id. Self-hides when
// any of those three conditions stops holding (upload lands -> last gate
// clears).
//
// Pure presentational + addDoc dispatch; the doc-exists selector + assoc
// lookup live in the parent so the same store read isn't repeated.

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
const MAX_BYTES = 25 * 1024 * 1024

interface AssociationDocActionCardProps {
  sentProjectId: string
  address: string | null
}

export function AssociationDocActionCard({
  sentProjectId,
  address,
}: AssociationDocActionCardProps) {
  const profile = useAuthStore((s) => s.profile)
  const addDoc = useHomeownerDocsStore((s) => s.addDoc)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePick = () => {
    if (uploading) return
    fileInputRef.current?.click()
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile?.id) return

    if (!ALLOWED_MIME.includes(file.type)) {
      setError('Please upload a PDF or an image (JPG, PNG, HEIC).')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That file is too large. Max size is 25 MB.')
      return
    }

    setError(null)
    setUploading(true)
    try {
      const result = await addDoc({
        homeownerId: profile.id,
        category: 'other',
        filename: file.name,
        blob: file,
        sentProjectId,
        docType: 'association_permit' as HomeownerDocType,
        address: address ?? null,
        uploadedBy: 'homeowner',
      })
      if (!result) {
        setError('Could not upload. Please try again.')
        toast.error('Could not upload association permit.')
      } else {
        toast.success('Association permit uploaded')
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-4 space-y-3"
      data-association-action-card
      data-sent-project-id={sentProjectId}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Action needed: upload your HOA / association permit form
          </h3>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
            Your contractor needs this form on file before they can start work on your project.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Button
          size="sm"
          className="gap-1.5 w-fit"
          onClick={handlePick}
          disabled={uploading}
          data-association-action-upload-button
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              Upload form
            </>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/jpeg,image/png,image/heic"
          onChange={handleFile}
          className="hidden"
        />
        {error && (
          <p className="text-xs text-red-700 dark:text-red-400" data-association-action-error>
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
