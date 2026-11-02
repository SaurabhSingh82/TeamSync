import { useCallback, useEffect, useState } from 'react'
import { ChartNoAxesColumnIncreasing, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { getAnalytics } from '../dashboard/api'
import type { AnalyticsResponse, ProjectProgress } from '../dashboard/types'

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
    <section className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-teamsync-navy">
          <ChartNoAxesColumnIncreasing aria-hidden="true" size={20} />
          <p className="text-sm font-semibold">Authorized project data</p>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Analytics</h1>
        <p className="mt-2 text-sm text-slate-600">
          Progress is completed tasks divided by all non-archived tasks in accessible, non-archived projects.
        </p>
      </header>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {totals && (
        <section aria-label="Task status totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statusEntries.map(([status, count]) => {
            const percent = statusTotal > 0 ? Math.round((count / statusTotal) * 100) : 0
            return (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={status}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium text-slate-600">{statusLabels[status] ?? status.replaceAll('_', ' ')}</h2>
                  <span className="text-xs text-slate-500">{percent}%</span>
                </div>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{count}</p>
                <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-teamsync-navy" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">of {statusTotal} non-archived tasks</p>
              </article>
            )
          })}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Project progress</h2>
          <p className="mt-1 text-xs text-slate-500">{totals?.progress_denominator ?? 'Progress is calculated from active task records.'}</p>
        </div>
        {projects.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {projects.map((project) => (
              <li className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(200px,0.8fr)_auto] sm:items-center" key={project.id}>
                <div className="min-w-0">
                  <Link className="truncate text-sm font-semibold text-teamsync-navy hover:underline" to={`/workspaces/${project.workspace_id}/projects/${project.id}`}>
                    {project.name}
                  </Link>
                  <p className="mt-1 text-xs capitalize text-slate-500">{project.status.replaceAll('_', ' ')}</p>
                </div>
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${project.progress_percent}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{project.completed_task_count} of {project.task_count} tasks completed</p>
                </div>
                <p className="text-sm font-semibold text-slate-700">{project.progress_percent}%</p>
              </li>
            ))}
          </ul>
        ) : !loading ? (
          <p className="p-8 text-center text-sm text-slate-500">No accessible projects have analytics yet.</p>
        ) : null}
        {loading && (
          <p className="flex items-center justify-center gap-2 p-6 text-sm text-slate-500">
            <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
            Loading analytics...
          </p>
        )}
      </section>
      {hasMore && !loading && (
        <button className="min-h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void load(page + 1, true)} type="button">
          Load more projects
        </button>
      )}
    </section>
  )
}
