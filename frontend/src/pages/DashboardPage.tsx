import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FolderKanban,
  ListTodo,
  LoaderCircle,
} from 'lucide-react'
import { Link } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { getDashboardSummary } from '../dashboard/api'
import type { DashboardSummary } from '../dashboard/types'
import { formatDate, formatTimestamp } from '../projects/format'

const activityLabels: Record<string, string> = {
  created: 'created a task',
  updated: 'updated a task',
  moved: 'moved a task',
  assignment_added: 'updated task membership',
  assignment_removed: 'updated task membership',
  commented: 'commented on a task',
  replied: 'replied to a task',
  mentioned: 'mentioned a teammate',
  invitation_created: 'created a workspace invitation',
  invitation_accepted: 'accepted a workspace invitation',
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getDashboardSummary()
      .then((result) => {
        if (!active) return
        setSummary(result)
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
  }, [])

  return (
    <section aria-labelledby="dashboard-title" className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teamsync-navy">Your workspace at a glance</p>
          <h1 id="dashboard-title" className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            A live overview of projects, tasks, deadlines, and recent activity you can access.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" to="/calendar">
            Calendar <ArrowRight aria-hidden="true" size={16} />
          </Link>
          <Link className="teamsync-primary-button inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold" to="/analytics">
            Analytics <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </header>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {loading && (
        <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
          Loading your dashboard...
        </p>
      )}
      {!loading && summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<FolderKanban aria-hidden="true" size={19} />}
              label="Accessible projects"
              value={summary.projects.total}
              detail={`${summary.projects.active} active`}
            />
            <MetricCard
              icon={<ListTodo aria-hidden="true" size={19} />}
              label="Open tasks"
              value={summary.tasks.open}
              detail={`${summary.tasks.total} non-archived tasks`}
            />
            <MetricCard
              icon={<CheckCircle2 aria-hidden="true" size={19} />}
              label="Completed tasks"
              value={summary.tasks.completed}
              detail="Across accessible projects"
            />
            <MetricCard
              icon={<CircleAlert aria-hidden="true" size={19} />}
              label="My overdue tasks"
              value={summary.my_workload.overdue}
              detail={`${summary.my_workload.due_soon} due in the next 7 days`}
              alert={summary.my_workload.overdue > 0}
            />
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-slate-950">Upcoming deadlines</h2>
                  <p className="mt-1 text-xs text-slate-500">Your assigned open tasks due in the next 7 days.</p>
                </div>
                <Link className="text-sm font-semibold text-teamsync-navy hover:underline" to="/calendar">Calendar</Link>
              </div>
              {summary.upcoming_tasks.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {summary.upcoming_tasks.map((task) => (
                    <li className="flex items-center justify-between gap-4 px-5 py-4" key={task.id}>
                      <div className="min-w-0">
                        <Link className="block truncate text-sm font-semibold text-slate-800 hover:text-teamsync-navy hover:underline" to={`/workspaces/${task.workspace_id}/projects/${task.project_id}/tasks/${task.id}`}>
                          {task.title}
                        </Link>
                        <p className="mt-1 truncate text-xs text-slate-500">{task.project_name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium text-slate-700">{task.due_date ? formatDate(task.due_date) : 'No date'}</p>
                        <p className="mt-1 text-xs capitalize text-slate-500">{task.status.replaceAll('_', ' ')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-8 text-center text-sm text-slate-500">No assigned deadlines in the next 7 days.</p>
              )}
              {summary.my_workload.overdue_tasks.length > 0 && (
                <div className="border-t border-slate-100">
                  <div className="px-5 py-3">
                    <h3 className="text-sm font-semibold text-red-800">Overdue</h3>
                    <p className="mt-1 text-xs text-slate-500">Assigned tasks past their due date.</p>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {summary.my_workload.overdue_tasks.map((task) => (
                      <li className="flex items-center justify-between gap-4 px-5 py-4" key={task.id}>
                        <div className="min-w-0">
                          <Link className="block truncate text-sm font-semibold text-red-800 hover:underline" to={`/workspaces/${task.workspace_id}/projects/${task.project_id}/tasks/${task.id}`}>
                            {task.title}
                          </Link>
                          <p className="mt-1 truncate text-xs text-slate-500">{task.project_name}</p>
                        </div>
                        <p className="shrink-0 text-sm font-medium text-red-700">
                          {task.due_date ? formatDate(task.due_date) : 'No date'}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-slate-950">Recent activity</h2>
                  <p className="mt-1 text-xs text-slate-500">Updates from projects you can access.</p>
                </div>
                <Link className="text-sm font-semibold text-teamsync-navy hover:underline" to="/analytics">Progress</Link>
              </div>
              {summary.recent_activity.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {summary.recent_activity.map((event) => (
                    <li className="px-5 py-4" key={event.id}>
                      <p className="text-sm leading-5 text-slate-700">
                        <span className="font-semibold text-slate-900">{event.actor_name}</span>{' '}
                        {activityLabels[event.event_type] ?? event.event_type.replaceAll('_', ' ')}
                        {event.task_id && (
                          <>
                            {' '}
                            <Link className="font-medium text-teamsync-navy hover:underline" to={`/workspaces/${event.workspace_id}/projects/${event.project_id}/tasks/${event.task_id}`}>
                              {event.task_title}
                            </Link>
                          </>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.project_name ? `${event.project_name} · ` : ''}{formatTimestamp(event.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-8 text-center text-sm text-slate-500">There is no recent activity yet.</p>
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-950">Task status</h2>
                <p className="mt-1 text-xs text-slate-500">Counts include non-archived tasks in accessible, non-archived projects.</p>
              </div>
              <Link className="text-sm font-semibold text-teamsync-navy hover:underline" to="/analytics">View analytics</Link>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['To do', 'todo'],
                ['In progress', 'in_progress'],
                ['In review', 'review'],
                ['Completed', 'completed'],
              ].map(([label, status]) => (
                <div className="rounded-xl bg-slate-50 p-4" key={status}>
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.tasks.by_status[status] ?? 0}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {!loading && !summary && !error && (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Dashboard data is not available right now.
        </p>
      )}
    </section>
  )
}

function MetricCard({
  alert = false,
  detail,
  icon,
  label,
  value,
}: {
  alert?: boolean
  detail: string
  icon: ReactNode
  label: string
  value: number
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`grid size-10 place-items-center rounded-xl ${alert ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-teamsync-navy'}`}>
        {icon}
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  )
}
