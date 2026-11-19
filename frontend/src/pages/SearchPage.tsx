import { Children, useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'

import { getApiErrorMessage } from '../auth/errors'
import { Button } from '../components/ui/Button'
import { InlineLoader } from '../components/ui/Loading'
import { taskPriorities, taskStatuses } from '../tasks/options'
import type { TaskPriority, TaskStatus } from '../tasks/types'
import { searchTeamSync, type GlobalSearchResults } from '../search/api'

const pageSize = 10

function resultLink(
  workspaceId: string,
  projectId: string,
  taskId?: string,
) {
  const projectPath = `/workspaces/${workspaceId}/projects/${projectId}`
  return taskId ? `${projectPath}/tasks/${taskId}` : projectPath
}

export function SearchPage() {
  const location = useLocation()
  return <SearchPageContent key={location.search} />
}

function SearchPageContent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [results, setResults] = useState<GlobalSearchResults | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(query.trim()))
  const [term, setTerm] = useState(query)
  const [project, setProject] = useState(searchParams.get('project') ?? '')
  const [status, setStatus] = useState(searchParams.get('status') ?? '')
  const [priority, setPriority] = useState(searchParams.get('priority') ?? '')
  const [assignee, setAssignee] = useState(searchParams.get('assignee') ?? '')
  const [creator, setCreator] = useState(searchParams.get('creator') ?? '')
  const [label, setLabel] = useState(searchParams.get('label') ?? '')
  const [dueAfter, setDueAfter] = useState(searchParams.get('due_after') ?? '')
  const [dueBefore, setDueBefore] = useState(searchParams.get('due_before') ?? '')
  const page = Number(searchParams.get('page') ?? '1')

  useEffect(() => {
    if (!query.trim()) {
      return
    }

    let active = true
    const filters = Object.fromEntries(searchParams.entries())
    void searchTeamSync({
      q: query,
      page,
      page_size: pageSize,
      project: filters.project,
      status: filters.status as TaskStatus | undefined,
      priority: filters.priority as TaskPriority | undefined,
      assignee: filters.assignee,
      creator: filters.creator,
      label: filters.label,
      due_after: filters.due_after,
      due_before: filters.due_before,
    })
      .then((response) => {
        if (active) {
          setResults(response)
          setError('')
        }
      })
      .catch((searchError: unknown) => {
        if (active) {
          setResults(null)
          setError(getApiErrorMessage(searchError))
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [query, searchParams, page])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams()
    const values: Record<string, string> = {
      q: term.trim(),
      project: project.trim(),
      status,
      priority,
      assignee: assignee.trim(),
      creator: creator.trim(),
      label: label.trim(),
      due_after: dueAfter,
      due_before: dueBefore,
    }
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
    }
    setSearchParams(next)
  }

  const totalPages = Math.max(
    1,
    ...[results?.projects, results?.tasks, results?.members, results?.comments]
      .filter((group) => group !== undefined)
      .map((group) => Math.ceil(group.count / pageSize)),
  )

  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next)
  }

  return (
    <section className="space-y-4">
      <header className="border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Workspace Search</p>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">Search</h1>
      </header>

      <form className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90" onSubmit={handleSubmit}>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Search projects, tasks, members, and comments
          <div className="mt-1.5 flex gap-2">
            <input
              autoFocus
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              maxLength={100}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Type keywords to search…"
              required
              type="search"
              value={term}
            />
            <Button type="submit"><Search aria-hidden="true" size={14} />Search</Button>
          </div>
        </label>

        <details>
          <summary className="w-fit cursor-pointer text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            Advanced filters
          </summary>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <TextFilter label="Project name or ID" onChange={setProject} value={project} />
            <TextFilter label="Assignee name or ID" onChange={setAssignee} value={assignee} />
            <TextFilter label="Creator name or ID" onChange={setCreator} value={creator} />
            <TextFilter label="Label name or ID" onChange={setLabel} value={label} />
            <SelectFilter label="Status" onChange={setStatus} value={status}>
              <option value="">All statuses</option>
              {taskStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </SelectFilter>
            <SelectFilter label="Priority" onChange={setPriority} value={priority}>
              <option value="">All priorities</option>
              {taskPriorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </SelectFilter>
            <TextFilter label="Due after" onChange={setDueAfter} type="date" value={dueAfter} />
            <TextFilter label="Due before" onChange={setDueBefore} type="date" value={dueBefore} />
          </div>
        </details>
      </form>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</p>}
      {loading && <InlineLoader message="Searching records…" />}
      {!query.trim() && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">Enter keywords above to search across accessible workspaces.</p>}
      {!loading && query.trim() && results && (
        <div className="space-y-4">
          <ResultSection title="Projects" count={results.projects.count}>
            {results.projects.results.map((item) => (
              <li key={item.id}>
                <Link className="text-xs font-semibold text-slate-900 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-indigo-400" to={resultLink(item.workspace_id, item.id)}>{item.name}</Link>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.workspace_name} · {item.status}</p>
              </li>
            ))}
          </ResultSection>
          <ResultSection title="Tasks" count={results.tasks.count}>
            {results.tasks.results.map((item) => (
              <li key={item.id}>
                <Link className="text-xs font-semibold text-slate-900 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-indigo-400" to={resultLink(item.workspace_id, item.project_id, item.id)}>{item.title}</Link>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.project_name} · {item.status.replaceAll('_', ' ')} · {item.priority}{item.due_date ? ` · Due ${item.due_date}` : ''}</p>
              </li>
            ))}
          </ResultSection>
          <ResultSection title="Members" count={results.members.count}>
            {results.members.results.map((item) => (
              <li key={`${item.id}:${item.workspace_id}`}>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{[item.first_name, item.last_name].filter(Boolean).join(' ') || item.username}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.username} · {item.workspace_name}</p>
              </li>
            ))}
          </ResultSection>
          <ResultSection title="Task comments" count={results.comments.count}>
            {results.comments.results.map((item) => (
              <li key={item.id}>
                <Link className="text-xs font-semibold text-slate-900 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-indigo-400" to={resultLink(item.workspace_id, item.project_id, item.task_id)}>{item.task_title}</Link>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">{item.body}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.project_name} · {item.author_username ?? 'Former member'}</p>
              </li>
            ))}
          </ResultSection>
          {results.projects.count + results.tasks.count + results.members.count + results.comments.count === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">No matching records found in accessible workspaces.</p>
          )}
          {totalPages > 1 && (
            <nav aria-label="Search result pages" className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button disabled={page <= 1} onClick={() => changePage(page - 1)} variant="secondary">Previous</Button>
                <Button disabled={page >= totalPages} onClick={() => changePage(page + 1)} variant="secondary">Next</Button>
              </div>
            </nav>
          )}
        </div>
      )}
    </section>
  )
}

function ResultSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">{title}</h2>
        <span className="text-[11px] text-slate-400">{count} results</span>
      </div>
      {Children.count(children) > 0 ? (
        <ul className="divide-y divide-slate-100 px-4 dark:divide-slate-800/80 [&>li]:py-3">{children}</ul>
      ) : (
        <p className="px-4 py-3 text-xs text-slate-400">No matching {title.toLowerCase()}.</p>
      )}
    </section>
  )
}

function TextFilter({
  label,
  value,
  onChange,
  type = 'search',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'search' | 'date'
}) {
  return (
    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
      {label}
      <input className="mt-1 block h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  )
}

function SelectFilter({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
      {label}
      <select className="mt-1 block h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  )
}
