import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  Flame,
  FolderKanban,
  ListTodo,
  MoreVertical,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
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

type TabType = 'upcoming' | 'overdue' | 'all'
type PriorityFilter = 'all' | 'urgent' | 'high' | 'medium' | 'low'
type SortOption = 'due_date' | 'priority' | 'title'

const priorityWeights: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Smart Filters
  const [activeTab, setActiveTab] = useState<TabType>('upcoming')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [selectedPriority, setSelectedPriority] = useState<PriorityFilter>('all')
  const [selectedSort, setSelectedSort] = useState<SortOption>('due_date')
  const [activityFilter, setActivityFilter] = useState<'all' | 'tasks' | 'comments'>('all')

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

  // Unique project names for dropdown
  const availableProjects = useMemo(() => {
    if (!summary) return []
    const set = new Set<string>()
    summary.upcoming_tasks.forEach((t) => t.project_name && set.add(t.project_name))
    summary.my_workload.overdue_tasks.forEach((t) => t.project_name && set.add(t.project_name))
    return Array.from(set).sort()
  }, [summary])

  // Filtered & sorted task queue
  const displayTasks = useMemo(() => {
    if (!summary) return []

    let list: DashboardTask[] = []
    if (activeTab === 'upcoming') {
      list = [...summary.upcoming_tasks]
    } else if (activeTab === 'overdue') {
      list = [...summary.my_workload.overdue_tasks]
    } else {
      // Merge unique tasks
      const seen = new Set<string>()
      list = []
      for (const t of [...summary.my_workload.overdue_tasks, ...summary.upcoming_tasks]) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          list.push(t)
        }
      }
    }

    // Keyword Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || t.project_name.toLowerCase().includes(q)
      )
    }

    // Project Dropdown Filter
    if (selectedProject !== 'all') {
      list = list.filter((t) => t.project_name === selectedProject)
    }

    // Priority Dropdown Filter
    if (selectedPriority !== 'all') {
      list = list.filter((t) => t.priority.toLowerCase() === selectedPriority)
    }

    // Sorting
    list.sort((a, b) => {
      if (selectedSort === 'priority') {
        const wa = priorityWeights[a.priority.toLowerCase()] || 0
        const wb = priorityWeights[b.priority.toLowerCase()] || 0
        return wb - wa
      }
      if (selectedSort === 'title') {
        return a.title.localeCompare(b.title)
      }
      // due_date default
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })

    return list
  }, [summary, activeTab, searchQuery, selectedProject, selectedPriority, selectedSort])

  // Filtered activity stream
  const filteredActivity = useMemo(() => {
    if (!summary) return []
    if (activityFilter === 'all') return summary.recent_activity
    if (activityFilter === 'comments') {
      return summary.recent_activity.filter((e) => e.event_type.includes('comment') || e.event_type.includes('repli'))
    }
    return summary.recent_activity.filter((e) => !e.event_type.includes('comment') && !e.event_type.includes('repli'))
  }, [summary, activityFilter])

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <header className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
              Workspace Overview
            </span>
          </div>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
            Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/calendar"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Calendar size={13} className="text-slate-500" />
            Calendar
          </Link>
          <Link
            to="/analytics"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <TrendingUp size={13} className="text-slate-500" />
            Analytics
          </Link>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
          <AlertCircle size={16} className="shrink-0 text-red-600 dark:text-red-400" />
          <p>{error}</p>
        </div>
      )}

      {summary && (
        <>
          {/* Top KPI Metrics Row — Compact High-Density Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Active Projects"
              value={summary.projects.active}
              subtext={`${summary.projects.total} total accessible`}
              icon={<FolderKanban size={15} className="text-slate-400 dark:text-slate-500" />}
            />
            <KpiCard
              label="Open Tasks"
              value={summary.tasks.open}
              subtext={`${summary.tasks.completed} completed of ${summary.tasks.total}`}
              icon={<ListTodo size={15} className="text-slate-400 dark:text-slate-500" />}
              progress={summary.tasks.total > 0 ? (summary.tasks.completed / summary.tasks.total) * 100 : 0}
            />
            <KpiCard
              label="Assigned to Me"
              value={summary.my_workload.assigned_open}
              subtext={`${summary.my_workload.due_soon} due in next 7 days`}
              icon={<Users size={15} className="text-slate-400 dark:text-slate-500" />}
            />
            <KpiCard
              alert={summary.my_workload.overdue > 0}
              label="Overdue Deadlines"
              value={summary.my_workload.overdue}
              subtext={summary.my_workload.overdue > 0 ? 'Action required immediately' : 'All schedules on track'}
              icon={<Clock size={15} className={summary.my_workload.overdue > 0 ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'} />}
            />
          </div>

          {/* Main 2-Column High-Density Grid */}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
            {/* Left Primary Column: Task Queue with Smart Filter & Controls */}
            <div className="space-y-5">
              <section className="rounded-xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
                {/* Segmented Tab Controls & Quick Metrics */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3.5 dark:border-slate-800/80">
                  <div className="flex items-center gap-1.5 rounded-lg bg-slate-100/80 p-1 dark:bg-slate-800/60">
                    <button
                      type="button"
                      onClick={() => setActiveTab('upcoming')}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                        activeTab === 'upcoming'
                          ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      Upcoming ({summary.upcoming_tasks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('overdue')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                        activeTab === 'overdue'
                          ? 'bg-red-600 text-white shadow-2xs'
                          : summary.my_workload.overdue > 0
                            ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      {summary.my_workload.overdue > 0 && <span className="size-1.5 rounded-full bg-red-400" />}
                      Overdue ({summary.my_workload.overdue_tasks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('all')}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                        activeTab === 'all'
                          ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      All Assigned
                    </button>
                  </div>

                  <Link
                    to="/calendar"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    View calendar <ArrowUpRight size={13} />
                  </Link>
                </div>

                {/* Smart Filter Toolbar: Search + Dropdowns */}
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800/80 dark:bg-slate-800/20">
                  {/* Search Input */}
                  <div className="relative min-w-[140px] flex-1">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter tasks by name or project…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-7 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Project Filter Dropdown */}
                  {availableProjects.length > 0 && (
                    <div className="relative">
                      <select
                        aria-label="Filter by project"
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="h-7 cursor-pointer appearance-none rounded-md border border-slate-200 bg-white pl-2.5 pr-6 text-xs font-medium text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <option value="all">All Projects</option>
                        {availableProjects.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  )}

                  {/* Priority Filter Dropdown */}
                  <div className="relative">
                    <select
                      aria-label="Filter by priority"
                      value={selectedPriority}
                      onChange={(e) => setSelectedPriority(e.target.value as PriorityFilter)}
                      className="h-7 cursor-pointer appearance-none rounded-md border border-slate-200 bg-white pl-2.5 pr-6 text-xs font-medium text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <option value="all">All Priorities</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>

                  {/* Sort Dropdown */}
                  <div className="relative">
                    <select
                      aria-label="Sort tasks by"
                      value={selectedSort}
                      onChange={(e) => setSelectedSort(e.target.value as SortOption)}
                      className="h-7 cursor-pointer appearance-none rounded-md border border-slate-200 bg-white pl-2.5 pr-6 text-xs font-medium text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <option value="due_date">Sort: Due Date</option>
                      <option value="priority">Sort: Priority</option>
                      <option value="title">Sort: Title</option>
                    </select>
                    <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* High-Density Task List */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {displayTasks.length > 0 ? (
                    displayTasks.map((task) => (
                      <TaskRowItem
                        key={task.id}
                        task={task}
                        isOverdue={activeTab === 'overdue' || summary.my_workload.overdue_tasks.some((o) => o.id === task.id)}
                      />
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <CheckCircle2 size={20} className="mx-auto text-emerald-500" />
                      <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {searchQuery || selectedProject !== 'all' || selectedPriority !== 'all'
                          ? 'No tasks match current filters'
                          : 'All caught up! No tasks in this view'}
                      </p>
                      {(searchQuery || selectedProject !== 'all' || selectedPriority !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('')
                            setSelectedProject('all')
                            setSelectedPriority('all')
                          }}
                          className="mt-2 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Task Velocity Distribution */}
              <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Task Status Velocity
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {summary.tasks.total} total deliverables across active projects
                    </p>
                  </div>
                  <Link
                    to="/analytics"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Analytics <ArrowRight size={12} />
                  </Link>
                </div>

                {/* Segmented Bar */}
                {summary.tasks.total > 0 && (
                  <div className="mt-3">
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

                {/* Status Legend */}
                <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                        className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800/80 dark:bg-slate-800/40"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`size-1.5 rounded-full ${color}`} />
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between">
                          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                            {count}
                          </span>
                          <span className="text-[10px] text-slate-400 tabular-nums">{pct}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>

            {/* Right Column: Activity Stream & Quick Links */}
            <div className="space-y-5">
              {/* Activity Timeline with Filter Dropdown */}
              <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Team Activity
                    </h2>
                  </div>

                  {/* Activity Filter Dropdown */}
                  <div className="relative">
                    <select
                      aria-label="Filter activity stream"
                      value={activityFilter}
                      onChange={(e) => setActivityFilter(e.target.value as 'all' | 'tasks' | 'comments')}
                      className="h-6 cursor-pointer appearance-none rounded border border-slate-200 bg-white pl-2 pr-5 text-[11px] font-medium text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <option value="all">All Events</option>
                      <option value="tasks">Tasks Only</option>
                      <option value="comments">Comments</option>
                    </select>
                    <ChevronDown size={10} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {filteredActivity.length > 0 ? (
                  <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredActivity.slice(0, 6).map((event) => {
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
                        <li key={event.id} className="flex items-start gap-2.5 py-2.5 text-xs">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="leading-snug text-slate-600 dark:text-slate-300">
                              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                                {event.actor_name}
                              </strong>{' '}
                              {action}{' '}
                              {event.task_id && (
                                <Link
                                  to={`/workspaces/${event.workspace_id}/projects/${event.project_id}/tasks/${event.task_id}`}
                                  className="font-medium text-slate-900 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-indigo-400"
                                >
                                  {event.task_title}
                                </Link>
                              )}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                              {event.project_name && <span>{event.project_name} ·</span>}
                              <span>{formatRelativeTime(event.created_at)}</span>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No recent activity matching filter.
                  </div>
                )}
              </section>

              {/* Workspace Shortcuts */}
              <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Quick Navigation
                </h3>
                <div className="mt-2.5 space-y-1.5">
                  <Link
                    to="/calendar"
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-200 hover:bg-slate-100 dark:border-slate-800/80 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:border-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <Calendar size={13} className="text-slate-400" />
                      Sprint Calendar
                    </span>
                    <ArrowRight size={12} className="text-slate-400" />
                  </Link>

                  <Link
                    to="/analytics"
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-200 hover:bg-slate-100 dark:border-slate-800/80 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:border-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <TrendingUp size={13} className="text-slate-400" />
                      Velocity & Analytics
                    </span>
                    <ArrowRight size={12} className="text-slate-400" />
                  </Link>

                  <Link
                    to="/invitations"
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-200 hover:bg-slate-100 dark:border-slate-800/80 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:border-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <Users size={13} className="text-slate-400" />
                      Workspace Invitations
                    </span>
                    <ArrowRight size={12} className="text-slate-400" />
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
  progress,
  subtext,
  value,
}: {
  alert?: boolean
  icon: ReactNode
  label: string
  progress?: number
  subtext: string
  value: number
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 shadow-2xs transition-all hover:border-slate-300 dark:hover:border-slate-700 ${
        alert
          ? 'border-red-200 bg-red-50/20 dark:border-red-950/60 dark:bg-red-950/20'
          : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/90'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span
          className={`text-2xl font-bold tracking-tight tabular-nums ${
            alert ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {value}
        </span>
        {progress !== undefined && (
          <span className="text-[11px] font-medium text-slate-400 tabular-nums">
            {Math.round(progress)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-400">{subtext}</p>
    </div>
  )
}

function TaskRowItem({ isOverdue = false, task }: { isOverdue?: boolean; task: DashboardTask }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const priorityStyles: Record<string, string> = {
    urgent: 'text-red-600 bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-900/60 dark:text-red-400',
    high: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-900/60 dark:text-amber-400',
    medium: 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-900/60 dark:text-blue-400',
    low: 'text-slate-500 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400',
  }

  const taskUrl = `/workspaces/${task.workspace_id}/projects/${task.project_id}/tasks/${task.id}`

  function handleCopy() {
    void navigator.clipboard.writeText(`${window.location.origin}${taskUrl}`)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setMenuOpen(false)
    }, 1200)
  }

  return (
    <div className="group flex items-center justify-between gap-3 px-3.5 py-2.5 transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`rounded border px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
              priorityStyles[task.priority.toLowerCase()] || priorityStyles.low
            }`}
          >
            {task.priority}
          </span>
          <Link
            to={taskUrl}
            className="truncate text-xs font-semibold text-slate-900 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-indigo-400 sm:text-[13px]"
          >
            {task.title}
          </Link>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400 sm:text-[11px]">
          <span className="truncate">{task.project_name}</span>
          <span>·</span>
          <span className="capitalize">{task.status.replaceAll('_', ' ')}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-xs tabular-nums ${
            isOverdue
              ? 'rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {task.due_date ? formatDate(task.due_date) : 'No date'}
        </span>

        {/* Task Row Context Menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Task options"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-6 items-center justify-center rounded text-slate-400 opacity-60 transition hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <MoreVertical size={13} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <Link
                to={taskUrl}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ExternalLink size={12} />
                Open Task
              </Link>
              <Link
                to={`/workspaces/${task.workspace_id}/projects/${task.project_id}/tasks`}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <FolderKanban size={12} />
                Project Board
              </Link>
              <button
                type="button"
                onClick={handleCopy}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
