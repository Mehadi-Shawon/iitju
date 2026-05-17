import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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