-- 098_avatars_storage_path_and_moderation_status.sql
-- Tranche-2 (avatars) — Supabase Storage migration + per-profile moderation
-- queue. Adds two additive nullable columns on profiles plus the avatars
-- bucket + storage.objects RLS. Bucket + storage.objects policies are
-- applied via Mgmt API at ship time and captured here as comments for
-- env-replay reproducibility (same shape discipline as mig 046).
--
-- task_1776720967678_753 (helios). Kratos GO msg 1782235254563 after
-- consolidated-bundle apex-promote chain (cf_deploy e2549dcf / a63e158).
-- Q1-Q6 align msg 1782235672823 + two steers (LS-persist close + RLS-is-
-- real verbatim apollo walker probe).
--
-- ───────────────────────────────────────────────────────────────────
-- (1) profiles columns — additive nullable
-- ───────────────────────────────────────────────────────────────────
-- avatar_storage_path: pointer into avatars bucket, convention
--   '{user_id}/avatar.{ext}'. NULL means user has no Storage avatar
--   (may still have legacy base64 in avatar_url — see grandfather rule
--   below).
-- avatar_moderation_status: enum 'pending'/'approved'/'rejected'.
--   NULL is treated as the legacy-grandfather case (implicit-approved
--   for users who only have base64 avatar_url, no Storage upload yet).
--   Auto-approve on insert for role='admin' (Q2 align).
--
-- Grandfather rule (Q4 align): legacy profile.avatar_url (base64 dataURL,
-- ship #115) keeps rendering as implicitly-approved across the migration
-- window. Render priority client-side:
--   (i)  avatar_storage_path + avatar_moderation_status='approved' → signed URL
--   (ii) avatar_url legacy base64                                   → render as-is
--   (iii) AvatarInitials fallback
-- No batch-migrate of existing base64 → Storage in this ship; deferred
-- to optional follow-on per Q4 align.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_storage_path text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_moderation_status text
    CHECK (avatar_moderation_status IS NULL
        OR avatar_moderation_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.profiles.avatar_storage_path IS
  'Pointer into avatars Storage bucket ({user_id}/avatar.{ext}). NULL when '
  'no Storage avatar present (user may still have legacy base64 in avatar_url).';

COMMENT ON COLUMN public.profiles.avatar_moderation_status IS
  'Moderation queue state for Storage-backed avatar: pending/approved/rejected. '
  'NULL = legacy avatar_url (implicit-approved grandfather). Tranche-2.';

CREATE INDEX IF NOT EXISTS idx_profiles_avatar_moderation_pending
  ON public.profiles (avatar_moderation_status)
  WHERE avatar_moderation_status = 'pending';

COMMIT;

-- ───────────────────────────────────────────────────────────────────
-- (2) Storage bucket + RLS — applied via Mgmt API at ship time.
-- ───────────────────────────────────────────────────────────────────
-- Captured here for reproducibility on env re-applies; bucket + policies
-- are also live on apex post-ship.
--
-- BUCKET:
--   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
--     values ('avatars', 'avatars', false, 2097152,
--             array['image/jpeg', 'image/png', 'image/webp']);
--   -- public=false → signed-URL only (kratos steer 1 PII-adjacency).
--   -- 2MB cap mirrors AvatarUpload v1 client ceiling (consistent UX).
--   -- MIME allow-list strictest image set (no GIF/SVG/HEIC).
--
-- STORAGE.OBJECTS POLICIES (path convention: '{user_id}/avatar.{ext}'):
--
--   - "Users select own avatar"
--       bucket_id = 'avatars' AND
--       (storage.foldername(name))[1] = auth.uid()::text
--
--   - "Users insert own avatar" (WITH CHECK)
--       bucket_id = 'avatars' AND
--       (storage.foldername(name))[1] = auth.uid()::text
--
--   - "Users update own avatar"
--       bucket_id = 'avatars' AND
--       (storage.foldername(name))[1] = auth.uid()::text
--
--   - "Users delete own avatar"
--       bucket_id = 'avatars' AND
--       (storage.foldername(name))[1] = auth.uid()::text
--
--   - "Authenticated users select approved avatars" (LOAD-BEARING moderation gate)
--       bucket_id = 'avatars' AND EXISTS (
--         SELECT 1 FROM public.profiles p
--         WHERE p.id::text = (storage.foldername(name))[1]
--           AND p.avatar_moderation_status = 'approved'
--       )
--       -- Cross-user render path. RLS denies pending/rejected reads at API
--       -- layer — the FE fallback-to-initials is COSMETIC, this RLS is the
--       -- real moderation boundary. Kratos steer 2: apollo walker MUST
--       -- probe with second user JWT to verify denial, NOT just check FE.
--
--   - "Admins manage all avatars"
--       bucket_id = 'avatars' AND EXISTS (
--         SELECT 1 FROM public.profiles p
--         WHERE p.id = auth.uid() AND p.role = 'admin'
--       )
--       -- Admin queue can SELECT/UPDATE/DELETE for review. v1 role='admin'
--       -- only, not admin_employee (Q1 align).
--
-- Rollback (rare, additive):
--   ALTER TABLE public.profiles
--     DROP COLUMN avatar_moderation_status,
--     DROP COLUMN avatar_storage_path;
--   -- Bucket drop separately if needed:
--   --   delete from storage.objects where bucket_id='avatars';
--   --   delete from storage.buckets where id='avatars';
