import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  FolderKanban,
  ListTodo,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { getDashboardSummary } from '../dashboard/api'
import type { DashboardActivity, DashboardSummary, DashboardTask } from '../dashboard/types'
import { formatDate } from '../projects/format'
import { DashboardSkeleton } from '../components/ui/Loading'

const activityActionMap: Record<string, string> = {
  created: 'created task',
  updated: 'updated task',
  moved: 'moved task',
  assignment_added: 'assigned member to',
  assignment_removed: 'unassigned member from',
  commented: 'commented on',
  replied: 'replied to',
  mentioned: 'mentioned a teammate in',
  invitation_created: 'invited a teammate to workspace',
  invitation_accepted: 'joined the workspace',
}

function formatRelativeTime(timestamp: string): string {
  try {
    const diffMs = Date.now() - new Date(timestamp).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'Just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(timestamp))
  } catch {
    return timestamp
  }
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState<'upcoming' | 'overdue'>('upcoming')

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

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-8">
      {/* Refined SaaS Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 dark:border-slate-800/80 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium tracking-wide uppercase text-slate-500 dark:text-slate-400">
              Workspace Overview
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time telemetry across accessible projects, workload distribution, and sprint deadlines.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/calendar"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Calendar size={14} className="text-slate-500" />
            Calendar
          </Link>
          <Link
            to="/analytics"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <TrendingUp size={14} className="text-slate-500" />
            Analytics
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
          <AlertCircle size={18} className="shrink-0 text-red-600 dark:text-red-400" />
          <p>{error}</p>
        </div>
      )}

      {summary && (
        <>
          {/* Top KPI Metrics Row — Clean Linear / Stripe Style */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Active Projects"
              value={summary.projects.active}
              secondary={`${summary.projects.total} total accessible`}
              icon={<FolderKanban size={16} className="text-slate-400 dark:text-slate-500" />}
            />
            <KpiCard
              label="Open Tasks"
              value={summary.tasks.open}
              secondary={`${summary.tasks.completed} completed (${Math.round((summary.tasks.completed / Math.max(summary.tasks.total, 1)) * 100)}%)`}
              icon={<ListTodo size={16} className="text-slate-400 dark:text-slate-500" />}
            />
            <KpiCard
              label="Assigned to Me"
              value={summary.my_workload.assigned_open}
              secondary={`${summary.my_workload.due_soon} due in next 7 days`}
              icon={<Users size={16} className="text-slate-400 dark:text-slate-500" />}
            />
            <KpiCard
              alert={summary.my_workload.overdue > 0}
              label="Overdue Deadlines"
              value={summary.my_workload.overdue}
              secondary={summary.my_workload.overdue > 0 ? 'Requires attention' : 'All deadlines on track'}
              icon={<Clock size={16} className={summary.my_workload.overdue > 0 ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'} />}
            />
          </div>

          {/* Core 2-Column Section */}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
            {/* Left Primary Column: Task Queue & Status Breakdown */}
            <div className="space-y-6">
              {/* Task Deadlines & Workload */}
              <section className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDeadlineFilter('upcoming')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        deadlineFilter === 'upcoming'
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      Upcoming ({summary.upcoming_tasks.length})
                    </button>
                    {summary.my_workload.overdue_tasks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDeadlineFilter('overdue')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          deadlineFilter === 'overdue'
                            ? 'bg-red-600 text-white'
                            : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
                        }`}
                      >
                        <span className="size-1.5 rounded-full bg-red-500" />
                        Overdue ({summary.my_workload.overdue_tasks.length})
                      </button>
                    )}
                  </div>
                  <Link
                    to="/calendar"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    View calendar <ArrowUpRight size={13} />
                  </Link>
                </div>

                {/* Task Rows List */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {deadlineFilter === 'upcoming' ? (
                    summary.upcoming_tasks.length > 0 ? (
                      summary.upcoming_tasks.map((task) => (
                        <TaskRow key={task.id} task={task} />
                      ))
                    ) : (
                      <EmptyTaskState message="No assigned deadlines due in the next 7 days." />
                    )
                  ) : (
                    summary.my_workload.overdue_tasks.length > 0 ? (
                      summary.my_workload.overdue_tasks.map((task) => (
                        <TaskRow key={task.id} task={task} isOverdue />
                      ))
                    ) : (
                      <EmptyTaskState message="No overdue tasks assigned to your account." />
                    )
                  )}
                </div>
              </section>

              {/* Task Status Velocity & Distribution */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Task Status Velocity
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Progress ratio of {summary.tasks.total} tasks across active projects
                    </p>
                  </div>
                  <Link
                    to="/analytics"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Deep dive <ArrowRight size={12} />
                  </Link>
                </div>

                {/* Sleek Segmented Bar */}
                {summary.tasks.total > 0 && (
                  <div className="mt-4">
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="bg-slate-400 transition-all duration-300"
                        style={{ width: `${((summary.tasks.by_status['todo'] || 0) / summary.tasks.total) * 100}%` }}
                        title={`To Do: ${summary.tasks.by_status['todo'] || 0}`}
                      />
                      <div
                        className="bg-blue-500 transition-all duration-300"
                        style={{ width: `${((summary.tasks.by_status['in_progress'] || 0) / summary.tasks.total) * 100}%` }}
                        title={`In Progress: ${summary.tasks.by_status['in_progress'] || 0}`}
                      />
                      <div
                        className="bg-amber-500 transition-all duration-300"
                        style={{ width: `${((summary.tasks.by_status['review'] || 0) / summary.tasks.total) * 100}%` }}
                        title={`In Review: ${summary.tasks.by_status['review'] || 0}`}
                      />
                      <div
                        className="bg-emerald-500 transition-all duration-300"
                        style={{ width: `${((summary.tasks.by_status['completed'] || 0) / summary.tasks.total) * 100}%` }}
                        title={`Completed: ${summary.tasks.by_status['completed'] || 0}`}
                      />
                    </div>
                  </div>
                )}

                {/* Status Legend Grid */}
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'To Do', key: 'todo', color: 'bg-slate-400' },
                    { label: 'In Progress', key: 'in_progress', color: 'bg-blue-500' },
                    { label: 'In Review', key: 'review', color: 'bg-amber-500' },
                    { label: 'Completed', key: 'completed', color: 'bg-emerald-500' },
                  ].map(({ color, key, label }) => {
                    const count = summary.tasks.by_status[key] || 0
                    const pct = summary.tasks.total > 0 ? Math.round((count / summary.tasks.total) * 100) : 0
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/80 dark:bg-slate-800/40"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`size-2 rounded-full ${color}`} />
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between">
                          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                            {count}
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums">{pct}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>

            {/* Right Column: Activity Stream & Shortcuts */}
            <div className="space-y-6">
              {/* Activity Timeline */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Team Activity
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Recent event stream
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Live
                  </span>
                </div>

                {summary.recent_activity.length > 0 ? (
                  <ul className="mt-4 space-y-4">
                    {summary.recent_activity.slice(0, 7).map((event) => {
                      const initials = event.actor_name
                        ? event.actor_name
                            .split(' ')
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()
                        : 'U'
                      const action = activityActionMap[event.event_type] || event.event_type.replaceAll('_', ' ')

                      return (
                        <li key={event.id} className="flex items-start gap-3 text-xs">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {event.actor_name}
                              </span>{' '}
                              {action}{' '}
                              {event.task_id && (
                                <Link
                                  to={`/workspaces/${event.workspace_id}/projects/${event.project_id}/tasks/${event.task_id}`}
                                  className="font-medium text-slate-900 underline-offset-2 hover:underline dark:text-slate-100"
                                >
                                  {event.task_title}
                                </Link>
                              )}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                              {event.project_name && <span>{event.project_name} ·</span>}
                              <span>{formatRelativeTime(event.created_at)}</span>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No recent team activity recorded.
                  </div>
                )}
              </section>

              {/* Workspace Navigation Shortcuts */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Quick Shortcuts
                </h3>
                <div className="mt-3 space-y-2">
                  <Link
                    to="/calendar"
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5 text-xs font-medium text-slate-700 transition hover:border-slate-200 hover:bg-slate-100 dark:border-slate-800/80 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
                  >
                    <span className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      Sprint Calendar
                    </span>
                    <ArrowRight size={13} className="text-slate-400" />
                  </Link>

                  <Link
                    to="/analytics"
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5 text-xs font-medium text-slate-700 transition hover:border-slate-200 hover:bg-slate-100 dark:border-slate-800/80 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
                  >
                    <span className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-slate-400" />
                      Velocity & Analytics
                    </span>
                    <ArrowRight size={13} className="text-slate-400" />
                  </Link>

                  <Link
                    to="/invitations"
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5 text-xs font-medium text-slate-700 transition hover:border-slate-200 hover:bg-slate-100 dark:border-slate-800/80 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
                  >
                    <span className="flex items-center gap-2">
                      <Users size={14} className="text-slate-400" />
                      Pending Workspace Invitations
                    </span>
                    <ArrowRight size={13} className="text-slate-400" />
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({
  alert = false,
  icon,
  label,
  secondary,
  value,
}: {
  alert?: boolean
  icon: ReactNode
  label: string
  secondary: string
  value: number
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-2xs transition-all hover:border-slate-300 dark:hover:border-slate-700 ${
        alert
          ? 'border-red-200 bg-red-50/30 dark:border-red-950/60 dark:bg-red-950/20'
          : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/90'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`text-3xl font-extrabold tracking-tight tabular-nums ${
            alert ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{secondary}</p>
    </div>
  )
}

function TaskRow({ isOverdue = false, task }: { isOverdue?: boolean; task: DashboardTask }) {
  const priorityColor =
    task.priority === 'urgent'
      ? 'text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400'
      : task.priority === 'high'
        ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400'
        : task.priority === 'medium'
          ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400'
          : 'text-slate-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-400'

  return (
    <div className="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityColor}`}>
            {task.priority}
          </span>
          <Link
            to={`/workspaces/${task.workspace_id}/projects/${task.project_id}/tasks/${task.id}`}
            className="truncate text-xs font-semibold text-slate-900 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-indigo-400 sm:text-sm"
          >
            {task.title}
          </Link>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
          <span className="truncate">{task.project_name}</span>
          <span>·</span>
          <span className="capitalize">{task.status.replaceAll('_', ' ')}</span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span
          className={`text-xs font-medium tabular-nums ${
            isOverdue
              ? 'rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {task.due_date ? formatDate(task.due_date) : 'No date'}
        </span>
      </div>
    </div>
  )
}

function EmptyTaskState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center">
      <CheckCircle2 size={24} className="mx-auto text-emerald-500" />
      <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">{message}</p>
    </div>
  )
}
