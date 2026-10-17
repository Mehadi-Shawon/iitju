import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️  Supabase env vars missing. Copy .env.example → .env and fill in your values.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

// Separate client for admin user-creation only.
// signUp() with email confirmation off returns a live session — using a
// non-persisting client means that session is never written to localStorage,
// so the currently-logged-in admin is not signed out.
export const anonClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      storageKey: 'stafftrack-user-ops',
      persistSession: false,
      autoRefreshToken: false,
    },
  }
)

/*
  ─────────────────────────────────────────────────────────
  SUPABASE SCHEMA  (run this SQL in your Supabase SQL editor)
  ─────────────────────────────────────────────────────────

  -- 1. profiles table (extends auth.users)
  CREATE TABLE public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('admin','staff','student')),
    honorific   TEXT,
    department  TEXT,
    student_id  TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  -- Add honorific to an existing profiles table (skip if creating fresh):
  -- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS honorific TEXT;

  -- 2. staff_status table
  CREATE TABLE public.staff_status (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- All ten values the UI offers. If your database was created before
    -- 2026-08-15 it has the original four-value constraint; apply
    -- supabase/migrations/20260815_widen_staff_status_check.sql to widen it.
    status       TEXT NOT NULL CHECK (status IN
                   ('available','in-class','in-lab','meeting','busy',
                    'on-break','away','off-campus','on-leave','offline'))
                 DEFAULT 'offline',
    location     TEXT DEFAULT '',
    note         TEXT DEFAULT '',
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  );

  -- 3. activity_log table
  CREATE TABLE public.activity_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  -- 4. Row-Level Security
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.staff_status ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

  -- profiles: anyone authenticated can read; users update own row; admins do anything
  CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
  CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
  CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

  -- staff_status: authenticated can read; staff update own; admins do anything
  CREATE POLICY "status_select" ON public.staff_status FOR SELECT TO authenticated USING (true);
  CREATE POLICY "status_update_own" ON public.staff_status FOR UPDATE TO authenticated USING (staff_id = auth.uid());
  CREATE POLICY "status_insert_own" ON public.staff_status FOR INSERT TO authenticated WITH CHECK (staff_id = auth.uid());
  CREATE POLICY "status_admin_all" ON public.staff_status FOR ALL TO authenticated
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

  -- activity_log: authenticated can read; insert by authenticated
  --
  -- USING (true) is load-bearing: useStaffList() subscribes to activity_log
  -- INSERT events as its realtime fallback, and Supabase Realtime applies RLS
  -- per subscriber, so narrowing this would stop students receiving the events
  -- that keep the faculty directory live. Nothing private may be written here —
  -- thesis submission titles and review outcomes go to thesis_submissions only.
  CREATE POLICY "log_select" ON public.activity_log FOR SELECT TO authenticated USING (true);
  CREATE POLICY "log_insert" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);

  -- 4b. notifications table
  CREATE TABLE public.notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    request_id  UUID REFERENCES public.schedule_requests(id) ON DELETE CASCADE,
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

  -- Each user reads only their own notifications
  CREATE POLICY "notif_select" ON public.notifications FOR SELECT TO authenticated
    USING (user_id = auth.uid());

  -- Any authenticated user can create a notification (students → faculty, faculty → students)
  CREATE POLICY "notif_insert" ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (true);

  -- Users can mark their own notifications as read
  CREATE POLICY "notif_update" ON public.notifications FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

  -- 4c. schedule_requests table
  CREATE TABLE public.schedule_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    staff_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject         TEXT NOT NULL,
    message         TEXT DEFAULT '',
    preferred_date  DATE NOT NULL,
    preferred_time  TIME NOT NULL,
    duration_mins   INT DEFAULT 30,
    status          TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')) DEFAULT 'pending',
    staff_note      TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  );

  ALTER TABLE public.schedule_requests ENABLE ROW LEVEL SECURITY;

  -- Students see own requests; staff see incoming; admins see all
  CREATE POLICY "requests_select" ON public.schedule_requests FOR SELECT TO authenticated
    USING (
      student_id = auth.uid()
      OR staff_id = auth.uid()
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

  -- Only students can create requests (must be their own student_id)
  CREATE POLICY "requests_insert" ON public.schedule_requests FOR INSERT TO authenticated
    WITH CHECK (
      student_id = auth.uid()
      AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'student'
    );

  -- Students can cancel own pending; staff can respond; admins can do anything
  CREATE POLICY "requests_update" ON public.schedule_requests FOR UPDATE TO authenticated
    USING (
      student_id = auth.uid()
      OR staff_id = auth.uid()
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

  -- 4d. thesis_submissions table (student → assigned faculty)
  --
  -- A resubmission is a NEW row, never an edit: version 2+ rows point at the
  -- first row of their chain via parent_id, so the full revision history is
  -- preserved and visible on both ends. Chain root = parent_id ?? id.
  CREATE TABLE public.thesis_submissions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    staff_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    doc_type     TEXT NOT NULL CHECK (doc_type IN ('thesis','project')) DEFAULT 'thesis',
    abstract     TEXT DEFAULT '',
    file_path    TEXT NOT NULL,          -- object path inside the `submissions` bucket
    file_name    TEXT NOT NULL,          -- original filename, for display
    file_size    INT,                    -- bytes
    version      INT NOT NULL DEFAULT 1,
    parent_id    UUID REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
    status       TEXT NOT NULL CHECK (status IN
                   ('submitted','under_review','approved','rejected'))
                 DEFAULT 'submitted',
    feedback     TEXT DEFAULT '',
    reviewed_at  TIMESTAMPTZ,
    reviewed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX thesis_submissions_student_idx ON public.thesis_submissions(student_id);
  CREATE INDEX thesis_submissions_staff_idx   ON public.thesis_submissions(staff_id);

  ALTER TABLE public.thesis_submissions ENABLE ROW LEVEL SECURITY;

  -- Students see own; the assigned faculty sees theirs only; admins see all
  CREATE POLICY "submissions_select" ON public.thesis_submissions FOR SELECT TO authenticated
    USING (
      student_id = auth.uid()
      OR staff_id = auth.uid()
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

  -- Only students can submit, and only in their own name
  CREATE POLICY "submissions_insert" ON public.thesis_submissions FOR INSERT TO authenticated
    WITH CHECK (
      student_id = auth.uid()
      AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'student'
    );

  -- Only the assigned faculty (or an admin) can review. Students are deliberately
  -- excluded from UPDATE so a student cannot approve or re-grade their own work.
  CREATE POLICY "submissions_update" ON public.thesis_submissions FOR UPDATE TO authenticated
    USING (
      staff_id = auth.uid()
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

  -- Link notifications to a submission. Kept separate from request_id, whose FK
  -- points at schedule_requests and would reject a submission id.
  ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS submission_id UUID
    REFERENCES public.thesis_submissions(id) ON DELETE CASCADE;

  -- 4e. Private storage bucket for submitted PDFs
  --
  -- public = false: thesis drafts are unpublished work, so they are served only
  -- through short-lived signed URLs, never a permanent public URL like avatars.
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('submissions', 'submissions', false, 15728640, ARRAY['application/pdf'])
  ON CONFLICT (id) DO NOTHING;

  -- Path convention: {student_uid}/{uuid}_v{n}.pdf — the first folder is the owner
  CREATE POLICY "submission_files_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'submissions'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  -- Readable by the owning student, the faculty it was submitted to, and admins
  CREATE POLICY "submission_files_select" ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'submissions'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR EXISTS (
          SELECT 1 FROM public.thesis_submissions s
          WHERE s.file_path = storage.objects.name AND s.staff_id = auth.uid()
        )
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
      )
    );

  -- 4f. locations table (QR check-in points)
  --
  -- A printed room code encodes this row's id, not its name, so renaming a
  -- room or changing the status it sets takes effect on sheets already posted.
  -- Created by supabase/migrations/20260818_locations.sql.
  CREATE TABLE public.locations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'classroom'
                CHECK (kind IN ('classroom','lab','office','meeting','library','other')),
    status      TEXT NOT NULL DEFAULT 'available'
                CHECK (status IN ('available','in-class','in-lab','meeting','busy','on-break','away')),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE UNIQUE INDEX locations_name_unique ON public.locations (lower(name));

  ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

  -- Anyone signed in may resolve a scanned code; only admins may manage rooms
  CREATE POLICY "locations_select" ON public.locations FOR SELECT TO authenticated USING (true);
  CREATE POLICY "locations_insert" ON public.locations FOR INSERT TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  CREATE POLICY "locations_update" ON public.locations FOR UPDATE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  CREATE POLICY "locations_delete" ON public.locations FOR DELETE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

  -- 4g. Announcements (faculty → all students, or one of their own groups)
  --
  -- A group is a faculty member's own named set of students. Recipients are
  -- notified by a trigger, and a guard trigger lets only the topic and message
  -- change after posting. Created by
  -- supabase/migrations/20261017_announcements.sql, which also holds the
  -- triggers and the two SECURITY DEFINER lookups the policies call.
  CREATE TABLE public.announcement_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE UNIQUE INDEX announcement_groups_owner_name_unique
    ON public.announcement_groups (owner_id, lower(name));

  CREATE TABLE public.announcement_group_members (
    group_id    UUID NOT NULL REFERENCES public.announcement_groups(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, student_id)
  );

  CREATE TABLE public.announcements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    audience    TEXT NOT NULL CHECK (audience IN ('all','group')),
    group_id    UUID REFERENCES public.announcement_groups(id) ON DELETE CASCADE,
    title       TEXT NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 200),
    body        TEXT NOT NULL CHECK (btrim(body)  <> '' AND char_length(body)  <= 5000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT announcements_audience_group CHECK ((audience = 'group') = (group_id IS NOT NULL))
  );

  ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS announcement_id UUID
    REFERENCES public.announcements(id) ON DELETE CASCADE;

  ALTER TABLE public.announcement_groups        ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.announcement_group_members ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.announcements              ENABLE ROW LEVEL SECURITY;

  -- Groups: the owner manages them; a member may read the group's name
  CREATE POLICY "ann_groups_select" ON public.announcement_groups FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR public.in_announcement_group(id, auth.uid()));
  CREATE POLICY "ann_groups_insert" ON public.announcement_groups FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));
  CREATE POLICY "ann_groups_update" ON public.announcement_groups FOR UPDATE TO authenticated
    USING      (owner_id = auth.uid() AND public.has_role(auth.uid(), 'staff'))
    WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));
  CREATE POLICY "ann_groups_delete" ON public.announcement_groups FOR DELETE TO authenticated
    USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));

  -- Members: only the owner adds or removes them, and only student accounts
  CREATE POLICY "ann_members_select" ON public.announcement_group_members FOR SELECT TO authenticated
    USING (student_id = auth.uid() OR public.owns_announcement_group(group_id, auth.uid()));
  CREATE POLICY "ann_members_insert" ON public.announcement_group_members FOR INSERT TO authenticated
    WITH CHECK (public.owns_announcement_group(group_id, auth.uid())
                AND public.has_role(auth.uid(), 'staff')
                AND public.has_role(student_id, 'student'));
  CREATE POLICY "ann_members_delete" ON public.announcement_group_members FOR DELETE TO authenticated
    USING (public.owns_announcement_group(group_id, auth.uid()) AND public.has_role(auth.uid(), 'staff'));

  -- Announcements: students read the posts for all students and for their
  -- groups; faculty post (to their own groups only), edit and delete their own
  CREATE POLICY "announcements_select" ON public.announcements FOR SELECT TO authenticated
    USING (author_id = auth.uid()
           OR (audience = 'all'   AND public.has_role(auth.uid(), 'student'))
           OR (audience = 'group' AND public.in_announcement_group(group_id, auth.uid())));
  CREATE POLICY "announcements_insert" ON public.announcements FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid()
                AND public.has_role(auth.uid(), 'staff')
                AND (audience = 'all' OR public.owns_announcement_group(group_id, auth.uid())));
  CREATE POLICY "announcements_update" ON public.announcements FOR UPDATE TO authenticated
    USING      (author_id = auth.uid() AND public.has_role(auth.uid(), 'staff'))
    WITH CHECK (author_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));
  CREATE POLICY "announcements_delete" ON public.announcements FOR DELETE TO authenticated
    USING (author_id = auth.uid() AND public.has_role(auth.uid(), 'staff'));

  -- 4h. Classrooms (a group's chat, and the work its students submit)
  --
  -- A group from 4g is also a classroom. Every upload is its own class_files
  -- row and none can be changed or deleted, so those rows are the submission
  -- log. Created by supabase/migrations/20261017b_classrooms.sql, which also
  -- holds the triggers (server timestamps, version numbering, the teacher's
  -- notification) and the private `class-files` bucket with its policies.
  CREATE TABLE public.class_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES public.announcement_groups(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    body        TEXT NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 2000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE public.class_files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES public.announcement_groups(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES public.class_files(id) ON DELETE CASCADE,
    version     INT NOT NULL DEFAULT 1,
    file_path   TEXT NOT NULL UNIQUE,   -- {group_id}/{student_id}/{random}.{ext} in class-files
    file_name   TEXT NOT NULL CHECK (btrim(file_name) <> '' AND char_length(file_name) <= 255),
    file_size   INT CHECK (file_size >= 0),
    mime_type   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES public.announcement_groups(id) ON DELETE CASCADE;

  ALTER TABLE public.class_messages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.class_files    ENABLE ROW LEVEL SECURITY;

  -- Chat: the classroom's teacher and students read and write, in their own name
  CREATE POLICY "class_messages_select" ON public.class_messages FOR SELECT TO authenticated
    USING (public.owns_announcement_group(group_id, auth.uid())
           OR public.in_announcement_group(group_id, auth.uid()));
  CREATE POLICY "class_messages_insert" ON public.class_messages FOR INSERT TO authenticated
    WITH CHECK (sender_id = auth.uid()
                AND ((public.owns_announcement_group(group_id, auth.uid()) AND public.has_role(auth.uid(), 'staff'))
                     OR public.in_announcement_group(group_id, auth.uid())));

  -- Work: a student sees their own files, the teacher everyone's; only a
  -- student of the classroom submits, pointing at their own folder of it
  CREATE POLICY "class_files_select" ON public.class_files FOR SELECT TO authenticated
    USING (student_id = auth.uid() OR public.owns_announcement_group(group_id, auth.uid()));
  CREATE POLICY "class_files_insert" ON public.class_files FOR INSERT TO authenticated
    WITH CHECK (student_id = auth.uid()
                AND public.has_role(auth.uid(), 'student')
                AND public.in_announcement_group(group_id, auth.uid())
                AND file_path LIKE group_id::text || '/' || auth.uid()::text || '/%');

  -- 5. Enable Realtime on staff_status
  ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_status;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_requests;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.thesis_submissions;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.class_messages;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.class_files;

  -- 6. Function to auto-create profile + status on signup
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    INSERT INTO public.profiles (id, full_name, email, role, honorific, department, student_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
      NEW.raw_user_meta_data->>'honorific',
      NEW.raw_user_meta_data->>'department',
      NEW.raw_user_meta_data->>'student_id'
    );
    IF COALESCE(NEW.raw_user_meta_data->>'role', 'student') = 'staff' THEN
      INSERT INTO public.staff_status (staff_id) VALUES (NEW.id);
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
*/
