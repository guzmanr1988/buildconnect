-- 104_concierge_rep_request_photos.sql
-- BuildConnect Concierge — normalized photo metadata table for rep_requests.
-- Companion to migrations 101 (rep_requests core), 102 (events), 103 (storage
-- bucket spec docs).
--
-- DESIGN SOURCES (locked):
--   athena spec v1 §8.2 + D1 reconcile (hephaestus msg 1782350613171, athena
--     ACK msg 1782350658943): normalized separate table over denorm text[]
--     array on rep_requests. Reasons: per-photo audit (uploaded_by + created_at
--     + future caption/order fields), ON DELETE CASCADE cleanup elegance,
--     queryable per-actor photo audit feed.
--   Storage bucket convention: migration 103 — bucket 'rep-request-photos',
--     path {rep_request_id}/{uploaded_by_id}/{filename}, image-only MIME,
--     10MB per-file cap.
--
-- RELATIONSHIP TO migration 103:
--   This table holds the DB-side photo metadata; the actual photo bytes live
--   in the rep-request-photos Storage bucket. storage_path is the canonical
--   pointer from this row to the bucket object. The bucket RLS predicates
--   (see mig 103 comments) pivot on (storage.foldername(name))[1]=rep_request_id
--   and the EXISTS subquery against rep_requests.homeowner_id /
--   rep_requests.assigned_rep_id; this table's RLS pivots on the same
--   rep_request membership for symmetric defense-in-depth.
--
-- PAIRED-CLEANUP DISCIPLINE (feedback_homeowner_documents_db_delete_no_storage_cascade):
--   ON DELETE CASCADE here removes the DB row when the parent rep_request is
--   deleted, but does NOT cascade to Storage. Any future admin-purge flow MUST
--   pair this DB DELETE with a Storage DELETE on the corresponding bucket
--   object. See migration 103 §3 for the recommended purge path.

BEGIN;

CREATE TABLE rep_request_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_request_id uuid NOT NULL REFERENCES rep_requests(id) ON DELETE CASCADE,

  -- Storage bucket pointer. Convention: {rep_request_id}/{uploaded_by}/{filename}
  -- Uniqueness enforced at storage layer (bucket key is unique by definition);
  -- this column carries the full path string for reverse lookup.
  storage_path   text NOT NULL,

  -- Who uploaded this photo. ON DELETE SET NULL preserves the photo on the
  -- request if the uploading profile is later removed (e.g., admin who created
  -- the photo on behalf of a homeowner is later deactivated).
  uploaded_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- v2 polish slots — NULL on initial INSERT, optional rep/homeowner write
  caption        text,
  sort_order     integer NOT NULL DEFAULT 0,

  created_at     timestamptz NOT NULL DEFAULT now(),

  -- One storage_path uniquely identifies an upload across the table.
  CONSTRAINT rep_request_photos_storage_path_unique UNIQUE (storage_path)
);

-- Indexes
CREATE INDEX rep_request_photos_rep_request_idx
  ON rep_request_photos (rep_request_id, sort_order, created_at);

CREATE INDEX rep_request_photos_uploaded_by_idx
  ON rep_request_photos (uploaded_by, created_at DESC)
  WHERE uploaded_by IS NOT NULL;

-- RLS
ALTER TABLE rep_request_photos ENABLE ROW LEVEL SECURITY;

-- Homeowner: read own request's photos
CREATE POLICY rep_request_photos_homeowner_read
  ON rep_request_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rep_requests r
      WHERE r.id = rep_request_photos.rep_request_id
        AND r.homeowner_id = auth.uid()
    )
  );

-- Homeowner: insert photos to own request (any non-terminal state)
CREATE POLICY rep_request_photos_homeowner_insert
  ON rep_request_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM rep_requests r
      WHERE r.id = rep_request_photos.rep_request_id
        AND r.homeowner_id = auth.uid()
        AND r.status NOT IN ('cancelled', 'charge_failed', 'contractor_selected')
    )
  );

-- Homeowner: delete own photos pre-rep-involvement only (mirrors mig 103
-- storage policy — once rep assigned, photos become assessment evidence)
CREATE POLICY rep_request_photos_homeowner_delete
  ON rep_request_photos FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM rep_requests r
      WHERE r.id = rep_request_photos.rep_request_id
        AND r.homeowner_id = auth.uid()
        AND r.status IN ('pending_payment', 'new')
    )
  );

-- Rep: read photos for own assigned requests
CREATE POLICY rep_request_photos_rep_read_assigned
  ON rep_request_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rep_requests r
      WHERE r.id = rep_request_photos.rep_request_id
        AND r.assigned_rep_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rep')
  );

-- Rep: insert photos to own assigned requests (assessment evidence)
CREATE POLICY rep_request_photos_rep_insert_assigned
  ON rep_request_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM rep_requests r
      WHERE r.id = rep_request_photos.rep_request_id
        AND r.assigned_rep_id = auth.uid()
        AND r.status IN ('scheduled', 'visited', 'project_ready')
    )
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rep')
  );

-- Rep CANNOT delete — assessment evidence must survive the request lifecycle.

-- Admin / admin_employee: full read + insert + update (caption/sort_order
-- correction) + delete (for spam / wrong-upload cleanup).
CREATE POLICY rep_request_photos_admin_all
  ON rep_request_photos FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'admin_employee')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'admin_employee')
  ));

COMMIT;
