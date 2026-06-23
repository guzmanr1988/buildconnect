import { supabase } from '@/lib/supabase'

// Tranche-2 (mig 098) — Storage-backed avatar pipeline.
// Companion to the canonical homeowner-documents pattern. Single-file-per-
// user convention {user_id}/avatar.{ext}; new uploads start with
// avatar_moderation_status='pending' so the storage.objects "Authenticated
// users select approved avatars" RLS policy denies cross-user reads until
// admin approves. Own-user reads always succeed via the per-user CRUD
// policies (foldername=auth.uid).

export const BUCKET = 'avatars'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 2 * 1024 * 1024

export type AvatarModerationStatus = 'pending' | 'approved' | 'rejected'

interface UploadResult {
  storagePath: string
  status: AvatarModerationStatus
}

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

// Admin self-uploads auto-approve (Q2 align). For everyone else the row
// lands in the moderation queue at status='pending'.
export async function uploadOwnAvatar(input: {
  userId: string
  file: File
  isAdmin: boolean
}): Promise<UploadResult | null> {
  if (!ALLOWED_MIME.has(input.file.type)) {
    console.error('[avatars] mime not allowed:', input.file.type)
    return null
  }
  if (input.file.size > MAX_BYTES) {
    console.error('[avatars] file exceeds 2MB cap:', input.file.size)
    return null
  }
  const ext = extForMime(input.file.type)
  const storagePath = `${input.userId}/avatar.${ext}`
  const status: AvatarModerationStatus = input.isAdmin ? 'approved' : 'pending'

  const uploadRes = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.file, {
      contentType: input.file.type,
      upsert: true,
    })
  if (uploadRes.error) {
    console.error('[avatars] storage upload failed:', uploadRes.error.message)
    return null
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      avatar_storage_path: storagePath,
      avatar_moderation_status: status,
    })
    .eq('id', input.userId)
  if (error) {
    console.error('[avatars] profile update failed:', error.message)
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
    return null
  }
  return { storagePath, status }
}

// 60-min signed-URL TTL (kratos align). Avatars render 20+ times per
// session so the long TTL amortizes the fetch; render-priority resolver
// in useAvatarUrl handles expiry refetch.
export async function getAvatarSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60)
  if (error || !data) {
    console.error('[avatars] signed URL failed:', error?.message)
    return null
  }
  return data.signedUrl
}

interface PendingAvatarRow {
  id: string
  name: string
  email: string
  role: string
  avatar_storage_path: string
  avatar_moderation_status: AvatarModerationStatus
}

// Admin queue (task #17). Index idx_profiles_avatar_moderation_pending
// supports the partial WHERE status='pending' scan.
export async function listPendingAvatars(): Promise<PendingAvatarRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, avatar_storage_path, avatar_moderation_status')
    .eq('avatar_moderation_status', 'pending')
    .not('avatar_storage_path', 'is', null)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[avatars] list pending failed:', error.message)
    return []
  }
  return (data ?? []) as PendingAvatarRow[]
}

export async function setAvatarModerationStatus(
  userId: string,
  status: AvatarModerationStatus,
): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_moderation_status: status })
    .eq('id', userId)
  if (error) {
    console.error('[avatars] moderation status update failed:', error.message)
    return false
  }
  return true
}

// On reject, also wipe the Storage object so a re-upload starts fresh and
// the rejected bytes don't loiter. Profile row stays so admin queue can
// see the rejection history (status='rejected').
export async function rejectAvatar(userId: string, storagePath: string): Promise<boolean> {
  await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
  const { error } = await supabase
    .from('profiles')
    .update({
      avatar_moderation_status: 'rejected',
      avatar_storage_path: null,
    })
    .eq('id', userId)
  if (error) {
    console.error('[avatars] reject failed:', error.message)
    return false
  }
  return true
}
