-- 065_vendor_storage_select_leg_for_assigned_projects.sql
-- Storage SELECT RLS asymmetry fix on the homeowner-documents bucket.
--
-- The migration 064 ship added the table-level "Vendors SELECT documents on
-- assigned projects" policy that grants vendors read on homeowner_documents
-- rows whose sent_project_id belongs to one of their sent_projects. The
-- storage.objects layer had the corresponding INSERT/UPDATE/DELETE policies
-- for vendors on assigned projects, but the storage SELECT policy
-- ("Vendors select assigned homeowner documents storage") was the lone
-- asymmetric leg — it only granted access when `hd.vendor_id = auth.uid()`
-- (i.e. vendor's own uploads). Vendors could see the homeowner-uploaded
-- association doc row + Download button render in the lead-inbox panel
-- (vendor-project-documents-panel.tsx) but createSignedUrl returned null
-- because storage RLS denied the read on the underlying object.
--
-- Rod-directive: "the vendor can SEE it AND DOWNLOAD it on the Documents…
-- to execute the Association liability." This migration closes the gap by
-- adding the matching sent_project_id-via-sent_projects.vendor_id OR-leg
-- to the storage SELECT policy, bringing it in line with the other three
-- storage policies for the same role.
--
-- Applied first via Supabase Mgmt API SQL endpoint (atomic BEGIN/COMMIT)
-- post-promote of the migration 064 bundle (apex byte-lock GREEN at apex
-- bundle index-1uMUbpG5.js md5 54becfbca630bd44be6206e6b2e19902). This
-- file is checked in for env-replay reproducibility.

BEGIN;

DROP POLICY IF EXISTS "Vendors select assigned homeowner documents storage" ON storage.objects;

CREATE POLICY "Vendors select assigned homeowner documents storage" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'homeowner-documents' AND (
    EXISTS (
      SELECT 1 FROM homeowner_documents hd
      WHERE hd.storage_path = objects.name AND hd.vendor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM homeowner_documents hd
      JOIN sent_projects sp ON sp.id = hd.sent_project_id
      WHERE hd.storage_path = objects.name AND sp.vendor_id = auth.uid()
    )
  )
);

COMMIT;
