import { useEffect, useState } from 'react'
import { FolderPlus, Search } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { ProjectFormDialog } from '../components/projects/ProjectFormDialog'
import type { ProjectFormValues } from '../components/projects/ProjectFormDialog'
import { ProjectStatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { InlineLoader } from '../components/ui/Loading'
import { createProject, listWorkspaceProjects } from '../projects/api'
import type { Project, ProjectFilters, ProjectStatus } from '../projects/types'
import { getWorkspace } from '../workspaces/api'
import type { Workspace } from '../workspaces/types'

const statuses: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
]

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      className="group block rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700"
      to={`/workspaces/${project.workspace_id}/projects/${project.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
          {project.name}
        </h2>
        <ProjectStatusBadge status={project.status} />
      </div>
      <p className="mt-1.5 line-clamp-2 min-h-8 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {project.description || 'No description provided'}
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800/80">
        <span>{project.current_user_project_role ?? 'Workspace member'}</span>
        <span>{project.due_date ? `Due ${formatDate(project.due_date)}` : 'No due date'}</span>
      </div>
    </Link>
  )
}

export function ProjectsPage() {
  const { workspaceId } = useParams()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProjectStatus | ''>('')
  const [archived, setArchived] = useState<'false' | 'true' | 'all'>('false')
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const pageSize = 20
  const requestKey = `${workspaceId}:${page}:${search}:${status}:${archived}`
  const navigate = useNavigate()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let active = true
    if (!workspaceId) return
    const filters: ProjectFilters = { page, page_size: pageSize, archived }
    if (search) filters.search = search
    if (status) filters.status = status
    void Promise.all([
      getWorkspace(workspaceId),
      listWorkspaceProjects(workspaceId, filters),
    ])
      .then(([loadedWorkspace, result]) => {
        if (active) {
          setWorkspace(loadedWorkspace)
          setProjects(result.results)
          setCount(result.count)
          setError('')
          setLoadedKey(requestKey)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setWorkspace(null)
          setProjects([])
          setCount(0)
          setError(getApiErrorMessage(loadError))
          setLoadedKey(requestKey)
        }
      })
    return () => {
      active = false
    }
  }, [workspaceId, page, search, status, archived, requestKey])

  async function handleCreate(values: ProjectFormValues) {
    if (!workspaceId) return
    const project = await createProject(workspaceId, values)
    navigate(`/workspaces/${workspaceId}/projects/${project.id}`)
  }

  const canCreate = workspace
    ? workspace.current_user_role === 'owner' || workspace.current_user_role === 'admin'
    : false
  const stale = loadedKey !== requestKey

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Workspace Projects
          </p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
            {workspace?.name ?? 'Projects'}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Browse, manage, and track deliverables across active workspace projects.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <FolderPlus aria-hidden="true" size={15} />
            New project
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90 md:flex-row md:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search projects</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search projects…"
            type="search"
            value={searchInput}
          />
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-400">
          <span className="sr-only">Filter by status</span>
          <select
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 md:w-36"
            onChange={(event) => {
              setStatus(event.target.value as ProjectStatus | '')
              setPage(1)
            }}
            value={status}
          >
            <option value="">All statuses</option>
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-400">
          <span className="sr-only">Filter archived projects</span>
          <select
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 md:w-36"
            onChange={(event) => {
              setArchived(event.target.value as 'false' | 'true' | 'all')
              setPage(1)
            }}
            value={archived}
          >
            <option value="false">Active projects</option>
            <option value="true">Archived projects</option>
            <option value="all">All projects</option>
          </select>
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
          {error}
        </p>
      )}

      {stale ? (
        <InlineLoader message="Loading projects…" />
      ) : projects.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <FolderPlus aria-hidden="true" className="mx-auto text-slate-400" size={28} />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            {search || status || archived !== 'false' ? 'No matching projects' : 'No projects yet'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            {canCreate
              ? 'Create a project to give your workspace a focused place for collaboration.'
              : 'Projects you can access will appear here.'}
          </p>
          {canCreate && (
            <Button className="mt-5" onClick={() => setShowCreateDialog(true)}>
              New project
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3.5" scope="col">Project</th>
                  <th className="px-5 py-3.5" scope="col">Status</th>
                  <th className="px-5 py-3.5" scope="col">Due date</th>
                  <th className="px-5 py-3.5" scope="col">Your role</th>
                  <th className="px-5 py-3.5" scope="col">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <tr className="hover:bg-slate-50/80" key={project.id}>
                    <td className="max-w-md px-5 py-4">
                      <Link className="font-semibold text-slate-900 hover:text-teamsync-navy hover:underline" to={`/workspaces/${project.workspace_id}/projects/${project.id}`}>
                        {project.name}
                      </Link>
                      <p className="mt-1 truncate text-sm text-slate-500">{project.description || 'No description'}</p>
                    </td>
                    <td className="px-5 py-4"><ProjectStatusBadge status={project.status} /></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(project.due_date)}</td>
                    <td className="px-5 py-4 text-sm capitalize text-slate-600">{project.current_user_project_role ?? 'Workspace admin'}</td>
                    <td className="px-5 py-4 text-sm text-slate-500">{formatDate(project.updated_at.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 grid gap-3 md:hidden">
            {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <p>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} of {count}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                variant="secondary"
              >
                Previous
              </Button>
              <Button
                disabled={page * pageSize >= count}
                onClick={() => setPage((current) => current + 1)}
                variant="secondary"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {showCreateDialog && (
        <ProjectFormDialog
          onClose={() => setShowCreateDialog(false)}
          onSave={handleCreate}
        />
      )}
    </section>
  )
}
