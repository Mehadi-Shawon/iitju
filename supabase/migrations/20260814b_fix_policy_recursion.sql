-- ═══════════════════════════════════════════════════════════════════════════
-- FacultyTrack — FIX: infinite recursion in thesis_submissions policies (42P17)
--
-- THE BUG
--   The submissions_insert policy contained a subquery against
--   public.thesis_submissions (the parent_id ownership check). A policy on a
--   table that queries its OWN table re-enters RLS evaluation for that table,
--   which Postgres detects and rejects with
--     42P17: infinite recursion detected in policy for relation "thesis_submissions"
--
-- THE FIX
--   No policy queries a table that is itself under RLS any more. Every such
--   lookup moves into a SECURITY DEFINER function, which runs as the function
--   owner and therefore does not re-trigger RLS.
--
--   This also removes the same recursion shape from the storage read policy,
--   and makes the policies immune to the pre-existing self-reference in
--   profiles_admin_all, which has the identical 42P17 shape.
--
-- Safe to re-run. Modifies nothing outside the submission feature.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. SECURITY DEFINER helpers
--
-- STABLE so the planner can cache within a statement. search_path is pinned so
-- the function body cannot be redirected at a shadow table.
-- ───────────────────────────────────────────────────────────────────────────

-- Role lookup that does not re-enter RLS on profiles.
CREATE OR REPLACE FUNCTION public.has_role(uid UUID, want TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = want
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated;


-- "Is this user the assigned reviewer for the submission holding this file?"
-- Used by the storage read policy, so it must not re-enter RLS either.
CREATE OR REPLACE FUNCTION public.is_submission_reviewer(object_name TEXT, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.thesis_submissions s
    WHERE s.file_path = object_name AND s.staff_id = uid
  );
$$;

REVOKE ALL ON FUNCTION public.is_submission_reviewer(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_submission_reviewer(TEXT, UUID) TO authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Rebuild the thesis_submissions policies without any self-reference
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "submissions_select" ON public.thesis_submissions;
CREATE POLICY "submissions_select" ON public.thesis_submissions
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR staff_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- The parent_id check that caused the recursion is GONE from this policy and
-- now lives in the BEFORE INSERT trigger in section 3.
DROP POLICY IF EXISTS "submissions_insert" ON public.thesis_submissions;
CREATE POLICY "submissions_insert" ON public.thesis_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND public.has_role(auth.uid(), 'student')

    -- The reviewer must be real faculty, and never the submitter.
    AND staff_id <> auth.uid()
    AND public.has_role(staff_id, 'staff')

    -- A new submission always starts unreviewed. The review-outcome columns
    -- belong to the reviewer, not the submitter.
    AND status = 'submitted'
    AND COALESCE(feedback, '') = ''
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
  );

DROP POLICY IF EXISTS "submissions_update" ON public.thesis_submissions;
CREATE POLICY "submissions_update" ON public.thesis_submissions
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (staff_id = auth.uid() AND public.has_role(auth.uid(), 'staff'))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (staff_id = auth.uid() AND public.has_role(auth.uid(), 'staff'))
  );

DROP POLICY IF EXISTS "submissions_delete" ON public.thesis_submissions;
CREATE POLICY "submissions_delete" ON public.thesis_submissions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- ───────────────────────────────────────────────────────────────────────────
-- 3. The parent_id rule, moved to a trigger
--
-- SECURITY DEFINER, so the lookup against thesis_submissions runs outside RLS
-- and cannot recurse. A resubmission may only extend the submitter's own chain.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.thesis_submissions_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.thesis_submissions p
    WHERE p.id = NEW.parent_id
      AND p.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'thesis_submissions: a resubmission must extend your own submission';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS thesis_submissions_insert_guard_trg ON public.thesis_submissions;
CREATE TRIGGER thesis_submissions_insert_guard_trg
  BEFORE INSERT ON public.thesis_submissions
  FOR EACH ROW EXECUTE FUNCTION public.thesis_submissions_insert_guard();


-- ───────────────────────────────────────────────────────────────────────────
-- 4. Rebuild the storage policies through the helpers
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "submission_files_insert" ON storage.objects;
CREATE POLICY "submission_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "submission_files_select" ON storage.objects;
CREATE POLICY "submission_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_submission_reviewer(name, auth.uid())
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "submission_files_delete" ON storage.objects;
CREATE POLICY "submission_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'submissions'
    AND public.has_role(auth.uid(), 'admin')
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 5. Verification — the SELECT is the real test
--
-- Before this fix the query below raised 42P17. If it returns a count instead
-- (0 is fine), the recursion is gone.
-- ───────────────────────────────────────────────────────────────────────────

SELECT 'read test' AS check, COUNT(*)::text AS result FROM public.thesis_submissions
UNION ALL
SELECT 'has_role fn',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname='public' AND p.proname='has_role')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'is_submission_reviewer fn',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname='public' AND p.proname='is_submission_reviewer')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'insert guard trigger',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgname='thesis_submissions_insert_guard_trg' AND NOT tgisinternal)
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'no self-referencing policy',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                         WHERE schemaname='public' AND tablename='thesis_submissions'
                           AND (COALESCE(qual,'') || COALESCE(with_check,'')) LIKE '%thesis_submissions%')
            THEN 'STILL PRESENT' ELSE 'OK' END;
