import { Children, useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'

import { getApiErrorMessage } from '../auth/errors'
import { Button } from '../components/ui/Button'
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
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-teamsync-navy">Find what you need</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Search</h1>
      </header>

      <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700">
          Search projects, tasks, members, and comments
          <div className="mt-1.5 flex gap-2">
            <input
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950"
              maxLength={100}
              onChange={(event) => setTerm(event.target.value)}
              required
              type="search"
              value={term}
            />
            <Button type="submit"><Search aria-hidden="true" size={17} />Search</Button>
          </div>
        </label>

        <details>
          <summary className="w-fit cursor-pointer text-sm font-semibold text-teamsync-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            Task filters
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {loading && <p className="text-sm text-slate-600" role="status">Searching…</p>}
      {!query.trim() && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">Enter a search term to find records you can access.</p>}
      {!loading && query.trim() && results && (
        <div className="space-y-5">
          <ResultSection title="Projects" count={results.projects.count}>
            {results.projects.results.map((item) => (
              <li key={item.id}>
                <Link className="font-semibold text-teamsync-navy hover:underline" to={resultLink(item.workspace_id, item.id)}>{item.name}</Link>
                <p className="mt-1 text-xs text-slate-500">{item.workspace_name} · {item.status}</p>
              </li>
            ))}
          </ResultSection>
          <ResultSection title="Tasks" count={results.tasks.count}>
            {results.tasks.results.map((item) => (
              <li key={item.id}>
                <Link className="font-semibold text-teamsync-navy hover:underline" to={resultLink(item.workspace_id, item.project_id, item.id)}>{item.title}</Link>
                <p className="mt-1 text-xs text-slate-500">{item.project_name} · {item.status.replaceAll('_', ' ')} · {item.priority}{item.due_date ? ` · Due ${item.due_date}` : ''}</p>
              </li>
            ))}
          </ResultSection>
          <ResultSection title="Members" count={results.members.count}>
            {results.members.results.map((item) => (
              <li key={`${item.id}:${item.workspace_id}`}>
                <p className="font-semibold text-slate-900">{[item.first_name, item.last_name].filter(Boolean).join(' ') || item.username}</p>
                <p className="mt-1 text-xs text-slate-500">{item.username} · {item.workspace_name}</p>
              </li>
            ))}
          </ResultSection>
          <ResultSection title="Task comments" count={results.comments.count}>
            {results.comments.results.map((item) => (
              <li key={item.id}>
                <Link className="font-semibold text-teamsync-navy hover:underline" to={resultLink(item.workspace_id, item.project_id, item.task_id)}>{item.task_title}</Link>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.body}</p>
                <p className="mt-1 text-xs text-slate-500">{item.project_name} · {item.author_username ?? 'Former member'}</p>
              </li>
            ))}
          </ResultSection>
          {results.projects.count + results.tasks.count + results.members.count + results.comments.count === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No matching records you can access.</p>
          )}
          {totalPages > 1 && (
            <nav aria-label="Search result pages" className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-500">{count} results</span>
      </div>
      {Children.count(children) > 0 ? (
        <ul className="divide-y divide-slate-100 px-5 [&>li]:py-4">{children}</ul>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-500">No matching {title.toLowerCase()}.</p>
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
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" onChange={(event) => onChange(event.target.value)} type={type} value={value} />
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
    <label className="text-xs font-medium text-slate-600">
      {label}
      <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  )
}
