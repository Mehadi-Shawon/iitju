-- ═══════════════════════════════════════════════════════════════════════════
-- FacultyTrack — Announcements from faculty to students
-- 2026-10-17
--
-- A faculty member posts an announcement (a topic and a message) to either
--   * every student, or
--   * one of their own groups: a named set of students they pick themselves,
--     such as "Thesis Group A" or "Lab Section B", saved for reuse.
-- The author can later edit the topic and message, or delete the post.
--
-- Recipients are notified by a trigger in the same transaction as the post,
-- so an announcement is never saved with only some of its notifications.
--
-- Purely additive: three new tables with their policies and triggers, and one
-- nullable column on notifications. No existing policy or row is modified.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Role helper ─────────────────────────────────────────────────────────
-- Also created by 20260814b_fix_policy_recursion.sql. Defined here too, with
-- the same body, so this file can be applied on its own and in any order.
CREATE OR REPLACE FUNCTION public.has_role(uid UUID, want TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = want);
$$;

REVOKE ALL ON FUNCTION public.has_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated;


-- ── 2. Tables ──────────────────────────────────────────────────────────────

-- A faculty member's own named set of students. Private to its owner: other
-- faculty can neither see it nor post to it.
CREATE TABLE IF NOT EXISTS public.announcement_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Two of one teacher's groups with the same name could not be told apart when
-- picking who to send to. Different teachers may use the same name.
CREATE UNIQUE INDEX IF NOT EXISTS announcement_groups_owner_name_unique
  ON public.announcement_groups (owner_id, lower(name));

CREATE TABLE IF NOT EXISTS public.announcement_group_members (
  group_id    UUID NOT NULL REFERENCES public.announcement_groups(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, student_id)
);

-- Deleting a student account cascades here by student_id
CREATE INDEX IF NOT EXISTS announcement_group_members_student_idx
  ON public.announcement_group_members (student_id);

CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Spelled out rather than inferred from a NULL group_id, so nothing that
  -- loses a group id can turn a group notice into one for every student.
  audience    TEXT NOT NULL CHECK (audience IN ('all','group')),
  -- CASCADE, never SET NULL: deleting a group deletes what was sent to it.
  group_id    UUID REFERENCES public.announcement_groups(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 200),
  body        TEXT NOT NULL CHECK (btrim(body)  <> '' AND char_length(body)  <= 5000),
  -- Both stamped by the guard trigger, never by the client. updated_at moves
  -- only on a real edit, so updated_at > created_at means "edited".
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT announcements_audience_group
    CHECK ((audience = 'group') = (group_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS announcements_author_idx ON public.announcements (author_id);
CREATE INDEX IF NOT EXISTS announcements_group_idx  ON public.announcements (group_id);

ALTER TABLE public.announcement_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements              ENABLE ROW LEVEL SECURITY;


-- ── 3. Lookups for the policies ────────────────────────────────────────────
-- SECURITY DEFINER, so no policy below queries a table that is itself under
-- RLS — the 42P17 recursion shape that 20260814b had to remove.

CREATE OR REPLACE FUNCTION public.owns_announcement_group(gid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_groups WHERE id = gid AND owner_id = uid
  );
$$;

CREATE OR REPLACE FUNCTION public.in_announcement_group(gid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_group_members WHERE group_id = gid AND student_id = uid
  );
$$;

REVOKE ALL ON FUNCTION public.owns_announcement_group(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.in_announcement_group(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_announcement_group(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.in_announcement_group(UUID, UUID) TO authenticated;


-- ── 4. Row-Level Security ──────────────────────────────────────────────────
-- Every write also checks the caller is still faculty, so the rules hold if
-- someone is later moved between roles.

-- Groups: the owner manages them. A member may read the group itself, since
-- its name is shown on the announcements sent to it.
DROP POLICY IF EXISTS "ann_groups_select" ON public.announcement_groups;
CREATE POLICY "ann_groups_select" ON public.announcement_groups
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.in_announcement_group(id, auth.uid()));

DROP POLICY IF EXISTS "ann_groups_insert" ON public.announcement_groups;
CREATE POLICY "ann_groups_insert" ON public.announcement_groups
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));

DROP POLICY IF EXISTS "ann_groups_update" ON public.announcement_groups;
CREATE POLICY "ann_groups_update" ON public.announcement_groups
  FOR UPDATE TO authenticated
  USING      (owner_id = auth.uid() AND public.has_role(auth.uid(), 'staff'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));

DROP POLICY IF EXISTS "ann_groups_delete" ON public.announcement_groups;
CREATE POLICY "ann_groups_delete" ON public.announcement_groups
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));

-- Members: only the group's owner adds or removes them, and only student
-- accounts can be added. A student can see their own memberships. There is no
-- UPDATE policy: a membership is added or removed, never rewritten.
DROP POLICY IF EXISTS "ann_members_select" ON public.announcement_group_members;
CREATE POLICY "ann_members_select" ON public.announcement_group_members
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.owns_announcement_group(group_id, auth.uid()));

DROP POLICY IF EXISTS "ann_members_insert" ON public.announcement_group_members;
CREATE POLICY "ann_members_insert" ON public.announcement_group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.owns_announcement_group(group_id, auth.uid())
    AND public.has_role(auth.uid(), 'staff')
    AND public.has_role(student_id, 'student')
  );

DROP POLICY IF EXISTS "ann_members_delete" ON public.announcement_group_members;
CREATE POLICY "ann_members_delete" ON public.announcement_group_members
  FOR DELETE TO authenticated
  USING (public.owns_announcement_group(group_id, auth.uid()) AND public.has_role(auth.uid(), 'staff'));

-- Announcements: a student reads the posts for all students and for the
-- groups they are in. The author reads, edits and deletes their own.
DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
CREATE POLICY "announcements_select" ON public.announcements
  FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR (audience = 'all'   AND public.has_role(auth.uid(), 'student'))
    OR (audience = 'group' AND public.in_announcement_group(group_id, auth.uid()))
  );

-- Faculty only, in their own name, and to a group only if it is their own.
DROP POLICY IF EXISTS "announcements_insert" ON public.announcements;
CREATE POLICY "announcements_insert" ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.has_role(auth.uid(), 'staff')
    AND (audience = 'all' OR public.owns_announcement_group(group_id, auth.uid()))
  );

-- Which columns an edit may change is enforced by the guard trigger below
DROP POLICY IF EXISTS "announcements_update" ON public.announcements;
CREATE POLICY "announcements_update" ON public.announcements
  FOR UPDATE TO authenticated
  USING      (author_id = auth.uid() AND public.has_role(auth.uid(), 'staff'))
  WITH CHECK (author_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));

DROP POLICY IF EXISTS "announcements_delete" ON public.announcements;
CREATE POLICY "announcements_delete" ON public.announcements
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));


-- ── 5. Guard: server timestamps, and only the text is editable ─────────────
-- RLS decides which rows a caller may write, never which columns, and a
-- WITH CHECK cannot see the old row, so both rules need a trigger.
--
-- The audience is fixed once posted. Re-pointing a post would leave its
-- original recipients holding notifications for something they can no longer
-- open, and would never notify the new ones. Changing group_id would also
-- skip the insert policy's ownership check, letting a teacher post into
-- another teacher's group.
CREATE OR REPLACE FUNCTION public.announcements_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A client-supplied date in the future would pin a post to the top of
    -- every student's list
    NEW.created_at := NOW();
    NEW.updated_at := NEW.created_at;
    RETURN NEW;
  END IF;

  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.author_id  IS DISTINCT FROM OLD.author_id
     OR NEW.audience   IS DISTINCT FROM OLD.audience
     OR NEW.group_id   IS DISTINCT FROM OLD.group_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'announcements: only the topic and message can be changed after posting';
  END IF;

  -- Only a real change counts as an edit, so a save that changed nothing
  -- does not mark the post as edited
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.updated_at := NOW();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS announcements_guard_trg ON public.announcements;
CREATE TRIGGER announcements_guard_trg
  BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.announcements_guard();


-- ── 6. Notifications ───────────────────────────────────────────────────────
-- A separate column, like submission_id, because request_id's foreign key
-- points at schedule_requests. CASCADE removes a post's notifications with it.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS announcement_id UUID
  REFERENCES public.announcements(id) ON DELETE CASCADE;

-- Deleting or editing a post finds its notifications through this column
CREATE INDEX IF NOT EXISTS notifications_announcement_idx
  ON public.notifications (announcement_id);

-- On INSERT: one notification per recipient. On a topic edit: re-word the
-- notifications already delivered, so the bell never quotes a topic the
-- author has since corrected. Read state is left alone, so nobody is
-- notified twice.
--
-- SECURITY DEFINER because re-wording writes other users' notifications,
-- which notif_update forbids. It also keeps the fan-out working if the
-- permissive notif_insert policy (WITH CHECK (true)) is ever tightened.
CREATE OR REPLACE FUNCTION public.announcements_notify()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line TEXT;
BEGIN
  SELECT btrim(COALESCE(p.honorific, '') || ' ' || p.full_name)
         || ' posted an announcement: "' || NEW.title || '"'
    INTO line
    FROM public.profiles p
   WHERE p.id = NEW.author_id;

  IF TG_OP = 'UPDATE' THEN
    UPDATE public.notifications SET body = line WHERE announcement_id = NEW.id;
  ELSIF NEW.audience = 'all' THEN
    INSERT INTO public.notifications (user_id, type, title, body, announcement_id)
    SELECT p.id, 'announcement', 'New Announcement', line, NEW.id
      FROM public.profiles p
     WHERE p.role = 'student';
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, announcement_id)
    SELECT m.student_id, 'announcement', 'New Announcement', line, NEW.id
      FROM public.announcement_group_members m
     WHERE m.group_id = NEW.group_id;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS announcements_notify_trg ON public.announcements;
CREATE TRIGGER announcements_notify_trg
  AFTER INSERT ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.announcements_notify();

DROP TRIGGER IF EXISTS announcements_reword_trg ON public.announcements;
CREATE TRIGGER announcements_reword_trg
  AFTER UPDATE OF title ON public.announcements
  FOR EACH ROW
  WHEN (OLD.title IS DISTINCT FROM NEW.title)
  EXECUTE FUNCTION public.announcements_notify();


-- ── 7. Realtime ────────────────────────────────────────────────────────────
-- FULL so an edit reaches students who have the page open: Realtime needs the
-- whole row to evaluate the SELECT policy on an UPDATE event.
ALTER TABLE public.announcements REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public' AND tablename = 'announcements'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;
END $$;


-- ── 8. Verify — every row should read OK ───────────────────────────────────
SELECT 'table' AS item, t AS name,
       CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
  FROM unnest(ARRAY['announcements', 'announcement_groups', 'announcement_group_members']) AS t
UNION ALL
SELECT 'column', 'notifications.announcement_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='notifications'
                           AND column_name='announcement_id')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'policies', tablename || ' (' || expected || ')',
       CASE WHEN (SELECT COUNT(*) FROM pg_policies p
                  WHERE p.schemaname='public' AND p.tablename=e.tablename) = expected
            THEN 'OK' ELSE 'WRONG COUNT' END
  FROM (VALUES ('announcements', 4), ('announcement_groups', 4),
               ('announcement_group_members', 3)) AS e(tablename, expected)
UNION ALL
SELECT 'trigger', g,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = g AND NOT tgisinternal)
            THEN 'OK' ELSE 'MISSING' END
  FROM unnest(ARRAY['announcements_guard_trg', 'announcements_notify_trg',
                    'announcements_reword_trg']) AS g
UNION ALL
SELECT 'realtime', 'announcements in publication',
       CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables
                         WHERE pubname='supabase_realtime' AND schemaname='public'
                           AND tablename='announcements')
            THEN 'OK' ELSE 'MISSING' END;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — run only to undo this file. Deletes every announcement, group
-- and announcement notification.
-- ═══════════════════════════════════════════════════════════════════════════
/*
  DELETE FROM public.notifications WHERE type = 'announcement';
  ALTER TABLE public.notifications DROP COLUMN IF EXISTS announcement_id;
  ALTER PUBLICATION supabase_realtime DROP TABLE public.announcements;
  DROP TABLE IF EXISTS public.announcements;               -- its triggers go with it
  DROP TABLE IF EXISTS public.announcement_group_members;
  DROP TABLE IF EXISTS public.announcement_groups;
  DROP FUNCTION IF EXISTS public.announcements_notify();
  DROP FUNCTION IF EXISTS public.announcements_guard();
  DROP FUNCTION IF EXISTS public.owns_announcement_group(UUID, UUID);
  DROP FUNCTION IF EXISTS public.in_announcement_group(UUID, UUID);
  -- has_role is left in place: the other migrations rely on it.
*/
