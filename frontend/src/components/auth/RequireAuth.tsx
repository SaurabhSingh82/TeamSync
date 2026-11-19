import { useEffect, useState } from 'react'
import { Navigate, useLocation, Link } from 'react-router'
import type { ReactNode } from 'react'

import { useAuth } from '../../auth/useAuth'
import { CenteredLoader } from '../ui/Loading'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const location = useLocation()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => {
      setTimedOut(true)
    }, 8000)
    return () => clearTimeout(timer)
  }, [loading])

  if (loading) {
    if (timedOut) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center" role="alert">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Session check is taking longer than expected
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            The server may be starting up or temporarily unreachable.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="teamsync-primary-button rounded-lg px-4 py-2 text-xs font-semibold"
            >
              Retry
            </button>
            <Link
              to="/login"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Go to Login
            </Link>
          </div>
        </div>
      )
    }
    return <CenteredLoader message="Checking your session…" />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}
