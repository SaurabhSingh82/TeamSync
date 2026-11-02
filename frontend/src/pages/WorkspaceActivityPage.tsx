import { useCallback, useEffect, useState } from 'react'
import { Activity, LoaderCircle } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { listWorkspaceActivity } from '../notifications/api'
import type { ActivityEvent } from '../notifications/types'
import { formatTimestamp } from '../projects/format'

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
    <section className="mx-auto max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-teamsync-navy">
          <Activity aria-hidden="true" size={20} />
          <p className="text-sm font-semibold">Workspace timeline</p>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Activity</h1>
        <p className="mt-2 text-sm text-slate-600">Recent project and collaboration updates visible to you.</p>
      </div>
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {events.map((event) => (
          <article className="flex gap-4 border-b border-slate-100 p-4 last:border-0" key={event.id}>
            <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
              <Activity aria-hidden="true" size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">{event.actor_name}</span>{' '}
                  {eventLabels[event.event_type] ?? event.event_type.replaceAll('_', ' ')}
                </p>
                <time className="text-xs text-slate-500" dateTime={event.created_at}>
                  {formatTimestamp(event.created_at)}
                </time>
              </div>
              {event.task_id && (
                <Link
                  className="mt-1 inline-block max-w-full truncate text-sm font-medium text-teamsync-navy hover:underline"
                  to={`/workspaces/${workspaceId}/projects/${event.project_id}/tasks/${event.task_id}`}
                >
                  {event.task_title}
                </Link>
              )}
              {event.project_name && <p className="mt-1 text-xs text-slate-500">{event.project_name}</p>}
            </div>
          </article>
        ))}
        {loading && (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
            <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
            Loading activity...
          </p>
        )}
        {!loading && events.length === 0 && (
          <p className="p-10 text-center text-sm text-slate-500">No activity to show yet.</p>
        )}
      </div>
      {hasMore && !loading && (
        <button
          className="mt-5 min-h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => void load(page + 1, true)}
          type="button"
        >
          Load more
        </button>
      )}
    </section>
  )
}
