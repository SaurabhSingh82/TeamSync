import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  Bell,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleUserRound,
  FolderKanban,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  Moon,
  Search,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { getApiErrorMessage } from '../../auth/errors'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../ui/Avatar'
import { WorkspaceSelector } from '../workspaces/WorkspaceSelector'
import { listNotifications } from '../../notifications/api'
import { notificationsUpdatedEvent, publishUnreadNotificationCount } from '../../notifications/events'
import { acceptReceivedInvitation, rejectReceivedInvitation } from '../../workspaces/api'
import { useRealtime } from '../../realtime/useRealtime'
import { useToast } from '../ui/ToastProvider'
import teamsyncLogo from '../../assets/teamsync-logo.svg'
import {
  clearStoredWorkspaceId,
  getStoredWorkspaceId,
  setStoredWorkspaceId,
  workspaceIdFromPath,
} from '../../workspaces/activeWorkspace'

function navClassName(isActive: boolean) {
  return `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition ${
    isActive
      ? 'bg-slate-100 font-semibold text-slate-950 dark:bg-slate-800 dark:text-slate-100'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
  }`
}

type SidebarItem = {
  label: string
  icon: LucideIcon
  to?: string
  workspacePath?: (workspaceId: string) => string
  end?: boolean
  notifications?: boolean
}

type Theme = 'light' | 'dark'

let unreadCountRequest: Promise<number> | null = null

function loadUnreadNotificationCount() {
  unreadCountRequest ??= listNotifications({ unreadOnly: true, pageSize: 1 })
    .then((result) => result.count)
    .finally(() => {
      unreadCountRequest = null
    })
  return unreadCountRequest
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem('teamsync.theme') === 'dark' ? 'dark' : 'light'
}

const sidebarItems: SidebarItem[] = [
  { label: 'Home', icon: Home, to: '/', end: true },
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Calendar', icon: CalendarDays, to: '/calendar' },
  { label: 'Analytics', icon: ChartNoAxesColumnIncreasing, to: '/analytics' },
  { label: 'Search', icon: Search, to: '/search' },
  { label: 'Notifications', icon: Bell, to: '/notifications', notifications: true },
  { label: 'Invitations', icon: Mail, to: '/invitations' },
  {
    label: 'Projects',
    icon: FolderKanban,
    workspacePath: (workspaceId) => `/workspaces/${workspaceId}/projects`,
  },
  {
    label: 'Members',
    icon: Users,
    workspacePath: (workspaceId) => `/workspaces/${workspaceId}/members`,
  },
  {
    label: 'Activity',
    icon: Activity,
    workspacePath: (workspaceId) => `/workspaces/${workspaceId}/activity`,
  },
  {
    label: 'Workspace settings',
    icon: Settings,
    workspacePath: (workspaceId) => `/workspaces/${workspaceId}`,
    end: true,
  },
  { label: 'Profile', icon: CircleUserRound, to: '/profile' },
]

export function AppLayout() {
  const { error: authError, loading, logout, user } = useAuth()
  const [logoutError, setLogoutError] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const unreadCountRef = useRef(unreadCount)
  unreadCountRef.current = unreadCount
  const [notificationError, setNotificationError] = useState('')
  const [hoveredSidebarItem, setHoveredSidebarItem] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const location = useLocation()
  const navigate = useNavigate()
  const { showInvitation, show } = useToast()
  const routeWorkspaceId = workspaceIdFromPath(location.pathname)
  const activeWorkspaceId = routeWorkspaceId ?? (user ? getStoredWorkspaceId(user.id) : null)

  useEffect(() => {
    if (!user) return
    const selectedWorkspaceId = routeWorkspaceId ?? getStoredWorkspaceId(user.id)
    if (selectedWorkspaceId) setStoredWorkspaceId(user.id, selectedWorkspaceId)
  }, [routeWorkspaceId, user])

  useEffect(() => {
    if (!user || loading) return
    let active = true
    const refreshUnreadCount = async () => {
      try {
        const count = await loadUnreadNotificationCount()
        if (active) {
          setUnreadCount(count)
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

  useEffect(() => {
    const handleNotificationsUpdated = (event: Event) => {
      const { unreadCount } = (event as CustomEvent<{ unreadCount: number }>).detail
      if (typeof unreadCount === 'number') setUnreadCount(unreadCount)
    }
    window.addEventListener(notificationsUpdatedEvent, handleNotificationsUpdated)
    return () => window.removeEventListener(notificationsUpdatedEvent, handleNotificationsUpdated)
  }, [])

  useEffect(() => {
    const isDark = theme === 'dark'
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.style.backgroundColor = isDark ? '#010409' : '#f5f7fa'
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    window.localStorage.setItem('teamsync.theme', theme)
  }, [theme])

  // ── Real-time WebSocket: instant badge + toasts ───────────────────────────
  const handleRealtimeEvent = useCallback(
    (event: { type: string; payload?: Record<string, unknown> }) => {
      if (!user) return

      if (event.type === 'resync.required') {
        // Reconnect: re-fetch real unread count from API
        void loadUnreadNotificationCount().then((count) => {
          setUnreadCount(count)
          publishUnreadNotificationCount(count)
        })
        return
      }

      if (event.type === 'notification.created') {
        const isUnread = event.payload?.unread === true
        if (isUnread) {
          const next = unreadCountRef.current + 1
          setUnreadCount(next)
          publishUnreadNotificationCount(next)
        }
        return
      }

      if (event.type === 'invitation.created') {
        const p = event.payload ?? {}
        const workspaceName = String(p.workspace_name ?? 'a workspace')
        const inviterName = String(p.invited_by_name ?? 'Someone')
        const role = String(p.role ?? 'member')
        const invitationId = String(p.invitation_id ?? '')
        const message = p.message ? String(p.message) : undefined
        const workspaceId = p.workspace_id ? String(p.workspace_id) : undefined

        showInvitation({
          invitationId,
          workspaceId,
          workspaceName,
          inviterName,
          role,
          message,
          onAccept: async () => {
            const res = await acceptReceivedInvitation(invitationId)
            show({
              variant: 'success',
              title: 'Welcome aboard!',
              message: `You have successfully joined "${res.workspace.name}".`,
              duration: 4000,
            })
            navigate(`/workspaces/${res.workspace.id}`)
          },
          onReject: async () => {
            await rejectReceivedInvitation(invitationId)
            show({
              variant: 'info',
              title: 'Invitation Declined',
              message: `Declined invitation to "${workspaceName}".`,
              duration: 3500,
            })
          },
          onView: () => {
            void navigate(
              invitationId
                ? `/invitations?invitation=${invitationId}`
                : '/invitations',
            )
          },
        })
        return
      }

      if (event.type === 'notifications.read_all') {
        setUnreadCount(0)
        publishUnreadNotificationCount(0)
        return
      }

      if (event.type === 'notification.read_state') {
        const isRead = event.payload?.read === true
        // On mark-read: decrement; on mark-unread: increment (guard ≥0)
        setUnreadCount((prev) => {
          const next = isRead ? Math.max(0, prev - 1) : prev + 1
          publishUnreadNotificationCount(next)
          return next
        })
      }
    },
    [user, showInvitation, show, navigate],
  )

  useRealtime(user ? '/ws/notifications/' : null, handleRealtimeEvent)
  // ─────────────────────────────────────────────────────────────────────────

  async function handleLogout() {
    setLogoutError('')
    try {
      await logout()
      clearStoredWorkspaceId(user?.id ?? '')
    } catch (error) {
      setLogoutError(getApiErrorMessage(error))
    }
  }

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-teamsync-canvas">
        <header className="theme-header border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
            <Link className="flex items-center gap-2" to="/">
              <img alt="TeamSync" className="size-9 object-contain" src={teamsyncLogo} />
              <span className="teamsync-brand-name">TeamSync</span>
            </Link>
            {!loading && (
              <nav aria-label="Account navigation" className="flex items-center gap-2">
                <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
                <NavLink className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" to="/login">
                  Sign in
                </NavLink>
                <NavLink className="teamsync-primary-button rounded-lg px-3 py-2 text-sm font-semibold" to="/register">
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
  const renderSidebarItem = (item: SidebarItem, variant: 'icon' | 'label') => {
    const Icon = item.icon
    const to = item.workspacePath
      ? activeWorkspaceId
        ? item.workspacePath(activeWorkspaceId)
        : null
      : item.to ?? null
    const commonClassName =
      variant === 'icon'
        ? 'grid size-11 place-items-center rounded-xl transition'
        : 'flex h-11 items-center rounded-lg px-3 text-sm font-medium transition'

    if (!to) {
      return (
        <span
          aria-disabled="true"
          className={`${commonClassName} ${
            variant === 'icon'
              ? hoveredSidebarItem === item.label
                ? 'bg-white/10 text-white'
                : 'text-slate-500'
              : hoveredSidebarItem === item.label
                ? 'bg-slate-50 text-slate-400'
                : 'text-slate-300'
          }`}
          key={item.label}
          onMouseEnter={() => setHoveredSidebarItem(item.label)}
          onMouseLeave={() => setHoveredSidebarItem(null)}
          title={item.label}
        >
          {variant === 'icon' && <Icon aria-hidden="true" size={19} />}
          {variant === 'label' && item.label}
        </span>
      )
    }

    return (
      <NavLink
        aria-label={item.label}
        className={({ isActive }) =>
          variant === 'icon'
            ? `${commonClassName} ${
                isActive
                  ? 'bg-white text-teamsync-navy'
                  : hoveredSidebarItem === item.label
                    ? 'bg-white/10 text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`
            : `${commonClassName} ${
                isActive
                  ? navClassName(true)
                  : hoveredSidebarItem === item.label
                    ? 'bg-slate-50 text-slate-950'
                    : navClassName(false)
              }`
        }
        end={item.end}
        key={item.label}
        onMouseEnter={() => setHoveredSidebarItem(item.label)}
        onMouseLeave={() => setHoveredSidebarItem(null)}
        title={variant === 'icon' ? item.label : undefined}
        to={to}
      >
        {variant === 'icon' ? (
          <span className="relative">
            <Icon aria-hidden="true" size={19} />
          {variant === 'icon' && item.notifications && unreadCount > 0 && (
            <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          </span>
        ) : (
          item.label
        )}
      </NavLink>
    )
  }

  return (
    <div className="min-h-screen bg-teamsync-canvas text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center bg-teamsync-navy py-5 text-white md:flex">
        <Link
          aria-label="TeamSync home"
          className="mb-8 grid size-10 place-items-center"
          to="/"
        >
          <img alt="" className="size-9 object-contain" src={teamsyncLogo} />
        </Link>
        <nav aria-label="Primary navigation" className="flex flex-1 flex-col items-center gap-1">
          {sidebarItems.map((item) => renderSidebarItem(item, 'icon'))}
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

      <aside className="fixed inset-y-0 left-[72px] z-20 hidden w-64 flex-col border-r border-slate-200 bg-white px-3.5 py-4 dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="teamsync-brand-name mb-5 flex h-8 items-center px-2.5 text-base font-bold">
          TeamSync
        </div>
        <nav aria-label="Workspace navigation" className="flex flex-1 flex-col gap-0.5">
          {sidebarItems.map((item) => renderSidebarItem(item, 'label'))}
        </nav>
        <Link className="mt-auto rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200" to="/workspaces/new">
          + New workspace
        </Link>
      </aside>

      <div className="min-h-screen md:pl-[328px]">
        <header className="theme-header sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800">
          <div className="flex min-h-[56px] items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3 md:hidden">
              <Link aria-label="TeamSync home" className="grid size-9 shrink-0 place-items-center" to="/">
                <img alt="" className="size-8 object-contain" src={teamsyncLogo} />
              </Link>
              <span className="teamsync-brand-name">TeamSync</span>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceSelector selectId="workspace-selector" userId={user.id} />
              <Link
                aria-label="Quick search"
                className="hidden items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-500 shadow-2xs transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800 lg:flex"
                to="/search"
              >
                <Search aria-hidden="true" className="text-slate-400" size={13} />
                <span>Search…</span>
                <kbd className="ml-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                  /
                </kbd>
              </Link>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
              <Link
                aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                className="relative grid size-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                to="/notifications"
              >
                <Bell aria-hidden="true" size={19} />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs ring-2 ring-white">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                    <span className="relative text-[9px] font-bold">{unreadCount > 99 ? '99+' : unreadCount}</span>
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
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 md:hidden"
                to="/profile"
              >
                Profile
              </Link>
              <button
                aria-label="Sign out"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 md:hidden"
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
            <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`} to="/search">
              Search
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
        <main className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6 lg:py-6">
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

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const isDark = theme === 'dark'
  const Icon = isDark ? Sun : Moon
  return (
    <button
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="grid size-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
      onClick={onToggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      type="button"
    >
      <Icon aria-hidden="true" size={19} />
    </button>
  )
}
