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
    status       TEXT NOT NULL CHECK (status IN ('available','meeting','away','offline'))
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

  -- 5. Enable Realtime on staff_status
  ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_status;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_requests;

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
