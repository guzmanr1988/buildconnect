import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, X, ShieldCheck, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import {
  listPendingAvatars,
  setAvatarModerationStatus,
  rejectAvatar,
  getAvatarSignedUrl,
} from '@/lib/api/avatars'

// Tranche-2 (mig 098) — admin avatar moderation queue. Pulls all
// profiles.avatar_moderation_status='pending' rows (partial index
// idx_profiles_avatar_moderation_pending supports the scan). Admin
// previews each pending avatar via signed URL (admin RLS bypasses the
// approved-only cross-user gate) and Approves or Rejects.

interface PendingRow {
  id: string
  name: string
  email: string
  role: string
  avatar_storage_path: string
  avatar_moderation_status: 'pending' | 'approved' | 'rejected'
}

export default function AdminModerationPage() {
  const [rows, setRows] = useState<PendingRow[]>([])
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const list = await listPendingAvatars()
    setRows(list as PendingRow[])
    setLoading(false)
    const urlPairs = await Promise.all(
      list.map(async (r) => {
        const url = await getAvatarSignedUrl(r.avatar_storage_path)
        return [r.id, url] as const
      }),
    )
    const next: Record<string, string> = {}
    for (const [id, url] of urlPairs) {
      if (url) next[id] = url
    }
    setPreviewUrls(next)
  }

  useEffect(() => {
    void load()
  }, [])

  const handleApprove = async (row: PendingRow) => {
    setActingId(row.id)
    const ok = await setAvatarModerationStatus(row.id, 'approved')
    setActingId(null)
    if (ok) {
      toast.success(`Approved ${row.name}'s avatar`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } else {
      toast.error('Approve failed — try again')
    }
  }

  const handleReject = async (row: PendingRow) => {
    setActingId(row.id)
    const ok = await rejectAvatar(row.id, row.avatar_storage_path)
    setActingId(null)
    if (ok) {
      toast.success(`Rejected ${row.name}'s avatar`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } else {
      toast.error('Reject failed — try again')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <PageHeader title="Avatar Moderation" description="Review and approve user-uploaded avatars before they show across the platform.">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1">
            <ShieldCheck className="h-3 w-3" />
            {rows.length} pending
          </Badge>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh
          </Button>
        </div>
      </PageHeader>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No pending avatars. Queue is clear.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((row) => (
            <Card key={row.id} className="rounded-xl shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-center">
                  <AvatarInitials
                    initials={(row.name?.[0] ?? '?').toUpperCase()}
                    color="#6b7280"
                    size="lg"
                    avatarUrl={previewUrls[row.id]}
                  />
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm truncate">{row.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{row.email}</div>
                  <Badge variant="secondary" className="text-[10px] capitalize mt-1">
                    {row.role}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(row)}
                    disabled={actingId === row.id}
                    className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(row)}
                    disabled={actingId === row.id}
                    className="flex-1 gap-1.5 text-destructive hover:bg-destructive/5 border-destructive/30"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  )
}
