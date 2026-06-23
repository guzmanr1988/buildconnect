import { useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { uploadOwnAvatar, BUCKET } from '@/lib/api/avatars'

interface AvatarUploadProps {
  // Resolved avatar URL for preview — caller passes useAvatarUrl(profile).
  // null/undefined → initials fallback.
  avatarUrl?: string | null
  initials: string
  color: string
  size?: 'sm' | 'md' | 'lg'
  // Called post-upload (status='pending' or 'approved') / post-remove.
  // Storage upload + profile row update happens inside this component;
  // callers used to push base64 through updateProfile but Tranche-2
  // (mig 098) moves that ownership inside so the moderation gate is
  // never bypassed by a careless caller.
  onChange?: (next: { storagePath: string | null; status: 'pending' | 'approved' | 'rejected' | null }) => void
  className?: string
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SIZE_BYTES = 2 * 1024 * 1024

/**
 * Avatar image upload with initials fallback. Shared between homeowner
 * /profile, vendor /profile, and admin /profile.
 *
 * Tranche-2 (mig 098) — uploads land in the avatars Storage bucket at
 * {user_id}/avatar.{ext} and the profile row records avatar_storage_path
 * + avatar_moderation_status. Non-admin uploads queue at 'pending' and
 * are gated cross-user by the "Authenticated users select approved
 * avatars" RLS policy on storage.objects (FE fallback-to-initials is
 * cosmetic, RLS is the real boundary). Admin uploads auto-approve.
 */
export function AvatarUpload({
  avatarUrl,
  initials,
  color,
  size = 'lg',
  onChange,
  className,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const profile = useAuthStore((s) => s.profile)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const userId = profile?.id ?? null
  const isAdmin = profile?.role === 'admin'

  const handlePick = () => inputRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!userId) {
      toast.error('Sign in to upload an avatar')
      return
    }
    if (!ALLOWED_MIME.has(file.type)) {
      toast.error('Pick a JPG, PNG, or WebP image')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('Image too large — keep it under 2MB')
      return
    }
    setBusy(true)
    try {
      const result = await uploadOwnAvatar({ userId, file, isAdmin })
      if (!result) {
        toast.error('Upload failed — try again')
        return
      }
      await updateProfile({
        avatar_storage_path: result.storagePath,
        avatar_moderation_status: result.status,
      })
      onChange?.({ storagePath: result.storagePath, status: result.status })
      toast.success(
        result.status === 'approved'
          ? 'Avatar updated'
          : 'Avatar uploaded — pending review before it shows to others',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!userId) return
    setBusy(true)
    try {
      const path = profile?.avatar_storage_path
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined)
      }
      await updateProfile({
        avatar_storage_path: null,
        avatar_moderation_status: null,
        avatar_url: undefined,
      })
      onChange?.({ storagePath: null, status: null })
      toast.success('Avatar removed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <AvatarInitials
        initials={initials}
        color={color}
        size={size}
        avatarUrl={avatarUrl ?? undefined}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePick}
          disabled={busy}
          className="gap-1.5"
        >
          <Camera className="h-3.5 w-3.5" />
          {busy ? 'Working…' : avatarUrl ? 'Change' : 'Upload'}
        </Button>
        {avatarUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={busy}
            className="gap-1.5 text-destructive hover:bg-destructive/5 border-destructive/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
        aria-label="Upload avatar image"
      />
    </div>
  )
}
