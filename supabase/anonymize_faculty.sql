-- ═══════════════════════════════════════════════════════════════════════════
-- FacultyTrack — Replace real faculty names and photos with made-up ones
-- 2026-10-17
--
-- Faculty may not be shown by their real name or photo without their consent.
-- Every faculty account is renamed to a clearly made-up name, "Faculty Member
-- 01", "Faculty Member 02", … in the order the accounts were created, so no
-- name can match a real teacher by chance. Titles (Prof., Dr. …) and photos
-- go too, since either can identify someone on its own.
--
-- What changes, for faculty accounts only (role = 'staff'):
--   * profiles: the made-up name; title and photo link cleared
--   * the login account's metadata (auth.users), where the sign-up form kept
--     its own copy of the real name and title
--   * notifications that quote a real faculty name are deleted. They were
--     written from the old name ("Dr. … accepted your meeting request") and
--     would keep showing it.
-- What does not change:
--   * logins: email addresses and passwords stay exactly as they are
--   * students and admins
--   * statuses, requests, submissions, announcements, classrooms: they still
--     belong to the same accounts and now show the made-up names
--   * text people typed themselves (messages, notes, feedback)
--
-- BEFORE RUNNING
--   Take a backup with supabase/backup_snapshot.sql (step 2) and keep the
--   result. It covers profiles and notifications, the two tables changed
--   here; the real names cannot be brought back without it.
--
-- AFTER RUNNING
--   The photo files are still in the public `avatars` bucket, and anyone with
--   a link can still open them. The result of this script lists them: delete
--   those in Supabase Dashboard → Storage → avatars.
--
-- Safe to re-run: renamed accounts keep their numbers, and only notifications
-- quoting a name that is not already made-up are deleted.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. The made-up names, numbered in account-creation order ───────────────
CREATE TEMP TABLE faculty_rename AS
SELECT id,
       full_name AS old_name,
       'Faculty Member ' || CASE WHEN n < 10 THEN '0' || n ELSE n::text END AS new_name
  FROM (
    SELECT id, full_name, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
      FROM public.profiles
     WHERE role = 'staff'
  ) numbered;

-- ── 2. Notifications quoting a real name, removed while the name is known ──
DELETE FROM public.notifications n
 USING faculty_rename f
 WHERE f.old_name !~ '^Faculty Member [0-9]+$'
   AND position(f.old_name IN n.body) > 0;

-- ── 3. Profiles ────────────────────────────────────────────────────────────
UPDATE public.profiles p
   SET full_name  = f.new_name,
       honorific  = NULL,
       avatar_url = NULL
  FROM faculty_rename f
 WHERE p.id = f.id;

-- ── 4. The login account's own copy of the name ────────────────────────────
-- In its own block so that, if this project does not allow editing auth.users
-- from the SQL Editor, the steps above still go through and a notice says so.
DO $$
BEGIN
  UPDATE auth.users u
     SET raw_user_meta_data = (COALESCE(u.raw_user_meta_data, '{}'::jsonb) - 'honorific')
                              || jsonb_build_object('full_name', f.new_name)
    FROM faculty_rename f
   WHERE u.id = f.id;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Login metadata left unchanged (%). Names and photos in the app were still replaced.', SQLERRM;
END $$;

DROP TABLE faculty_rename;

COMMIT;

-- ── 5. Result: every faculty account, and the photo files to delete ────────
SELECT p.full_name AS faculty,
       p.email     AS login_email,
       CASE WHEN p.full_name ~ '^Faculty Member [0-9]+$' AND p.honorific IS NULL AND p.avatar_url IS NULL
            THEN 'OK' ELSE 'CHECK' END AS profile,
       COALESCE((SELECT string_agg(o.name, ', ' ORDER BY o.name)
                   FROM storage.objects o
                  WHERE o.bucket_id = 'avatars' AND o.name LIKE p.id::text || '.%'),
                '—') AS delete_in_storage
  FROM public.profiles p
 WHERE p.role = 'staff'
 ORDER BY p.full_name;
