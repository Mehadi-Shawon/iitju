-- ═══════════════════════════════════════════════════════════════════════════
-- FacultyTrack — Migration: Thesis & Project Submission System
-- 2026-08-14
--
-- Adds the student → faculty submission flow to an EXISTING FacultyTrack
-- database (profiles, staff_status, activity_log, schedule_requests,
-- notifications must already exist).
--
-- Every statement is idempotent, so running this file twice is harmless.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. thesis_submissions
--
-- A resubmission is a NEW ROW, never an edit. Version 2+ rows point at the
-- first row of their chain via parent_id, so the whole revision history is
-- preserved and auditable. Chain root = COALESCE(parent_id, id).
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.thesis_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  doc_type     TEXT NOT NULL DEFAULT 'thesis'
               CHECK (doc_type IN ('thesis','project')),
  abstract     TEXT DEFAULT '',
  file_path    TEXT NOT NULL,   -- object path inside the private `submissions` bucket
  file_name    TEXT NOT NULL,   -- original filename, for display
  file_size    INT,             -- bytes
  version      INT NOT NULL DEFAULT 1,
  parent_id    UUID REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'submitted'
               CHECK (status IN ('submitted','under_review','approved','rejected')),
  feedback     TEXT DEFAULT '',
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS thesis_submissions_student_idx ON public.thesis_submissions(student_id);
CREATE INDEX IF NOT EXISTS thesis_submissions_staff_idx   ON public.thesis_submissions(staff_id);
CREATE INDEX IF NOT EXISTS thesis_submissions_parent_idx  ON public.thesis_submissions(parent_id);
-- The storage policies below look a row up by file_path on every download
CREATE INDEX IF NOT EXISTS thesis_submissions_file_idx    ON public.thesis_submissions(file_path);

ALTER TABLE public.thesis_submissions ENABLE ROW LEVEL SECURITY;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Row-Level Security on thesis_submissions
-- ───────────────────────────────────────────────────────────────────────────

-- Visible to its author, the faculty member it was sent to, and admins only.
DROP POLICY IF EXISTS "submissions_select" ON public.thesis_submissions;
CREATE POLICY "submissions_select" ON public.thesis_submissions
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR staff_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only a student may submit, and only in their own name.
--
-- An INSERT policy authorises the ROW, so it must also pin the row's CONTENTS.
-- Without the clauses below a student could POST a row that is already
-- status='approved', or name THEMSELVES as the reviewer in
-- staff_id and then satisfy submissions_update to grade their own work.
DROP POLICY IF EXISTS "submissions_insert" ON public.thesis_submissions;
CREATE POLICY "submissions_insert" ON public.thesis_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'student'

    -- The reviewer must be a real faculty member, and never the submitter.
    AND staff_id <> auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = staff_id) = 'staff'

    -- A new submission always starts unreviewed. Every review-outcome column
    -- belongs to the reviewer, not the submitter.
    AND status = 'submitted'
    AND COALESCE(feedback, '') = ''
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL

    -- A revision may only extend the student's OWN chain, so one student
    -- cannot graft a row into another student's revision history.
    AND (
      parent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.thesis_submissions p
        WHERE p.id = parent_id
          AND p.student_id = auth.uid()
      )
    )
  );

-- Only the assigned faculty member (or an admin) may review. The caller's role
-- is checked explicitly as well as staff_id, so the rule holds even if someone
-- is later moved between roles.
DROP POLICY IF EXISTS "submissions_update" ON public.thesis_submissions;
CREATE POLICY "submissions_update" ON public.thesis_submissions
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (
      staff_id = auth.uid()
      AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'staff'
    )
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (
      staff_id = auth.uid()
      AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'staff'
    )
  );

-- Nobody but an admin may delete a submission — submissions are a record.
-- The app never calls delete; this exists so an admin can clear test data.
DROP POLICY IF EXISTS "submissions_delete" ON public.thesis_submissions;
CREATE POLICY "submissions_delete" ON public.thesis_submissions
  FOR DELETE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');


-- ───────────────────────────────────────────────────────────────────────────
-- 2b. Column-level guard on UPDATE
--
-- RLS is row-scoped, never column-scoped: submissions_update controls WHICH
-- rows a reviewer may change, but not WHICH COLUMNS. A policy's WITH CHECK
-- also cannot see the OLD row, so immutability needs a trigger.
--
-- file_path is the important one. The storage read policy grants access by
-- joining thesis_submissions.file_path to the object name, so a reviewer who
-- could rewrite file_path on their own row would be able to read ANY PDF in
-- the bucket, including other reviewers' students'.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.thesis_submissions_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.staff_id   IS DISTINCT FROM OLD.staff_id
     OR NEW.file_path  IS DISTINCT FROM OLD.file_path
     OR NEW.file_name  IS DISTINCT FROM OLD.file_name
     OR NEW.file_size  IS DISTINCT FROM OLD.file_size
     OR NEW.version    IS DISTINCT FROM OLD.version
     OR NEW.parent_id  IS DISTINCT FROM OLD.parent_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'thesis_submissions: identity, file and version columns are immutable after submission';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS thesis_submissions_guard_trg ON public.thesis_submissions;
CREATE TRIGGER thesis_submissions_guard_trg
  BEFORE UPDATE ON public.thesis_submissions
  FOR EACH ROW EXECUTE FUNCTION public.thesis_submissions_guard();



-- ───────────────────────────────────────────────────────────────────────────
-- 3. Link notifications to a submission
--
-- A separate column from request_id, whose foreign key points at
-- schedule_requests and would reject a submission id.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS submission_id UUID
  REFERENCES public.thesis_submissions(id) ON DELETE CASCADE;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. activity_log is deliberately left ALONE
--
-- An earlier draft tightened the activity_log SELECT policy, because writing
-- submission titles into a table readable by every authenticated user would
-- leak one student's work to another.
--
-- That change was dropped: useStaffList() in src/hooks/useData.js subscribes to
-- activity_log INSERT events as the live-update fallback for the faculty
-- directory, and Supabase Realtime applies RLS per subscriber. Narrowing the
-- policy would stop students receiving those events and break live dashboard
-- updates for them.
--
-- The leak is instead avoided at the source: the app never writes submission
-- titles or review outcomes to activity_log. The submission history is read
-- from thesis_submissions, which is properly restricted above, and admins get
-- full oversight through the Submissions page rather than the activity feed.
--
-- Net effect: this migration does not modify any existing policy.
-- ───────────────────────────────────────────────────────────────────────────


-- ───────────────────────────────────────────────────────────────────────────
-- 5. Realtime
--
-- REPLICA IDENTITY FULL is required for UPDATE events to carry enough of the
-- old row for Supabase Realtime to evaluate RLS. Without it a student's page
-- would not live-update when faculty change the status.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.thesis_submissions REPLICA IDENTITY FULL;

-- ALTER PUBLICATION … ADD TABLE errors if the table is already a member,
-- so add it conditionally to keep this file re-runnable.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'thesis_submissions'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.thesis_submissions;
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6. Private storage bucket for submitted PDFs
--
-- public = false, unlike the `avatars` bucket: an unpublished thesis must not
-- have a permanent public URL. The app serves files through signed URLs that
-- expire after five minutes.
--
-- The size and MIME limits here are the server-side half of the check the
-- client already performs, so a crafted upload cannot bypass them.
-- ───────────────────────────────────────────────────────────────────────────

-- DO NOTHING rather than DO UPDATE: if a bucket called `submissions` somehow
-- already exists, this leaves its settings untouched instead of silently
-- reconfiguring it. The verification query at the end reports whether the
-- bucket ended up private, so a pre-existing misconfiguration is visible.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('submissions', 'submissions', FALSE, 15728640, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────────
-- 7. Storage policies
--
-- Path convention: {student_uid}/{uuid}_v{n}.pdf — the first folder segment
-- is the owning student's auth uid, which is what these policies check.
-- ───────────────────────────────────────────────────────────────────────────

-- A student may upload only into their own folder.
DROP POLICY IF EXISTS "submission_files_insert" ON storage.objects;
CREATE POLICY "submission_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Readable by the owning student, the faculty member the submission was sent
-- to, and admins. The subquery is itself subject to thesis_submissions RLS,
-- which narrows it to rows the caller is already allowed to see.
DROP POLICY IF EXISTS "submission_files_select" ON storage.objects;
CREATE POLICY "submission_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.thesis_submissions s
        WHERE s.file_path = storage.objects.name
          AND s.staff_id = auth.uid()
      )
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    )
  );

-- Admins only. An earlier version also let a student delete a file in their own
-- folder while "no submission row references it", but that NOT EXISTS runs as
-- the caller and is therefore filtered by RLS — it tests "no row I can see",
-- not "no row exists", which is a weaker claim than it looks.
--
-- The cost of dropping that branch is that a failed row insert can leave one
-- orphaned PDF in the bucket. The client's cleanup call will simply be denied
-- and is already best-effort, so nothing breaks; an admin can clear strays.
DROP POLICY IF EXISTS "submission_files_delete" ON storage.objects;
CREATE POLICY "submission_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 8. Verification — these should all report OK after a successful run
-- ───────────────────────────────────────────────────────────────────────────

SELECT 'table'     AS object, 'thesis_submissions' AS name,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema='public' AND table_name='thesis_submissions')
            THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'column', 'notifications.submission_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='notifications'
                           AND column_name='submission_id')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'bucket', 'submissions (private)',
       CASE WHEN EXISTS (SELECT 1 FROM storage.buckets
                         WHERE id='submissions' AND public = FALSE)
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'policies', 'thesis_submissions (expect 4)',
       COALESCE((SELECT COUNT(*)::text FROM pg_policies
                 WHERE schemaname='public' AND tablename='thesis_submissions'), '0')
UNION ALL
SELECT 'policies', 'storage.objects submission_* (expect 3)',
       COALESCE((SELECT COUNT(*)::text FROM pg_policies
                 WHERE schemaname='storage' AND tablename='objects'
                   AND policyname LIKE 'submission_files_%'), '0')
UNION ALL
SELECT 'realtime', 'thesis_submissions in publication',
       CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables
                         WHERE pubname='supabase_realtime' AND schemaname='public'
                           AND tablename='thesis_submissions')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
-- Confirms this migration did NOT touch the existing avatars setup
SELECT 'untouched', 'avatars bucket still public',
       CASE WHEN EXISTS (SELECT 1 FROM storage.buckets
                         WHERE id='avatars' AND public = TRUE)
            THEN 'OK' ELSE 'CHECK MANUALLY' END;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — not part of the migration. Run this block only to undo it.
--
-- Returns the database to exactly its previous state. Nothing that existed
-- before this migration is referenced, so nothing else can be lost.
-- Note it DOES delete submitted PDFs and submission rows, so only run it while
-- the feature is still test data.
-- ═══════════════════════════════════════════════════════════════════════════
/*
  -- 1. storage policies added by this migration
  DROP POLICY IF EXISTS "submission_files_insert" ON storage.objects;
  DROP POLICY IF EXISTS "submission_files_select" ON storage.objects;
  DROP POLICY IF EXISTS "submission_files_delete" ON storage.objects;

  -- 2. empty the bucket, then remove it
  DELETE FROM storage.objects WHERE bucket_id = 'submissions';
  DELETE FROM storage.buckets WHERE id = 'submissions';

  -- 3. leave the realtime publication as it was
  ALTER PUBLICATION supabase_realtime DROP TABLE public.thesis_submissions;

  -- 4. the column added to notifications
  ALTER TABLE public.notifications DROP COLUMN IF EXISTS submission_id;

  -- 5. the table itself (its policies and indexes go with it)
  DROP TABLE IF EXISTS public.thesis_submissions;
*/
