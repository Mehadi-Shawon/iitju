-- ═══════════════════════════════════════════════════════════════════════════
-- FacultyTrack — Classrooms: group chat, and work students submit
-- 2026-10-17
--
-- Builds on 20261017_announcements.sql, which must be applied first. A
-- faculty member's group (announcement_groups) is also their classroom, with
-- the same students. Inside it:
--   * class_messages — a group chat. The teacher and the classroom's students
--     can all read and write. Text only; messages are never edited or deleted.
--   * class_files    — work a student submits. Every upload is a new row:
--     version 1 is the submission, and an update is a later version pointing
--     at it. A student can never overwrite or delete one, so these rows ARE
--     the submission log.
--   * a private `class-files` bucket holding the files themselves.
--
-- Who sees what: a student sees only their own files, and the teacher sees
-- every student's. Classmates never see each other's work.
--
-- Purely additive: two tables, a bucket, their policies and triggers, and
-- one nullable column on notifications. No existing policy or row changes.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0. Prerequisite ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.announcement_groups') IS NULL
     OR to_regprocedure('public.in_announcement_group(uuid, uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'Apply 20261017_announcements.sql first: classrooms are built on its groups';
  END IF;
END $$;


-- ── 1. Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.class_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.announcement_groups(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS class_messages_group_idx  ON public.class_messages (group_id, created_at DESC);
-- Deleting an account cascades here by sender_id
CREATE INDEX IF NOT EXISTS class_messages_sender_idx ON public.class_messages (sender_id);

CREATE TABLE IF NOT EXISTS public.class_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.announcement_groups(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- NULL for a submission; an update points at the submission (version 1)
  -- it revises, as thesis_submissions does
  parent_id   UUID REFERENCES public.class_files(id) ON DELETE CASCADE,
  -- Worked out by the insert guard, never taken from the client
  version     INT NOT NULL DEFAULT 1,
  file_path   TEXT NOT NULL UNIQUE,   -- object path inside the class-files bucket
  file_name   TEXT NOT NULL CHECK (btrim(file_name) <> '' AND char_length(file_name) <= 255),
  file_size   INT CHECK (file_size >= 0),
  mime_type   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Two uploads racing to become the same version: one wins, the other errors
CREATE UNIQUE INDEX IF NOT EXISTS class_files_chain_version_unique
  ON public.class_files (COALESCE(parent_id, id), version);
CREATE INDEX IF NOT EXISTS class_files_group_idx   ON public.class_files (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS class_files_student_idx ON public.class_files (student_id);
CREATE INDEX IF NOT EXISTS class_files_parent_idx  ON public.class_files (parent_id);

ALTER TABLE public.class_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_files    ENABLE ROW LEVEL SECURITY;


-- ── 2. Row-Level Security ──────────────────────────────────────────────────
-- The lookups are the SECURITY DEFINER helpers from 20261017_announcements.sql,
-- so no policy here queries another table under RLS.

-- Chat: the classroom's teacher and its students read and write, always in
-- their own name. No UPDATE or DELETE policy: messages are permanent.
DROP POLICY IF EXISTS "class_messages_select" ON public.class_messages;
CREATE POLICY "class_messages_select" ON public.class_messages
  FOR SELECT TO authenticated
  USING (
    public.owns_announcement_group(group_id, auth.uid())
    OR public.in_announcement_group(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "class_messages_insert" ON public.class_messages;
CREATE POLICY "class_messages_insert" ON public.class_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (public.owns_announcement_group(group_id, auth.uid()) AND public.has_role(auth.uid(), 'staff'))
      OR public.in_announcement_group(group_id, auth.uid())
    )
  );

-- Work: a student sees their own files; the teacher sees every student's.
DROP POLICY IF EXISTS "class_files_select" ON public.class_files;
CREATE POLICY "class_files_select" ON public.class_files
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.owns_announcement_group(group_id, auth.uid()));

-- Only a student of the classroom, in their own name, and only for an object
-- in their own folder of it. Without the path check a student could point a
-- row at a classmate's upload and pass that work off as theirs.
DROP POLICY IF EXISTS "class_files_insert" ON public.class_files;
CREATE POLICY "class_files_insert" ON public.class_files
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND public.has_role(auth.uid(), 'student')
    AND public.in_announcement_group(group_id, auth.uid())
    AND file_path LIKE group_id::text || '/' || auth.uid()::text || '/%'
  );

-- No UPDATE or DELETE policy on class_files: a submission is a record.
-- Changing work means uploading a new version, which the log then shows.


-- ── 3. Guards ──────────────────────────────────────────────────────────────

-- The server's clock for every message, so none can be backdated or pinned
CREATE OR REPLACE FUNCTION public.class_messages_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS class_messages_guard_trg ON public.class_messages;
CREATE TRIGGER class_messages_guard_trg
  BEFORE INSERT ON public.class_messages
  FOR EACH ROW EXECUTE FUNCTION public.class_messages_guard();

-- An update must revise the student's own submission in the same classroom,
-- and its version number is worked out here, not trusted from the client.
-- SECURITY DEFINER so the chain lookup is not filtered by RLS.
CREATE OR REPLACE FUNCTION public.class_files_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  root public.class_files%ROWTYPE;
BEGIN
  NEW.created_at := NOW();

  IF NEW.parent_id IS NULL THEN
    NEW.version := 1;
    RETURN NEW;
  END IF;

  SELECT * INTO root FROM public.class_files WHERE id = NEW.parent_id;
  IF NOT FOUND
     OR root.parent_id IS NOT NULL
     OR root.student_id <> NEW.student_id
     OR root.group_id   <> NEW.group_id
  THEN
    RAISE EXCEPTION 'class_files: an update must revise your own submission in the same classroom';
  END IF;

  SELECT MAX(version) + 1 INTO NEW.version
    FROM public.class_files
   WHERE id = NEW.parent_id OR parent_id = NEW.parent_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS class_files_guard_trg ON public.class_files;
CREATE TRIGGER class_files_guard_trg
  BEFORE INSERT ON public.class_files
  FOR EACH ROW EXECUTE FUNCTION public.class_files_guard();


-- ── 4. Notifications ───────────────────────────────────────────────────────
-- Links a notification to its classroom, so the bell can open it. CASCADE
-- clears them when the classroom is deleted.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS group_id UUID
  REFERENCES public.announcement_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_group_idx ON public.notifications (group_id);

-- Tells the teacher when a student submits or updates work. Chat messages
-- deliberately notify nobody: a busy chat would bury every other notification.
CREATE OR REPLACE FUNCTION public.class_files_notify()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who TEXT;
  grp public.announcement_groups%ROWTYPE;
BEGIN
  SELECT full_name INTO who FROM public.profiles WHERE id = NEW.student_id;
  SELECT * INTO grp FROM public.announcement_groups WHERE id = NEW.group_id;

  INSERT INTO public.notifications (user_id, type, title, body, group_id)
  VALUES (
    grp.owner_id,
    'class_work',
    CASE WHEN NEW.version = 1 THEN 'New Work Submitted' ELSE 'Work Updated' END,
    who
      || CASE WHEN NEW.version = 1 THEN ' submitted "' ELSE ' updated "' END
      || NEW.file_name || '"'
      || CASE WHEN NEW.version > 1 THEN ' (v' || NEW.version || ')' ELSE '' END
      || ' in ' || grp.name,
    NEW.group_id
  );

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS class_files_notify_trg ON public.class_files;
CREATE TRIGGER class_files_notify_trg
  AFTER INSERT ON public.class_files
  FOR EACH ROW EXECUTE FUNCTION public.class_files_notify();


-- ── 5. Storage ─────────────────────────────────────────────────────────────
-- Private, like `submissions`: files are served only through short-lived
-- signed URLs. The size and type limits are the server-side half of the
-- check the client already makes, so a crafted upload cannot skip them.
-- DO NOTHING leaves an existing bucket of the same name untouched; the
-- verification below reports whether it ended up private.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('class-files', 'class-files', FALSE, 15728640, ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/zip'
])
ON CONFLICT (id) DO NOTHING;

-- Object paths are {group_id}/{student_id}/{random}.{ext}. The helpers compare
-- the path as text, so a malformed name is refused instead of raising a cast
-- error.
CREATE OR REPLACE FUNCTION public.can_upload_class_file(object_name TEXT, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT split_part(object_name, '/', 2) = uid::text
     AND EXISTS (
       SELECT 1 FROM public.announcement_group_members m
       WHERE m.group_id::text = split_part(object_name, '/', 1) AND m.student_id = uid
     );
$$;

CREATE OR REPLACE FUNCTION public.owns_class_folder(object_name TEXT, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_groups g
    WHERE g.id::text = split_part(object_name, '/', 1) AND g.owner_id = uid
  );
$$;

REVOKE ALL ON FUNCTION public.can_upload_class_file(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_class_folder(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_upload_class_file(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_class_folder(TEXT, UUID) TO authenticated;

-- Upload: a student, into their own folder of a classroom they are in. There
-- is no UPDATE policy, so an upload can never overwrite submitted work.
DROP POLICY IF EXISTS "class_objects_insert" ON storage.objects;
CREATE POLICY "class_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'class-files'
    AND public.has_role(auth.uid(), 'student')
    AND public.can_upload_class_file(name, auth.uid())
  );

-- Read: the student who uploaded it, and the classroom's teacher
DROP POLICY IF EXISTS "class_objects_select" ON storage.objects;
CREATE POLICY "class_objects_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'class-files'
    AND (
      split_part(name, '/', 2) = auth.uid()::text
      OR public.owns_class_folder(name, auth.uid())
    )
  );

-- Delete: the teacher only, which the app does when a classroom is deleted.
-- A student who could delete would be able to make submitted work vanish.
DROP POLICY IF EXISTS "class_objects_delete" ON storage.objects;
CREATE POLICY "class_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'class-files'
    AND public.has_role(auth.uid(), 'staff')
    AND public.owns_class_folder(name, auth.uid())
  );


-- ── 6. Realtime ────────────────────────────────────────────────────────────
-- Only INSERT events are used (new messages, new uploads), which need no
-- REPLICA IDENTITY change.
DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['class_messages', 'class_files'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;


-- ── 7. Verify — every row should read OK ───────────────────────────────────
SELECT 'table' AS item, t AS name,
       CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
  FROM unnest(ARRAY['class_messages', 'class_files']) AS t
UNION ALL
SELECT 'column', 'notifications.group_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='notifications'
                           AND column_name='group_id')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'bucket', 'class-files (private)',
       CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'class-files' AND public = FALSE)
            THEN 'OK' ELSE 'MISSING OR PUBLIC' END
UNION ALL
SELECT 'policies', e.label || ' (' || e.expected || ')',
       CASE WHEN (SELECT COUNT(*) FROM pg_policies p
                  WHERE p.schemaname = e.schema_name AND p.tablename = e.table_name
                    AND p.policyname LIKE e.pattern) = e.expected
            THEN 'OK' ELSE 'WRONG COUNT' END
  FROM (VALUES ('class_messages', 'public', 'class_messages', '%', 2),
               ('class_files', 'public', 'class_files', '%', 2),
               ('storage class_objects_*', 'storage', 'objects', 'class_objects_%', 3))
       AS e(label, schema_name, table_name, pattern, expected)
UNION ALL
SELECT 'trigger', g,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = g AND NOT tgisinternal)
            THEN 'OK' ELSE 'MISSING' END
  FROM unnest(ARRAY['class_messages_guard_trg', 'class_files_guard_trg',
                    'class_files_notify_trg']) AS g
UNION ALL
SELECT 'realtime', t || ' in publication',
       CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables
                         WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                           AND tablename = t)
            THEN 'OK' ELSE 'MISSING' END
  FROM unnest(ARRAY['class_messages', 'class_files']) AS t;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — run only to undo this file. Deletes every chat message and
-- every record of submitted work.
--
-- Empty the bucket first (Dashboard → Storage → class-files → select all →
-- Delete), since a bucket that still holds files cannot be removed. Then:
-- ═══════════════════════════════════════════════════════════════════════════
/*
  DELETE FROM public.notifications WHERE type = 'class_work';
  ALTER TABLE public.notifications DROP COLUMN IF EXISTS group_id;
  DROP POLICY IF EXISTS "class_objects_insert" ON storage.objects;
  DROP POLICY IF EXISTS "class_objects_select" ON storage.objects;
  DROP POLICY IF EXISTS "class_objects_delete" ON storage.objects;
  DELETE FROM storage.buckets WHERE id = 'class-files';
  ALTER PUBLICATION supabase_realtime DROP TABLE public.class_messages;
  ALTER PUBLICATION supabase_realtime DROP TABLE public.class_files;
  DROP TABLE IF EXISTS public.class_files;       -- its triggers go with it
  DROP TABLE IF EXISTS public.class_messages;
  DROP FUNCTION IF EXISTS public.class_files_notify();
  DROP FUNCTION IF EXISTS public.class_files_guard();
  DROP FUNCTION IF EXISTS public.class_messages_guard();
  DROP FUNCTION IF EXISTS public.can_upload_class_file(TEXT, UUID);
  DROP FUNCTION IF EXISTS public.owns_class_folder(TEXT, UUID);
*/
