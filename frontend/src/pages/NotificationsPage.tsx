import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, CheckCheck, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import {
  listNotifications,
  markAllNotificationsRead,
  setNotificationReadState,
} from '../notifications/api'
import type { NotificationItem } from '../notifications/types'
import { formatTimestamp } from '../projects/format'

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (filterUnread: boolean, requestedPage: number, append: boolean) => {
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
  }, [])

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
          items.map((item) => item.id === updated.id ? updated : item),
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
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teamsync-navy">
            <Bell aria-hidden="true" size={20} />
            <p className="text-sm font-semibold">Your updates</p>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Notifications</h1>
          <p className="mt-2 text-sm text-slate-600">{count} {count === 1 ? 'notification' : 'notifications'}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              checked={unreadOnly}
              className="size-4 accent-teamsync-navy"
              onChange={(event) => {
                setLoading(true)
                setUnreadOnly(event.target.checked)
              }}
              type="checkbox"
            />
            Unread only
          </label>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={busy || count === 0}
            onClick={() => void handleMarkAllRead()}
            type="button"
          >
            <CheckCheck aria-hidden="true" size={16} />
            Mark all read
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {notifications.map((notification) => (
          <article
            className={`flex gap-4 border-b border-slate-100 p-5 last:border-0 ${notification.read_at ? '' : 'bg-blue-50/40'}`}
            key={notification.id}
          >
            <span className={`mt-1 grid size-9 shrink-0 place-items-center rounded-full ${notification.read_at ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-800'}`}>
              <Bell aria-hidden="true" size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="font-semibold text-slate-900">{notification.title}</h2>
                <time className="text-xs text-slate-500" dateTime={notification.created_at}>
                  {formatTimestamp(notification.created_at)}
                </time>
              </div>
              {notification.message && <p className="mt-1 text-sm text-slate-600">{notification.message}</p>}
              <p className="mt-2 text-xs text-slate-500">From {notification.actor_name}</p>
              {notification.target_url && (
                <Link
                  className="mt-3 inline-flex text-sm font-semibold text-teamsync-navy hover:underline"
                  onClick={() => {
                    if (!notification.read_at) void handleReadState(notification, true)
                  }}
                  to={notification.target_url}
                >
                  View task
                </Link>
              )}
            </div>
            <button
              aria-label={notification.read_at ? 'Mark unread' : 'Mark read'}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
              disabled={busy}
              onClick={() => void handleReadState(notification, !notification.read_at)}
              title={notification.read_at ? 'Mark unread' : 'Mark read'}
              type="button"
            >
              {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} /> : <Check aria-hidden="true" size={17} />}
            </button>
          </article>
        ))}
        {loading && (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
            <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
            Loading notifications...
          </p>
        )}
        {!loading && notifications.length === 0 && (
          <p className="p-10 text-center text-sm text-slate-500">
            {unreadOnly ? 'You are all caught up.' : 'No notifications yet.'}
          </p>
        )}
      </div>
      {hasMore && !loading && (
        <button
          className="mt-5 min-h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => void load(unreadOnly, page + 1, true)}
          type="button"
        >
          Load more
        </button>
      )}
    </section>
  )
}
