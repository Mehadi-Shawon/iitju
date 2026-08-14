-- ═══════════════════════════════════════════════════════════════════════════
-- FacultyTrack — manual data snapshot
--
-- A zero-tooling backup for a Free-plan Supabase project: run it in the SQL
-- Editor and copy the single result cell into a file on your machine.
--
-- Read-only. It creates nothing and changes nothing.
--
-- WHAT THIS COVERS
--   Every row of the five public tables. The schema itself is already version
--   controlled in src/lib/supabase.js and supabase/migrations/, so the data is
--   the only part that lives solely in the cloud.
--
-- WHAT THIS DOES NOT COVER
--   * auth.users — login accounts live in the auth schema and are not readable
--     here. Nothing in the submission migration touches auth.users, but be
--     aware that this snapshot alone cannot recreate logins.
--   * Storage objects — the files in the `avatars` bucket. Download them from
--     Storage in the dashboard if you want them.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── STEP 1. How big is the snapshot going to be? ───────────────────────────
-- Run this first. If these counts are in the hundreds, step 2 copies fine.
-- If any table is in the tens of thousands, export that one as CSV instead
-- (Table Editor → the table → ••• → Export as CSV).

SELECT 'profiles'          AS table_name, COUNT(*) AS rows FROM public.profiles
UNION ALL SELECT 'staff_status',       COUNT(*) FROM public.staff_status
UNION ALL SELECT 'activity_log',       COUNT(*) FROM public.activity_log
UNION ALL SELECT 'schedule_requests',  COUNT(*) FROM public.schedule_requests
UNION ALL SELECT 'notifications',      COUNT(*) FROM public.notifications
ORDER BY rows DESC;


-- ── STEP 2. The snapshot ───────────────────────────────────────────────────
-- Returns ONE row with ONE column of JSON. Click the cell, copy it, and save
-- it as e.g. facultytrack-backup-2026-08-14.json somewhere outside the repo.
--
-- json_agg returns NULL for an empty table, so COALESCE keeps the shape valid.

SELECT jsonb_pretty(
  jsonb_build_object(
    'taken_at', NOW(),
    'profiles',          COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.profiles t), '[]'::jsonb),
    'staff_status',      COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.staff_status t), '[]'::jsonb),
    'activity_log',      COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.activity_log t), '[]'::jsonb),
    'schedule_requests', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.schedule_requests t), '[]'::jsonb),
    'notifications',     COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.notifications t), '[]'::jsonb)
  )
) AS backup_json;


-- ── STEP 3. Record the "before" picture ────────────────────────────────────
-- Save this output too. After running the migration you can re-run it and
-- diff the two, which proves nothing pre-existing was altered.

SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname IN ('public','storage')
ORDER BY schemaname, tablename, policyname;
