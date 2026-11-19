import { useCallback, useEffect, useState } from 'react'
import { ChartNoAxesColumnIncreasing } from 'lucide-react'
import { Link } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { getAnalytics } from '../dashboard/api'
import type { AnalyticsResponse, ProjectProgress } from '../dashboard/types'
import { InlineLoader } from '../components/ui/Loading'

const statusLabels: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  review: 'In review',
  completed: 'Completed',
}

export function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
  const [projects, setProjects] = useState<ProjectProgress[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (requestedPage: number, append: boolean) => {
    setLoading(true)
    setError('')
    try {
      const result = await getAnalytics(requestedPage)
      setAnalytics(result)
      setProjects((current) => append ? [...current, ...result.results] : result.results)
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
    void getAnalytics()
      .then((result) => {
        if (!active) return
        setAnalytics(result)
        setProjects(result.results)
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
  }, [])

  const totals = analytics?.totals
  const statusEntries = ['todo', 'in_progress', 'review', 'completed'].map(
    (status) => [status, totals?.status_counts[status] ?? 0] as const,
  )
  const statusTotal = totals?.task_count ?? 0

  return (
    <section className="space-y-5">
      <header className="border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ChartNoAxesColumnIncreasing aria-hidden="true" size={16} className="text-slate-500" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Sprint Velocity
          </p>
        </div>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Analytics
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Task completion ratios and velocity metrics across accessible, non-archived projects.
        </p>
      </header>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</p>}
      {totals && (
        <section aria-label="Task status totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statusEntries.map(([status, count]) => {
            const percent = statusTotal > 0 ? Math.round((count / statusTotal) * 100) : 0
            return (
              <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90" key={status}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {statusLabels[status] ?? status.replaceAll('_', ' ')}
                  </h2>
                  <span className="text-[11px] font-medium text-slate-400 tabular-nums">{percent}%</span>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{count}</p>
                <div aria-hidden="true" className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-slate-900 dark:bg-slate-200" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">of {statusTotal} non-archived tasks</p>
              </article>
            )
          })}
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Project Progress</h2>
          <p className="text-[11px] text-slate-400">{totals?.progress_denominator ?? 'Progress calculated from active task records.'}</p>
        </div>
        {projects.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {projects.map((project) => (
              <li className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.8fr)_auto] sm:items-center" key={project.id}>
                <div className="min-w-0">
                  <Link className="truncate text-xs font-semibold text-slate-900 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-indigo-400" to={`/workspaces/${project.workspace_id}/projects/${project.id}`}>
                    {project.name}
                  </Link>
                  <p className="mt-0.5 text-[11px] capitalize text-slate-400">{project.status.replaceAll('_', ' ')}</p>
                </div>
                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${project.progress_percent}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{project.completed_task_count} of {project.task_count} tasks completed</p>
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums">{project.progress_percent}%</p>
              </li>
            ))}
          </ul>
        ) : !loading ? (
          <p className="p-6 text-center text-xs text-slate-500">No accessible projects have analytics yet.</p>
        ) : null}
        {loading && <InlineLoader message="Loading analytics…" />}
      </section>
      {hasMore && !loading && (
        <button className="h-9 w-full rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => void load(page + 1, true)} type="button">
          Load more projects
        </button>
      )}
    </section>
  )
}
