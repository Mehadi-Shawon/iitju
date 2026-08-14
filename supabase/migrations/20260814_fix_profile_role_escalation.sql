-- ═══════════════════════════════════════════════════════════════════════════
-- FacultyTrack — SEPARATE FIX: privilege escalation via profiles.role
-- 2026-08-14
--
-- This is NOT part of the submission feature. It repairs a pre-existing hole in
-- the original schema that the submission feature happens to depend on.
--
-- THE PROBLEM
--   The existing policy is:
--     CREATE POLICY "profiles_update_own" ON public.profiles
--       FOR UPDATE TO authenticated USING (auth.uid() = id);
--
--   In PostgreSQL, an UPDATE policy that omits WITH CHECK reuses its USING
--   expression as the new-row check. So the ONLY invariant enforced is that the
--   row's id stays equal to auth.uid() — the `role` column is freely writable
--   by its owner, and 'admin' satisfies the table's CHECK constraint.
--
--   Any signed-in user can therefore send
--     PATCH /rest/v1/profiles?id=eq.<their own uid>   {"role":"admin"}
--   using the public anon key, and become an admin.
--
--   That matters more now: every admin branch in the submission policies is a
--   plain read of profiles.role, so a self-promoted student could read every
--   student's private thesis PDF, delete submissions, and grade their own work.
--
-- THE FIX
--   A BEFORE UPDATE trigger that lets only an admin change `role` or
--   `student_id`. Role reads move to a SECURITY DEFINER helper so the check
--   cannot itself be subverted by RLS.
--
-- WHAT IT DOES NOT DO
--   No existing policy is dropped or altered, and no row is modified. Every
--   current profile update path keeps working: only updateUserRole() in
--   AdminUsersPage touches `role`, and it runs as an admin.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Trustworthy role lookup ─────────────────────────────────────────────
-- SECURITY DEFINER so the lookup is not filtered by the caller's own RLS, and
-- search_path is pinned so the function cannot be redirected at a shadow table.
CREATE OR REPLACE FUNCTION public.has_role(uid UUID, want TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = want
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated;


-- ── 2. Pin the privileged columns ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is NULL under service_role and in the SQL Editor. Allowing that
  -- case keeps the documented "invite the first admin by hand" bootstrap — and
  -- the recovery path if you ever lock yourself out — working.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.student_id IS DISTINCT FROM OLD.student_id)
     AND NOT public.has_role(auth.uid(), 'admin')
  THEN
    RAISE EXCEPTION 'profiles: role and student_id may only be changed by an admin';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_trg ON public.profiles;
CREATE TRIGGER profiles_guard_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();


-- ── 3. Verify ──────────────────────────────────────────────────────────────
SELECT 'function' AS object, 'public.has_role' AS name,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p
                         JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname='public' AND p.proname='has_role')
            THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'trigger', 'profiles_guard_trg',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgname='profiles_guard_trg' AND NOT tgisinternal)
            THEN 'OK' ELSE 'MISSING' END;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — run only to undo this file.
-- ═══════════════════════════════════════════════════════════════════════════
/*
  DROP TRIGGER IF EXISTS profiles_guard_trg ON public.profiles;
  DROP FUNCTION IF EXISTS public.profiles_guard();
  DROP FUNCTION IF EXISTS public.has_role(UUID, TEXT);
*/
