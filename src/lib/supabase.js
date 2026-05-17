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

  -- 5. Enable Realtime on staff_status
  ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_status;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;

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
