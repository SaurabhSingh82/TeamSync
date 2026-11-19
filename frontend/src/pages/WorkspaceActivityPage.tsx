import { useCallback, useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { listWorkspaceActivity } from '../notifications/api'
import type { ActivityEvent } from '../notifications/types'
import { formatTimestamp } from '../projects/format'
import { InlineLoader } from '../components/ui/Loading'

const eventLabels: Record<string, string> = {
  created: 'created a task',
  updated: 'updated a task',
  moved: 'moved a task',
  assignment_added: 'updated task membership',
  assignment_removed: 'updated task membership',
  commented: 'commented on a task',
  replied: 'replied to a task comment',
  comment_updated: 'edited a task comment',
  comment_deleted: 'deleted a task comment',
  mentioned: 'mentioned a teammate',
  invitation_created: 'created a workspace invitation',
  invitation_accepted: 'accepted a workspace invitation',
  deadline_today: 'has a task due today',
  deadline_overdue: 'has an overdue task',
}

export function WorkspaceActivityPage() {
  const { workspaceId } = useParams()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (requestedPage: number, append: boolean) => {
    if (!workspaceId) return
    setLoading(true)
    setError('')
    try {
      const result = await listWorkspaceActivity(workspaceId, requestedPage)
      setEvents((current) => append ? [...current, ...result.results] : result.results)
      setPage(requestedPage)
      setHasMore(result.next !== null)
    } catch (loadError) {
      setError(getApiErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    let active = true
    void listWorkspaceActivity(workspaceId)
      .then((result) => {
        if (!active) return
        setEvents(result.results)
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
  }, [workspaceId])

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <div className="border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Activity aria-hidden="true" size={16} className="text-slate-500" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Workspace Stream</p>
        </div>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">Activity</h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Recent project deliverables, membership changes, and collaboration updates.</p>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        {events.map((event) => (
          <article className="flex gap-3 border-b border-slate-100 p-3.5 last:border-0 dark:border-slate-800/80" key={event.id}>
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <Activity aria-hidden="true" size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  <strong className="font-semibold text-slate-900 dark:text-slate-100">{event.actor_name}</strong>{' '}
                  {eventLabels[event.event_type] ?? event.event_type.replaceAll('_', ' ')}
                </p>
                <time className="text-[10px] text-slate-400" dateTime={event.created_at}>
                  {formatTimestamp(event.created_at)}
                </time>
              </div>
              {event.task_id && (
                <Link
                  className="mt-0.5 inline-block max-w-full truncate text-xs font-medium text-slate-900 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-indigo-400"
                  to={`/workspaces/${workspaceId}/projects/${event.project_id}/tasks/${event.task_id}`}
                >
                  {event.task_title}
                </Link>
              )}
              {event.project_name && <p className="text-[11px] text-slate-400">{event.project_name}</p>}
            </div>
          </article>
        ))}
        {loading && <InlineLoader message="Loading activity…" />}
        {!loading && events.length === 0 && (
          <p className="p-8 text-center text-xs text-slate-400">No activity to show yet in this workspace.</p>
        )}
      </div>
      {hasMore && !loading && (
        <button
          className="h-9 w-full rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => void load(page + 1, true)}
          type="button"
        >
          Load more
        </button>
      )}
    </section>
  )
}
