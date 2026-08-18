import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { writeStaffStatus, ABSENT_STATUSES } from '@/lib/staffStatus'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session ?? null)
        if (session) fetchProfile(session.user.id)
      })
      .catch(() => setSession(null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
      if (session) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setProfileLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    setProfileLoading(true)
    try {
      // maybeSingle() returns null (not 400) when no row exists
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (data) setProfile(data)
    } finally {
      setProfileLoading(false)
    }
  }

  async function signIn({ email, password }) {
    return await supabase.auth.signInWithPassword({ email, password })
  }

  async function signInWithStudentId(studentId) {
    const email = `${studentId.toLowerCase()}@student.stafftrack.app`
    return await supabase.auth.signInWithPassword({ email, password: studentId })
  }

  async function signOut() {
    // Signing out is the clearest "I am done for the day" signal a faculty
    // member can give, and it used to change nothing students saw — leaving them
    // green and Available in the directory indefinitely. Best-effort: a failure
    // here must never block the sign-out itself.
    if (profile?.role === 'staff') {
      try {
        // Don't flatten a deliberate absence. "On Leave · Back Sep 1" is
        // information the directory is showing on purpose, and overwriting it
        // with a bare "Offline" destroys it with no undo. Only close out a
        // status that still claims presence.
        const { data: rows } = await supabase
          .from('staff_status')
          .select('status')
          .eq('staff_id', profile.id)
          .order('updated_at', { ascending: false })
          .limit(1)

        const current = rows?.[0]?.status
        if (!ABSENT_STATUSES.includes(current)) {
          // location is cleared because it no longer holds; the note is left
          // alone, since it is the user's own words and not a presence claim.
          await writeStaffStatus(profile.id, { status: 'offline', location: '' })
          await supabase.from('activity_log').insert({
            staff_id: profile.id,
            action: 'status_update',
            detail: 'Status set to offline · signed out',
          })
        }
      } catch (e) {
        console.error('sign-out status update failed:', e)
      }
    }

    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }

  // Only block on profileLoading when we don't have a profile yet.
  // Token refreshes re-run fetchProfile but shouldn't unmount pages.
  const loading = session === undefined || (profileLoading && profile === null)

  const value = {
    session: session ?? null,
    profile,
    loading,
    role: profile?.role ?? null,
    isAdmin: profile?.role === 'admin',
    isStaff: profile?.role === 'staff',
    isStudent: profile?.role === 'student',
    signIn,
    signInWithStudentId,
    signOut,
    refreshProfile: () => session && fetchProfile(session.user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}