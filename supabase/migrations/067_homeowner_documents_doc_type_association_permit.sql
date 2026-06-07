-- 067_homeowner_documents_doc_type_association_permit.sql
-- task_1780797727202_066 hotfix — widen homeowner_documents.doc_type CHECK
-- constraint to allow 'association_permit'.
--
-- The Part B client code (PR-066 / bundle index-DA2aJKpU.js) writes
-- doc_type='association_permit' from the homeowner AssociationDocActionCard
-- upload path + reads it via useAssociationDocForProject(). Production
-- constraint homeowner_documents_doc_type_check was missing the value,
-- so inserts were rejected with code 23514. Apollo caught this via
-- behavioral Gate-1 verify on bundle 6d218183.
--
-- Widening a CHECK to allow MORE values is backward-safe: existing rows
-- are already members of the old allowed set (no data rewrite, no row
-- revalidation past the relation-level scan). All other doc_type values
-- in the HomeownerDocType union are preserved verbatim. NULL still
-- allowed for legacy pre-backfill rows.

alter table public.homeowner_documents
  drop constraint if exists homeowner_documents_doc_type_check;

alter table public.homeowner_documents
  add constraint homeowner_documents_doc_type_check
  check (
    doc_type is null or doc_type in (
      'license',
      'permit',
      'association_permit',
      'sketch',
      'measurement',
      'agreement',
      'contract',
      'quote',
      'photo',
      'other'
    )
  );
