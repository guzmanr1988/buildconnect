-- 091_vendor_storage_insert_path_derived_predicate.sql
-- Storage INSERT RLS deadlock fix on the homeowner-documents bucket for
-- vendor uploads (contract PDFs from Mark-as-Sold / Revise-Contract flows).
--
-- task_1781111507289_178 — apollo found at pin-19 (6 days old, severity
-- medium). Symptom: vendor uploadDocAsVendor() in src/lib/api/homeowner-
-- documents.ts silently 403'd on supabase.storage.from(BUCKET).upload(...),
-- so no contract PDF landed in storage AND no homeowner_documents row was
-- written (the row-insert is gated on storage success). Homeowner /documents
-- never showed the contract; vendor lead-workflow.tsx swallowed the failure
-- to a console.error.
--
-- ROOT CAUSE: the live "Vendors INSERT homeowner-doc storage on assigned
-- projects" policy was a chicken-and-egg deadlock. Its WITH CHECK was:
--   bucket_id = 'homeowner-documents' AND EXISTS (
--     SELECT 1 FROM homeowner_documents hd
--     JOIN sent_projects sp ON sp.id = hd.sent_project_id
--     WHERE hd.storage_path = objects.name AND sp.vendor_id = auth.uid()
--   )
-- That predicate requires a homeowner_documents row to ALREADY exist with
-- storage_path = the file being uploaded — but the client uploads storage
-- FIRST, then inserts the row. The row never gets a chance to land because
-- the storage upload it depends on is denied first. Effectively a deny-all
-- for vendor INSERTs.
--
-- FIX: derive vendor authorization from the storage path itself instead of
-- a pre-existing row. The vendor write path uses the convention
--   storage_path = '{homeowner_id}/{sent_project_id}/{doc_type}/{doc_id}.{ext}'
-- so (storage.foldername(name))[1] = the homeowner_id and
--    (storage.foldername(name))[2] = the sent_project_id.
-- We allow the INSERT iff a sent_project with id = foldername[2] exists
-- where sp.vendor_id = auth.uid() AND sp.homeowner_id::text = foldername[1].
-- Pinning foldername[1] to sp.homeowner_id is load-bearing: the homeowner-
-- side storage policies all gate on (storage.foldername(name))[1] =
-- auth.uid()::text, so an INSERT predicate that only validated foldername[2]
-- would let a vendor plant a contract under {ARBITRARY_homeowner_uuid}/
-- {their_sent_project}/... and that arbitrary homeowner would then have
-- SELECT/UPDATE/DELETE access to it via their own-folder policies, while
-- the real homeowner would NOT see it (foldername[1] mismatch). Pinning
-- both segments at INSERT time closes the cross-tenant plant vector at
-- the write boundary.
--
-- Boundary preserved: a vendor still cannot upload to a sent_project they
-- do not own; AND the homeowner uuid in the path is constrained to the
-- sent_project's actual homeowner. The homeowner own-folder INSERT path
-- (handled by the "Homeowners insert own documents" policy via
-- foldername[1]=auth.uid()) is untouched.
--
-- Paired-control verified on live data:
--   HONEST_PATH (folder[1]=real sp.homeowner_id):     loose=true, tight=true
--   CROSS_TENANT_ATTACK (folder[1]=other homeowner): loose=true, tight=false
--
-- Audit-trail: applied here AS the migration (not Mgmt-API-then-checked-in
-- like 065) so env-replay reproduces the fix on any rebuild. apollo holds
-- the re-verify marker on (vendor Mark-as-Sold → contract upload → PUT 200
-- + homeowner_documents row + revised-contract path) once this lands.

BEGIN;

DROP POLICY IF EXISTS "Vendors INSERT homeowner-doc storage on assigned projects" ON storage.objects;

CREATE POLICY "Vendors INSERT homeowner-doc storage on assigned projects" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'homeowner-documents'
  AND EXISTS (
    SELECT 1 FROM public.sent_projects sp
    WHERE sp.id::text = (storage.foldername(objects.name))[2]
      AND sp.vendor_id = auth.uid()
      AND sp.homeowner_id::text = (storage.foldername(objects.name))[1]
  )
);

COMMIT;
