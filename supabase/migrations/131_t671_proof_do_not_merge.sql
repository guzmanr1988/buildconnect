-- task_671 PROOF FIXTURE, DO NOT MERGE: a new public table with no GRANT. The public-grant lint must fail this PR.
CREATE TABLE public.t671_proof_widgets (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.t671_proof_widgets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.t671_proof_widgets TO authenticated;
GRANT ALL ON public.t671_proof_widgets TO service_role;
