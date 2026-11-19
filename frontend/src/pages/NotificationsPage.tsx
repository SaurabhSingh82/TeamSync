import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  AtSign,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  LoaderCircle,
  Mail,
  MessageSquare,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import {
  listNotifications,
  markAllNotificationsRead,
  setNotificationReadState,
} from '../notifications/api'
import { publishUnreadNotificationCount } from '../notifications/events'
import type { NotificationItem } from '../notifications/types'
import { formatTimestamp } from '../projects/format'
import { useRealtime } from '../realtime/useRealtime'
import { useToast } from '../components/ui/ToastProvider'

interface KindMeta {
  label: string
  icon: LucideIcon
  badgeBg: string
  badgeText: string
  iconBg: string
  iconColor: string
  defaultActionLabel: string
}

const KIND_META: Record<string, KindMeta> = {
  workspace_invitation: {
    label: 'Workspace Invitation',
    icon: Mail,
    badgeBg: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
    badgeText: 'text-violet-700',
    iconBg: 'bg-gradient-to-br from-violet-500 to-indigo-600',
    iconColor: 'text-white',
    defaultActionLabel: 'Review invitation',
  },
  invitation_accepted: {
    label: 'Invitation Accepted',
    icon: CheckCircle2,
    badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    badgeText: 'text-emerald-700',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    iconColor: 'text-white',
    defaultActionLabel: 'View member',
  },
  task_assigned: {
    label: 'Task Assigned',
    icon: UserPlus,
    badgeBg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300',
    badgeText: 'text-indigo-700',
    iconBg: 'bg-gradient-to-br from-indigo-500 to-blue-600',
    iconColor: 'text-white',
    defaultActionLabel: 'Open task',
  },
  task_unassigned: {
    label: 'Task Unassigned',
    icon: UserMinus,
    badgeBg: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    badgeText: 'text-slate-700',
    iconBg: 'bg-slate-500',
    iconColor: 'text-white',
    defaultActionLabel: 'View task',
  },
  task_comment: {
    label: 'New Comment',
    icon: MessageSquare,
    badgeBg: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
    badgeText: 'text-sky-700',
    iconBg: 'bg-gradient-to-br from-sky-500 to-blue-600',
    iconColor: 'text-white',
    defaultActionLabel: 'View comment',
  },
  task_mention: {
    label: 'Mentioned You',
    icon: AtSign,
    badgeBg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
    badgeText: 'text-purple-700',
    iconBg: 'bg-gradient-to-br from-purple-500 to-pink-600',
    iconColor: 'text-white',
    defaultActionLabel: 'View mention',
  },
  deadline_today: {
    label: 'Due Today',
    icon: Clock,
    badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    badgeText: 'text-amber-700',
    iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    iconColor: 'text-white',
    defaultActionLabel: 'Open task',
  },
  deadline_overdue: {
    label: 'Overdue Task',
    icon: AlertTriangle,
    badgeBg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
    badgeText: 'text-rose-700',
    iconBg: 'bg-gradient-to-br from-rose-500 to-red-600',
    iconColor: 'text-white',
    defaultActionLabel: 'Review task',
  },
}

const DEFAULT_META: KindMeta = {
  label: 'Update',
  icon: Bell,
  badgeBg: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  badgeText: 'text-slate-700',
  iconBg: 'bg-teamsync-navy',
  iconColor: 'text-white',
  defaultActionLabel: 'View details',
}

function formatRelativeTime(dateString: string): string {
  try {
    const diffMs = Date.now() - new Date(dateString).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'Just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return formatTimestamp(dateString)
  } catch {
    return dateString
  }
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { show } = useToast()

  const load = useCallback(
    async (filterUnread: boolean, requestedPage: number, append: boolean) => {
      setLoading(true)
      setError('')
      try {
        const result = await listNotifications({
          unreadOnly: filterUnread ? true : undefined,
          page: requestedPage,
        })
        setNotifications((current) =>
          append ? [...current, ...result.results] : result.results,
        )
        setCount(result.count)
        setPage(requestedPage)
        setHasMore(result.next !== null)
      } catch (loadError) {
        setError(getApiErrorMessage(loadError))
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useRealtime('/ws/notifications/', (event) => {
    if (
      event.type === 'resync.required' ||
      event.type.startsWith('notification.') ||
      event.type.startsWith('notifications.') ||
      event.type.startsWith('invitation.')
    ) {
      void load(unreadOnly, 1, false)
    }
  })

  useEffect(() => {
    let active = true
    void listNotifications({ unreadOnly: unreadOnly ? true : undefined })
      .then((result) => {
        if (!active) return
        setNotifications(result.results)
        setCount(result.count)
        setPage(1)
        setHasMore(result.next !== null)
        setError('')
      })
      .catch((loadError: unknown) => {
        if (active) setError(getApiErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [unreadOnly])

  async function handleReadState(notification: NotificationItem, read: boolean) {
    setBusy(true)
    setError('')
    try {
      const updated = await setNotificationReadState(notification.id, read)
      if (unreadOnly && read) {
        setNotifications((items) => items.filter((item) => item.id !== updated.id))
        setCount((current) => Math.max(0, current - 1))
      } else {
        setNotifications((items) =>
          items.map((item) => (item.id === updated.id ? updated : item)),
        )
      }
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function handleMarkAllRead() {
    setBusy(true)
    setError('')
    try {
      await markAllNotificationsRead()
      if (unreadOnly) {
        setNotifications([])
        setCount(0)
      } else {
        setNotifications((items) =>
          items.map((item) => ({ ...item, read_at: new Date().toISOString() })),
        )
      }
      publishUnreadNotificationCount(0)
      show({
        variant: 'success',
        title: 'All caught up!',
        message: 'All notifications have been marked as read.',
        duration: 3500,
      })
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  const unreadCountInList = notifications.filter((n) => !n.read_at).length

  return (
    <section className="mx-auto max-w-4xl pb-12">
      {/* ── Page Header ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teamsync-navy">
            <Bell aria-hidden="true" size={20} />
            <p className="text-sm font-semibold tracking-wide">Activity feed</p>
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-950">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Stay updated with workspace invitations, assignments, and discussions.
          </p>
        </div>

        {/* ── Top Actions ── */}
        <div className="flex items-center gap-3">
          {/* Segmented Filter Pills */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
            <button
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                !unreadOnly
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => {
                if (unreadOnly) {
                  setLoading(true)
                  setUnreadOnly(false)
                }
              }}
              type="button"
            >
              All
            </button>
            <button
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                unreadOnly
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => {
                if (!unreadOnly) {
                  setLoading(true)
                  setUnreadOnly(true)
                }
              }}
              type="button"
            >
              <span>Unread</span>
              {unreadCountInList > 0 && (
                <span className="grid size-4 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {unreadCountInList}
                </span>
              )}
            </button>
          </div>

          {/* Mark All Read Button */}
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            disabled={busy || count === 0}
            onClick={() => void handleMarkAllRead()}
            type="button"
          >
            <CheckCheck aria-hidden="true" size={15} />
            <span>Mark all read</span>
          </button>
        </div>
      </div>

      {error && (
        <p
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* ── Notifications List Container ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        {notifications.map((notification) => {
          const isUnread = !notification.read_at
          const meta = KIND_META[notification.kind] ?? DEFAULT_META
          const IconComponent = meta.icon

          return (
            <article
              className={`group relative flex items-start gap-4 border-b border-slate-100 p-5 transition last:border-0 hover:bg-slate-50/70 ${
                isUnread ? 'bg-indigo-50/20' : ''
              }`}
              key={notification.id}
            >
              {/* Unread Left Border Highlight Indicator */}
              {isUnread && (
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-indigo-500 to-violet-600"
                />
              )}

              {/* Kind Icon Badge */}
              <span
                className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${meta.iconBg} shadow-xs`}
                aria-hidden="true"
              >
                <IconComponent className={meta.iconColor} size={18} strokeWidth={2.2} />
              </span>

              {/* Notification Content */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${meta.badgeBg}`}
                    >
                      {meta.label}
                    </span>
                    {isUnread && (
                      <span className="inline-flex size-2 rounded-full bg-indigo-600" title="Unread" />
                    )}
                  </div>
                  <time
                    className="text-xs text-slate-400"
                    dateTime={notification.created_at}
                    title={formatTimestamp(notification.created_at)}
                  >
                    {formatRelativeTime(notification.created_at)}
                  </time>
                </div>

                <h2 className="mt-1.5 text-sm font-semibold text-slate-900">
                  {notification.title}
                </h2>

                {notification.message && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {notification.message}
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  {notification.actor_name && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="grid size-4 place-items-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700">
                        {notification.actor_name[0].toUpperCase()}
                      </span>
                      <span>From {notification.actor_name}</span>
                    </span>
                  )}

                  {notification.target_url && (
                    <Link
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 hover:underline"
                      onClick={() => {
                        if (!notification.read_at) {
                          void handleReadState(notification, true)
                        }
                      }}
                      to={notification.target_url}
                    >
                      <span>{meta.defaultActionLabel}</span>
                      <ArrowRight aria-hidden="true" size={13} />
                    </Link>
                  )}
                </div>
              </div>

              {/* Quick Mark Read / Unread Action */}
              <button
                aria-label={notification.read_at ? 'Mark unread' : 'Mark read'}
                className={`grid size-9 shrink-0 place-items-center rounded-xl transition ${
                  isUnread
                    ? 'border border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                } disabled:opacity-50`}
                disabled={busy}
                onClick={() => void handleReadState(notification, !notification.read_at)}
                title={notification.read_at ? 'Mark unread' : 'Mark read'}
                type="button"
              >
                {busy ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                ) : (
                  <Check aria-hidden="true" size={16} strokeWidth={isUnread ? 2.5 : 2} />
                )}
              </button>
            </article>
          )
        })}

        {loading && (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <LoaderCircle aria-hidden="true" className="animate-spin text-indigo-600" size={20} />
            <span>Loading notifications…</span>
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <BellOff aria-hidden="true" size={22} />
            </div>
            <h3 className="font-semibold text-slate-800">
              {unreadOnly ? 'You are all caught up.' : 'No notifications yet.'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {unreadOnly
                ? 'Check back later or view all updates.'
                : 'Workspace updates and task activity will appear here in real time.'}
            </p>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {hasMore && !loading && (
        <button
          className="mt-5 min-h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900"
          onClick={() => void load(unreadOnly, page + 1, true)}
          type="button"
        >
          Load more notifications
        </button>
      )}
    </section>
  )
}
