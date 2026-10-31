import { Navigate, useLocation } from 'react-router'
import type { ReactNode } from 'react'

import { useAuth } from '../../auth/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="text-sm text-slate-600">Checking your session…</p>
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}
