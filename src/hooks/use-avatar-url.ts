import { useEffect, useState } from 'react'
import { getAvatarSignedUrl } from '@/lib/api/avatars'
import type { Profile } from '@/types'

// Tranche-2 (mig 098) render-priority resolver. Returns the URL string
// that AvatarInitials should pass as `avatarUrl`. Render priority:
//   (i)  Storage-backed approved → signed URL (60min cache below)
//   (ii) Legacy base64 dataURL (avatar_url) → return as-is (grandfather)
//   (iii) Storage-backed pending/rejected on OWN profile → still own-user
//        signed URL (own-avatar RLS allows pending reads for the owner;
//        only cross-user reads need moderation gate)
//   (iv) Otherwise null → caller falls back to AvatarInitials initials path
//
// Cross-user moderation is enforced at the storage.objects RLS layer, not
// here — the FE never needs to "know" about moderation state for other
// users' avatars; the signed-URL fetch simply 403s and we render initials.
// The viewerId param exists only to switch between own/cross resolution.

interface CacheEntry {
  url: string
  expiresAt: number
}

const SIGNED_TTL_MS = 60 * 60 * 1000
const REFRESH_MARGIN_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

function readCache(storagePath: string): string | null {
  const entry = cache.get(storagePath)
  if (!entry) return null
  if (Date.now() > entry.expiresAt - REFRESH_MARGIN_MS) {
    cache.delete(storagePath)
    return null
  }
  return entry.url
}

function writeCache(storagePath: string, url: string) {
  cache.set(storagePath, { url, expiresAt: Date.now() + SIGNED_TTL_MS })
}

export interface AvatarSource {
  avatar_url?: string | null
  avatar_storage_path?: string | null
  avatar_moderation_status?: 'pending' | 'approved' | 'rejected' | null
  id?: string
}

export function useAvatarUrl(source: AvatarSource | null | undefined, viewerId?: string | null) {
  const storagePath = source?.avatar_storage_path ?? null
  const status = source?.avatar_moderation_status ?? null
  const legacy = source?.avatar_url ?? null
  const ownerId = source?.id ?? null
  const isOwner = !!ownerId && !!viewerId && ownerId === viewerId

  // Cross-user RLS only allows reads on status='approved'. Own-user RLS
  // allows reads regardless of status (per per-user CRUD policies).
  const shouldFetchSigned = !!storagePath && (isOwner || status === 'approved')

  const [signedUrl, setSignedUrl] = useState<string | null>(() =>
    shouldFetchSigned && storagePath ? readCache(storagePath) : null,
  )

  useEffect(() => {
    if (!shouldFetchSigned || !storagePath) {
      setSignedUrl(null)
      return
    }
    const cached = readCache(storagePath)
    if (cached) {
      setSignedUrl(cached)
      return
    }
    let cancelled = false
    void getAvatarSignedUrl(storagePath).then((url) => {
      if (cancelled || !url) return
      writeCache(storagePath, url)
      setSignedUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [storagePath, shouldFetchSigned])

  if (signedUrl) return signedUrl
  if (legacy) return legacy
  return null
}

// Convenience wrapper for components that pass a full Profile.
export function useProfileAvatarUrl(profile: Profile | null | undefined, viewerId?: string | null) {
  return useAvatarUrl(profile ?? null, viewerId)
}
