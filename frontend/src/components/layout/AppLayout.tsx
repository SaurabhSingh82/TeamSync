import { useEffect, useState } from 'react'
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleUserRound,
  FolderKanban,
  Home,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'

import { getApiErrorMessage } from '../../auth/errors'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../ui/Avatar'
import { WorkspaceSelector } from '../workspaces/WorkspaceSelector'
import { listNotifications } from '../../notifications/api'

function navClassName(isActive: boolean) {
  return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-slate-100 text-slate-950'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
  }`
}

export function AppLayout() {
  const { error: authError, loading, logout, user } = useAuth()
  const [logoutError, setLogoutError] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationError, setNotificationError] = useState('')
  const location = useLocation()
  const workspaceId = location.pathname.match(/^\/workspaces\/([^/]+)/)?.[1]
  const activeWorkspaceId = workspaceId && workspaceId !== 'new' ? workspaceId : null

  useEffect(() => {
    if (!user || loading) return
    let active = true
    const refreshUnreadCount = async () => {
      try {
        const result = await listNotifications({ unreadOnly: true, pageSize: 1 })
        if (active) {
          setUnreadCount(result.count)
          setNotificationError('')
        }
      } catch (error) {
        if (active) {
          setNotificationError(
            `Notification count could not be refreshed: ${getApiErrorMessage(error)}`,
          )
        }
      }
    }
    void refreshUnreadCount()
    const intervalId = window.setInterval(() => void refreshUnreadCount(), 60_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [loading, user])

  async function handleLogout() {
    setLogoutError('')
    try {
      await logout()
    } catch (error) {
      setLogoutError(getApiErrorMessage(error))
    }
  }

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-teamsync-canvas">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
            <Link className="flex items-center gap-2 font-semibold text-slate-950" to="/">
              <span className="grid size-9 place-items-center rounded-xl bg-teamsync-navy text-sm font-bold text-white">
                T
              </span>
              TeamSync
            </Link>
            {!loading && (
              <nav aria-label="Account navigation" className="flex items-center gap-2">
                <NavLink className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" to="/login">
                  Sign in
                </NavLink>
                <NavLink className="rounded-lg bg-teamsync-navy px-3 py-2 text-sm font-semibold text-white hover:bg-teamsync-navy-light" to="/register">
                  Create account
                </NavLink>
              </nav>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
          {authError && (
            <p className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              {authError}
            </p>
          )}
          <Outlet />
        </main>
      </div>
    )
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')

  return (
    <div className="min-h-screen bg-teamsync-canvas text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center bg-teamsync-navy py-5 text-white md:flex">
        <Link
          aria-label="TeamSync home"
          className="mb-8 grid size-10 place-items-center rounded-xl bg-white/10 text-lg font-bold"
          to="/"
        >
          T
        </Link>
        <nav aria-label="Primary navigation" className="flex flex-1 flex-col items-center gap-2">
          <NavLink
            aria-label="Home"
            className={({ isActive }) => `grid size-11 place-items-center rounded-xl transition ${isActive ? 'bg-white text-teamsync-navy' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            end
            title="Home"
            to="/"
          >
            <Home aria-hidden="true" size={19} />
          </NavLink>
          <NavLink
            aria-label="Dashboard"
            className={({ isActive }) => `grid size-11 place-items-center rounded-xl transition ${isActive ? 'bg-white text-teamsync-navy' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            title="Dashboard"
            to="/dashboard"
          >
            <LayoutDashboard aria-hidden="true" size={19} />
          </NavLink>
          <NavLink
            aria-label="Calendar"
            className={({ isActive }) => `grid size-11 place-items-center rounded-xl transition ${isActive ? 'bg-white text-teamsync-navy' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            title="Calendar"
            to="/calendar"
          >
            <CalendarDays aria-hidden="true" size={19} />
          </NavLink>
          <NavLink
            aria-label="Analytics"
            className={({ isActive }) => `grid size-11 place-items-center rounded-xl transition ${isActive ? 'bg-white text-teamsync-navy' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            title="Analytics"
            to="/analytics"
          >
            <ChartNoAxesColumnIncreasing aria-hidden="true" size={19} />
          </NavLink>
          <NavLink
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            className={({ isActive }) => `relative grid size-11 place-items-center rounded-xl transition ${isActive ? 'bg-white text-teamsync-navy' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            title="Notifications"
            to="/notifications"
          >
            <Bell aria-hidden="true" size={19} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </NavLink>
          {activeWorkspaceId && (
            <NavLink
              aria-label="Projects"
              className={({ isActive }) => `grid size-11 place-items-center rounded-xl transition ${isActive ? 'bg-white text-teamsync-navy' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
              title="Projects"
              to={`/workspaces/${activeWorkspaceId}/projects`}
            >
              <FolderKanban aria-hidden="true" size={19} />
            </NavLink>
          )}
          <NavLink
            aria-label="Profile"
            className={({ isActive }) => `grid size-11 place-items-center rounded-xl transition ${isActive ? 'bg-white text-teamsync-navy' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            title="Profile"
            to="/profile"
          >
            <CircleUserRound aria-hidden="true" size={19} />
          </NavLink>
        </nav>
        <button
          aria-label="Sign out"
          className="grid size-11 place-items-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white"
          onClick={() => void handleLogout()}
          title="Sign out"
          type="button"
        >
          <LogOut aria-hidden="true" size={19} />
        </button>
      </aside>

      <aside className="fixed inset-y-0 left-[72px] z-20 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 md:flex">
        <Link className="mb-7 flex items-center gap-2 px-2 font-semibold tracking-tight text-slate-950" to="/">
          <span className="grid size-8 place-items-center rounded-lg bg-teamsync-navy text-xs font-bold text-white">T</span>
          TeamSync
        </Link>
        {activeWorkspaceId ? (
          <nav aria-label="Workspace navigation" className="mt-7 space-y-1">
            <NavLink className={({ isActive }) => navClassName(isActive)} to="/dashboard">
              <LayoutDashboard aria-hidden="true" size={17} />
              Dashboard
            </NavLink>
            <NavLink className={({ isActive }) => navClassName(isActive)} to="/calendar">
              <CalendarDays aria-hidden="true" size={17} />
              Calendar
            </NavLink>
            <NavLink className={({ isActive }) => navClassName(isActive)} to="/analytics">
              <ChartNoAxesColumnIncreasing aria-hidden="true" size={17} />
              Analytics
            </NavLink>
            <NavLink className={({ isActive }) => navClassName(isActive)} to={`/workspaces/${activeWorkspaceId}/projects`}>
              <FolderKanban aria-hidden="true" size={17} />
              Projects
            </NavLink>
            <NavLink className={({ isActive }) => navClassName(isActive)} to={`/workspaces/${activeWorkspaceId}/members`}>
              <Users aria-hidden="true" size={17} />
              Members
            </NavLink>
            <NavLink className={({ isActive }) => navClassName(isActive)} to={`/workspaces/${activeWorkspaceId}/activity`}>
              <Activity aria-hidden="true" size={17} />
              Activity
            </NavLink>
            <NavLink className={({ isActive }) => navClassName(isActive)} end to={`/workspaces/${activeWorkspaceId}`}>
              <Settings aria-hidden="true" size={17} />
              Workspace settings
            </NavLink>
          </nav>
        ) : (
          <div className="mt-7 rounded-xl border border-dashed border-slate-300 p-4">
            <BriefcaseBusiness aria-hidden="true" className="text-slate-400" size={20} />
            <p className="mt-3 text-sm font-semibold text-slate-800">Choose a workspace</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Projects and members appear here after you select a workspace.
            </p>
          </div>
        )}
        <Link className="mt-auto rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950" to="/workspaces/new">
          + New workspace
        </Link>
      </aside>

      <div className="min-h-screen md:pl-[328px]">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="flex min-h-[68px] items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3 md:hidden">
              <Link className="grid size-9 shrink-0 place-items-center rounded-xl bg-teamsync-navy text-sm font-bold text-white" to="/">
                T
              </Link>
            </div>
            <div className="min-w-0">
              <WorkspaceSelector selectId="workspace-selector" userId={user.id} />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Link
                aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                className="relative grid size-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
                to="/notifications"
              >
                <Bell aria-hidden="true" size={19} />
                {unreadCount > 0 && (
                  <span className="absolute right-0 top-0 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
              <Avatar
                alt={fullName || user.username}
                className="size-9"
                name={fullName || user.username}
                src={user.avatar}
              />
              <div className="hidden max-w-48 sm:block">
                <p className="truncate text-sm font-semibold text-slate-800">{fullName || user.username}</p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <Link
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                to="/profile"
              >
                Profile
              </Link>
              <button
                aria-label="Sign out"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => void handleLogout()}
                type="button"
              >
                <LogOut aria-hidden="true" className="sm:hidden" size={17} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
          <nav aria-label="Mobile navigation" className="flex gap-2 overflow-x-auto px-5 pb-3 md:hidden">
            <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} end to="/">
              Home
            </NavLink>
            <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} to="/dashboard">
              Dashboard
            </NavLink>
            <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} to="/calendar">
              Calendar
            </NavLink>
            <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} to="/analytics">
              Analytics
            </NavLink>
            <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} to="/notifications">
              Notifications{unreadCount > 0 ? ` (${unreadCount > 99 ? '99+' : unreadCount})` : ''}
            </NavLink>
            {activeWorkspaceId && (
              <>
              <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} to={`/workspaces/${activeWorkspaceId}/projects`}>
                Projects
              </NavLink>
              <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} to={`/workspaces/${activeWorkspaceId}/members`}>
                Members
              </NavLink>
              <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} to={`/workspaces/${activeWorkspaceId}/activity`}>
                Activity
              </NavLink>
              <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} end to={`/workspaces/${activeWorkspaceId}`}>
                Settings
              </NavLink>
              </>
            )}
            <Link className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" to="/workspaces/new">
              New workspace
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 lg:py-10">
          {(authError || logoutError || notificationError) && (
            <p className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              {logoutError || authError || notificationError}
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
