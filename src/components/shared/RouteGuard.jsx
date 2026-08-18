import { Navigate, useLocation } from 'react-router-dom'
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
  const location = useLocation()

  // loading now covers both session check + profile fetch
  if (loading) return <LoadingScreen />
  // Carry the intended destination through login, so scanning a location QR
  // while signed out still lands on that location's check-in after signing in
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

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