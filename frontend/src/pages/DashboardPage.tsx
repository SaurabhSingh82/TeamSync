import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Calendar,
  CheckCircle2,
  CircleAlert,
  Clock,
  FolderKanban,
  ListTodo,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { getDashboardSummary } from '../dashboard/api'
import type { DashboardSummary } from '../dashboard/types'
import { formatDate, formatTimestamp } from '../projects/format'
import { TaskStatusBadge } from '../components/tasks/TaskBadge'
import type { TaskStatus } from '../tasks/types'
import { DashboardSkeleton } from '../components/ui/Loading'

const activityLabels: Record<string, string> = {
  created: 'created a task',
  updated: 'updated a task',
  moved: 'moved a task',
  assignment_added: 'assigned a teammate',
  assignment_removed: 'removed task assignment',
  commented: 'commented on',
  replied: 'replied to',
  mentioned: 'mentioned a teammate on',
  invitation_created: 'created a workspace invitation',
  invitation_accepted: 'joined the workspace',
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
    <section aria-labelledby="dashboard-title" className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 pb-6 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Workspace sync active</span>
          </div>
          <h1 id="dashboard-title" className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Workspace Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Real-time overview of projects, tasks, upcoming deadlines, and team updates.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            to="/calendar"
          >
            <Calendar size={16} className="text-slate-500" />
            Calendar
          </Link>
          <Link
            className="teamsync-primary-button inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-xs"
            to="/analytics"
          >
            <BarChart2 size={16} />
            Analytics
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
          <AlertTriangle size={18} className="shrink-0 text-red-600 dark:text-red-400" />
          <p>{error}</p>
        </div>
      )}

      {loading && <DashboardSkeleton />}

      {!loading && summary && (
        <>
          {/* Key Metrics Grid */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<FolderKanban size={20} className="text-indigo-600 dark:text-indigo-400" />}
              iconBg="bg-indigo-50 dark:bg-indigo-950/60"
              label="Accessible projects"
              value={summary.projects.total}
              detail={`${summary.projects.active} currently active`}
            />
            <MetricCard
              icon={<ListTodo size={20} className="text-sky-600 dark:text-sky-400" />}
              iconBg="bg-sky-50 dark:bg-sky-950/60"
              label="Open tasks"
              value={summary.tasks.open}
              detail={`${summary.tasks.total} total tasks in workspace`}
            />
            <MetricCard
              icon={<CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />}
              iconBg="bg-emerald-50 dark:bg-emerald-950/60"
              label="Completed tasks"
              value={summary.tasks.completed}
              detail="Across all active projects"
            />
            <MetricCard
              alert={summary.my_workload.overdue > 0}
              icon={<CircleAlert size={20} className={summary.my_workload.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'} />}
              iconBg={summary.my_workload.overdue > 0 ? 'bg-red-50 dark:bg-red-950/60' : 'bg-slate-100 dark:bg-slate-800'}
              label="My overdue tasks"
              value={summary.my_workload.overdue}
              detail={`${summary.my_workload.due_soon} due in the next 7 days`}
            />
          </div>

          {/* Two-Column Core: Upcoming Tasks & Recent Activity */}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
            {/* Upcoming Deadlines */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4.5 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                    <Clock size={16} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900 dark:text-slate-100">Upcoming deadlines</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Assigned open tasks due in the next 7 days</p>
                  </div>
                </div>
                <Link className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300" to="/calendar">
                  Full calendar <ArrowRight size={12} />
                </Link>
              </div>

              {summary.upcoming_tasks.length > 0 ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.upcoming_tasks.map((task) => (
                    <li className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40" key={task.id}>
                      <div className="min-w-0 flex-1">
                        <Link
                          className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                          to={`/workspaces/${task.workspace_id}/projects/${task.project_id}/tasks/${task.id}`}
                        >
                          {task.title}
                        </Link>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="truncate">{task.project_name}</span>
                          <span>·</span>
                          <span className="capitalize">{task.priority}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-right">
                        <div>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {task.due_date ? formatDate(task.due_date) : 'No date'}
                          </p>
                        </div>
                        <TaskStatusBadge status={task.status as TaskStatus} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-10 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800">
                    <CheckCircle2 size={24} className="text-emerald-500" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">All caught up!</p>
                  <p className="mt-1 text-xs text-slate-400">No assigned deadlines due in the next 7 days.</p>
                </div>
              )}

              {/* Overdue alert strip if any */}
              {summary.my_workload.overdue_tasks.length > 0 && (
                <div className="border-t-2 border-red-200/80 bg-red-50/30 dark:border-red-900/60 dark:bg-red-950/20">
                  <div className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2">
                      <CircleAlert size={16} className="text-red-600 dark:text-red-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-red-800 dark:text-red-300">
                        Overdue Tasks ({summary.my_workload.overdue_tasks.length})
                      </h3>
                    </div>
                    <span className="text-xs text-red-600 dark:text-red-400">Action required</span>
                  </div>
                  <ul className="divide-y divide-red-100 dark:divide-red-900/30">
                    {summary.my_workload.overdue_tasks.map((task) => (
                      <li className="flex items-center justify-between gap-4 px-6 py-3.5 transition hover:bg-red-50/60 dark:hover:bg-red-950/40" key={task.id}>
                        <div className="min-w-0">
                          <Link
                            className="block truncate text-sm font-semibold text-red-900 hover:underline dark:text-red-200"
                            to={`/workspaces/${task.workspace_id}/projects/${task.project_id}/tasks/${task.id}`}
                          >
                            {task.title}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-red-700/80 dark:text-red-400/80">{task.project_name}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/60 dark:text-red-200">
                          {task.due_date ? formatDate(task.due_date) : 'Overdue'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Recent Activity */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4.5 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                    <Zap size={16} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900 dark:text-slate-100">Recent activity</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Live stream from accessible projects</p>
                  </div>
                </div>
                <Link className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300" to="/analytics">
                  Trends <ArrowRight size={12} />
                </Link>
              </div>

              {summary.recent_activity.length > 0 ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.recent_activity.map((event) => {
                    const initials = event.actor_name
                      ? event.actor_name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()
                      : 'U'

                    return (
                      <li className="flex items-start gap-3.5 px-6 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40" key={event.id}>
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-xs">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug text-slate-700 dark:text-slate-300">
                            <strong className="font-semibold text-slate-900 dark:text-slate-100">{event.actor_name}</strong>{' '}
                            {activityLabels[event.event_type] ?? event.event_type.replaceAll('_', ' ')}
                            {event.task_id && (
                              <>
                                {' '}
                                <Link
                                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                                  to={`/workspaces/${event.workspace_id}/projects/${event.project_id}/tasks/${event.task_id}`}
                                >
                                  {event.task_title}
                                </Link>
                              </>
                            )}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                            {event.project_name && <span>{event.project_name} ·</span>}
                            <span>{formatTimestamp(event.created_at)}</span>
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="p-10 text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400">There is no recent activity recorded yet.</p>
                </div>
              )}
            </section>
          </div>

          {/* Task Status Distribution Overview */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Task status breakdown</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Distribution of non-archived tasks across accessible projects
                </p>
              </div>
              <Link className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300" to="/analytics">
                View in-depth analytics <ArrowRight size={12} />
              </Link>
            </div>

            {/* Visual segmented progress bar */}
            {summary.tasks.total > 0 && (
              <div className="mt-5 space-y-2">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="bg-slate-400 transition-all duration-500"
                    style={{ width: `${((summary.tasks.by_status['todo'] || 0) / summary.tasks.total) * 100}%` }}
                    title={`To Do: ${summary.tasks.by_status['todo'] || 0}`}
                  />
                  <div
                    className="bg-blue-500 transition-all duration-500"
                    style={{ width: `${((summary.tasks.by_status['in_progress'] || 0) / summary.tasks.total) * 100}%` }}
                    title={`In Progress: ${summary.tasks.by_status['in_progress'] || 0}`}
                  />
                  <div
                    className="bg-amber-500 transition-all duration-500"
                    style={{ width: `${((summary.tasks.by_status['review'] || 0) / summary.tasks.total) * 100}%` }}
                    title={`In Review: ${summary.tasks.by_status['review'] || 0}`}
                  />
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${((summary.tasks.by_status['completed'] || 0) / summary.tasks.total) * 100}%` }}
                    title={`Completed: ${summary.tasks.by_status['completed'] || 0}`}
                  />
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'To do', status: 'todo', color: 'bg-slate-400' },
                { label: 'In progress', status: 'in_progress', color: 'bg-blue-500' },
                { label: 'In review', status: 'review', color: 'bg-amber-500' },
                { label: 'Completed', status: 'completed', color: 'bg-emerald-500' },
              ].map(({ color, label, status }) => (
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50" key={status}>
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${color}`} />
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {summary.tasks.by_status[status] ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {!loading && !summary && !error && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Dashboard telemetry is temporarily unavailable.
          </p>
        </div>
      )}
    </section>
  )
}

function MetricCard({
  alert = false,
  detail,
  icon,
  iconBg,
  label,
  value,
}: {
  alert?: boolean
  detail: string
  icon: ReactNode
  iconBg: string
  label: string
  value: number
}) {
  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md ${
        alert
          ? 'border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20'
          : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex size-11 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
        {alert && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/60 dark:text-red-200">
            Action needed
          </span>
        )}
      </div>
      <p className="mt-4 text-xs font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </article>
  )
}
