import { useRef } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { cn } from '@/lib/utils'

interface AvatarUploadProps {
  // Current avatar — base64 dataURL or Supabase URL. null/undefined = initials fallback.
  avatarUrl?: string
  initials: string
  color: string
  size?: 'sm' | 'md' | 'lg'
  // Called when user uploads a new image; caller persists the dataURL
  // to the appropriate profile store (useAuthStore.updateProfile or
  // vendor-profile patch).
  onChange: (dataUrl: string | null) => void
  className?: string
}

const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB

/**
 * Avatar image upload with initials fallback. Shared between homeowner
 * /profile edit + vendor /profile (vendors edit avatar directly; other
 * vendor fields are admin-mediated via Request Info Change per ship
 * Phase C). File picker accepts image/*; converts to base64 dataURL
 * on client, no server upload for v1 (Tranche-2: Supabase Storage
 * bucket + image moderation).
 *
 * Ship #115 per kratos msg 1776720328611 + extension 1776720343679.
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

  const handlePick = () => inputRef.current?.click()

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so the same file can be re-picked after a remove+add cycle
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Pick an image file (JPG, PNG, etc.)')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('Image too large — keep it under 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        onChange(result)
        toast.success('Avatar updated')
      }
    }
    reader.onerror = () => {
      toast.error('Could not read the image — try another file')
    }
    reader.readAsDataURL(file)
  }

  const handleRemove = () => {
    onChange(null)
    toast.success('Avatar removed')
  }

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <AvatarInitials
        initials={initials}
        color={color}
        size={size}
        avatarUrl={avatarUrl}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePick}
          className="gap-1.5"
        >
          <Camera className="h-3.5 w-3.5" />
          {avatarUrl ? 'Change' : 'Upload'}
        </Button>
        {avatarUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRemove}
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
