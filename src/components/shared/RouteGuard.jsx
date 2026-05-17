import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/ui'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={36} />
    </div>
  )
}

export function RequireAuth({ children, roles }) {
  const { session, profile, loading } = useAuth()

  // loading now covers both session check + profile fetch
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />

  if (roles) {
    // loading is false here, so profile fetch is done.
    // If profile is still null the row doesn't exist — treat as unauthorized.
    if (!profile || !roles.includes(profile.role)) return <Navigate to="/app/dashboard" replace />
  }

  return children
}

export function RedirectIfAuthed({ children }) {
  const { session, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (session) return <Navigate to="/app/dashboard" replace />

  return children
}