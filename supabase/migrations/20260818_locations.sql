-- ═══════════════════════════════════════════════════════════════════════════
-- FacultyTrack — Location registry for QR check-in points
-- 2026-08-18
--
-- Rooms were previously not persisted: the printed QR carried the room name and
-- the status it implied, and nothing on the server knew the room existed. That
-- kept the feature migration-free, but it meant a printed sheet could never be
-- corrected or retired — the paper WAS the record.
--
-- This table makes the room the record. A code now encodes the row's id, so:
--   * renaming a room, or changing the status it sets, takes effect on every
--     sheet already printed and posted, with no reprinting
--   * deactivating or deleting a room retires its sheets immediately
--   * the list survives a browser change and is shared across administrators
--
-- Codes printed before this migration encoded the name and status directly.
-- The check-in page still accepts that older form, so existing sheets keep
-- working; they simply cannot be edited centrally.
--
-- Purely additive: creates one table and its policies, and touches nothing else.
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


-- ── 2. The table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'classroom'
              CHECK (kind IN ('classroom','lab','office','meeting','library','other')),
  -- The status a check-in here sets. Same vocabulary as staff_status, minus the
  -- three absent states: you cannot scan a room to declare yourself off campus.
  status      TEXT NOT NULL DEFAULT 'available'
              CHECK (status IN ('available','in-class','in-lab','meeting','busy','on-break','away')),
  -- Deactivating retires the printed sheets without destroying the record, so
  -- past check-ins in the activity log still refer to something that exists.
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Case-insensitive uniqueness: "Room 310" and "room 310" are the same room, and
-- two rows with the same name would mean two sheets nobody can tell apart.
CREATE UNIQUE INDEX IF NOT EXISTS locations_name_unique
  ON public.locations (lower(name));

CREATE INDEX IF NOT EXISTS locations_active_idx ON public.locations (active);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;


-- ── 3. Row-Level Security ──────────────────────────────────────────────────

-- Any signed-in user may read a room: a faculty member scanning a code needs to
-- resolve it, and the row holds nothing sensitive.
DROP POLICY IF EXISTS "locations_select" ON public.locations;
CREATE POLICY "locations_select" ON public.locations
  FOR SELECT TO authenticated
  USING (true);

-- Only administrators may create, change or remove one.
DROP POLICY IF EXISTS "locations_insert" ON public.locations;
CREATE POLICY "locations_insert" ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "locations_update" ON public.locations;
CREATE POLICY "locations_update" ON public.locations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "locations_delete" ON public.locations;
CREATE POLICY "locations_delete" ON public.locations
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- ── 4. Keep updated_at honest ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.locations_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS locations_touch_trg ON public.locations;
CREATE TRIGGER locations_touch_trg
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.locations_touch();


-- ── 5. Realtime ────────────────────────────────────────────────────────────
ALTER TABLE public.locations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public' AND tablename = 'locations'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;
  END IF;
END $$;


-- ── 6. Verify ──────────────────────────────────────────────────────────────
SELECT 'table' AS item, 'locations' AS name,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema='public' AND table_name='locations')
            THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'policies', 'locations (expect 4)',
       COALESCE((SELECT COUNT(*)::text FROM pg_policies
                 WHERE schemaname='public' AND tablename='locations'), '0')
UNION ALL
SELECT 'unique index', 'lower(name)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE schemaname='public' AND indexname='locations_name_unique')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'function', 'public.has_role',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='has_role')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'rows', 'locations', COUNT(*)::text FROM public.locations;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — run only to undo this file.
-- ═══════════════════════════════════════════════════════════════════════════
/*
  DROP TRIGGER IF EXISTS locations_touch_trg ON public.locations;
  DROP FUNCTION IF EXISTS public.locations_touch();
  ALTER PUBLICATION supabase_realtime DROP TABLE public.locations;
  DROP TABLE IF EXISTS public.locations;
  -- has_role is left in place: 20260814b and the escalation fix both rely on it.
*/
