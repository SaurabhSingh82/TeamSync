import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'

import { getApiErrorMessage } from '../../auth/errors'
import { useAuth } from '../../auth/useAuth'
import { WorkspaceSelector } from '../workspaces/WorkspaceSelector'

const linkClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-slate-100 text-slate-950'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
  }`

export function AppLayout() {
  const { error: authError, loading, logout, user } = useAuth()
  const [logoutError, setLogoutError] = useState('')

  async function handleLogout() {
    setLogoutError('')
    try {
      await logout()
    } catch (error) {
      setLogoutError(getApiErrorMessage(error))
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <NavLink
            to="/"
            className="text-lg font-semibold tracking-tight text-slate-950"
          >
            TeamSync
          </NavLink>
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            <NavLink to="/" end className={linkClassName}>
              Home
            </NavLink>
            <NavLink to="/dashboard" className={linkClassName}>
              Dashboard
            </NavLink>
            {!loading &&
              (user ? (
                <>
                  <WorkspaceSelector userId={user.id} />
                  <NavLink to="/profile" className={linkClassName}>
                    Profile
                  </NavLink>
                  <button
                    className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    onClick={() => void handleLogout()}
                    type="button"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className={linkClassName}>
                    Sign in
                  </NavLink>
                  <NavLink to="/register" className={linkClassName}>
                    Create account
                  </NavLink>
                </>
              ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        {(authError || logoutError) && (
          <p role="alert" className="mb-6 rounded-md bg-red-50 p-3 text-sm text-red-800">
            {logoutError || authError}
          </p>
        )}
        <Outlet />
      </main>
    </div>
  )
}
