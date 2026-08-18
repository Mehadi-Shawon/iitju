-- ═══════════════════════════════════════════════════════════════════════════
-- FacultyTrack — FIX: staff_status only accepts 4 of the 10 statuses the UI offers
--
-- THE BUG
--   staff_status.status was created with
--     CHECK (status IN ('available','meeting','away','offline'))
--   but the app offers ten values. Six of them — in-class, in-lab, on-break,
--   busy, off-campus, on-leave — are rejected by Postgres with SQLSTATE 23514,
--   surfaced to the faculty member as a raw red error toast. Those six include
--   In Class and In Lab, where a lecturer spends most of the working day.
--
--   The frontend has always supported all ten: StatusBadge maps them, index.css
--   defines ten badge-* and ten status-dot-* pairs, the dashboard filter row
--   lists them and the admin override offers them. Only this constraint lagged.
--
-- WHAT ELSE THIS DOES
--   Sets REPLICA IDENTITY FULL so Supabase Realtime can evaluate RLS on UPDATE
--   events for this table. Without it, staff_status UPDATE events are not
--   reliably delivered, which is why useStaffList() carries an activity_log
--   fallback subscription (see the comment at src/hooks/useData.js:55).
--
-- Safe to re-run. No row is modified and no data is lost — widening a CHECK
-- cannot reject anything already stored.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Widen the constraint ────────────────────────────────────────────────
-- Dropped by name first. The name below is the Postgres default for a column
-- CHECK on this table; the DO block afterwards catches any other name.
ALTER TABLE public.staff_status DROP CONSTRAINT IF EXISTS staff_status_status_check;

-- Belt and braces, in case the constraint was created under a different name.
-- Matched on the COLUMN the constraint actually covers (via conkey), not on the
-- text of its definition — a text match on '%status%' would also catch an
-- unrelated constraint that merely mentioned the word.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.staff_status'::regclass
      AND con.contype = 'c'
      AND EXISTS (
        SELECT 1
        FROM unnest(con.conkey) AS k
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid AND att.attnum = k
        WHERE att.attname = 'status'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.staff_status DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.staff_status
  ADD CONSTRAINT staff_status_status_check
  CHECK (status IN (
    'available',
    'in-class',
    'in-lab',
    'meeting',
    'busy',
    'on-break',
    'away',
    'off-campus',
    'on-leave',
    'offline'
  ));


-- ── 2. Realtime: let UPDATE events pass RLS ────────────────────────────────
ALTER TABLE public.staff_status REPLICA IDENTITY FULL;


-- ── 3. Verify ──────────────────────────────────────────────────────────────
-- The `constraint` row should print a definition listing all ten values, and
-- `replica identity` should read FULL. Nothing is written by this block.
-- `item` rather than `check`: CHECK is a reserved word, and quoting rules for
-- reserved words as column labels vary — not worth the risk in a file someone
-- pastes into a dashboard.
SELECT 'constraint' AS item,
       COALESCE(
         (SELECT pg_get_constraintdef(oid)
          FROM pg_constraint
          WHERE conrelid = 'public.staff_status'::regclass
            AND conname = 'staff_status_status_check'),
         'NONE — every status will be accepted, which is not intended'
       ) AS result
UNION ALL
SELECT 'replica identity',
       CASE relreplident WHEN 'f' THEN 'FULL (ok)' ELSE 'not FULL — realtime UPDATEs may not arrive' END
FROM pg_class WHERE oid = 'public.staff_status'::regclass
UNION ALL
SELECT 'rows currently stored', COUNT(*)::text FROM public.staff_status;
