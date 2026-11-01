import { useEffect, useState } from 'react'
import { FolderPlus, Search } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { ProjectFormDialog } from '../components/projects/ProjectFormDialog'
import type { ProjectFormValues } from '../components/projects/ProjectFormDialog'
import { ProjectStatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
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
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
      to={`/workspaces/${project.workspace_id}/projects/${project.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-slate-950">{project.name}</h2>
        <ProjectStatusBadge status={project.status} />
      </div>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">
        {project.description || 'No description'}
      </p>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
        <span>{project.current_user_project_role ?? 'Workspace admin'}</span>
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
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-teamsync-navy">Workspace projects</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            {workspace?.name ?? 'Projects'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Browse and manage projects available to you in this workspace.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <FolderPlus aria-hidden="true" size={17} />
            New project
          </Button>
        )}
      </div>

      <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search projects</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search projects"
            type="search"
            value={searchInput}
          />
        </label>
        <label className="text-sm text-slate-600">
          <span className="sr-only">Filter by status</span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 md:w-40"
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
        <label className="text-sm text-slate-600">
          <span className="sr-only">Filter archived projects</span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 md:w-40"
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
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {stale ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500" role="status">
          Loading projects…
        </div>
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
