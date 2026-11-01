import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, FolderKanban, Users } from 'lucide-react'
import { Link, NavLink, Outlet, useParams } from 'react-router'

import { getApiErrorMessage } from '../../auth/errors'
import { getProject, listProjectMembers } from '../../projects/api'
import type { Project, ProjectMember } from '../../projects/types'
import { formatDate } from '../../projects/format'
import { ProjectStatusBadge } from '../ui/Badge'
import { AvatarGroup } from './AvatarGroup'
import type { ProjectOutletContext } from './projectContext'

export function ProjectLayout() {
  const { projectId, workspaceId } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [error, setError] = useState('')
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectId) return
    const [updatedProject, memberPage] = await Promise.all([
      getProject(projectId),
      listProjectMembers(projectId, { page_size: 5 }),
    ])
    setProject(updatedProject)
    setMembers(memberPage.results)
    setMemberCount(memberPage.count)
    setError('')
  }, [projectId])

  useEffect(() => {
    let active = true
    if (!projectId) return
    void Promise.all([
      getProject(projectId),
      listProjectMembers(projectId, { page_size: 5 }),
    ])
      .then(([loadedProject, memberPage]) => {
        if (active) {
          setProject(loadedProject)
          setMembers(memberPage.results)
          setMemberCount(memberPage.count)
          setError('')
          setLoadedProjectId(projectId)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setProject(null)
          setMembers([])
          setMemberCount(0)
          setError(getApiErrorMessage(loadError))
          setLoadedProjectId(projectId)
        }
      })
    return () => {
      active = false
    }
  }, [projectId])

  if (loadedProjectId !== projectId) {
    return <p className="text-sm text-slate-600" role="status">Loading project…</p>
  }
  if (!project || project.workspace_id !== workspaceId) {
    return (
      <section>
        <p className="text-sm text-red-800" role="alert">{error || 'Project not found.'}</p>
        <Link className="mt-4 inline-flex text-sm font-semibold text-teamsync-navy hover:underline" to={`/workspaces/${workspaceId}/projects`}>
          Return to projects
        </Link>
      </section>
    )
  }

  const tabs = [
    { to: `/workspaces/${workspaceId}/projects/${project.id}`, label: 'Overview', end: true },
    { to: `/workspaces/${workspaceId}/projects/${project.id}/members`, label: 'Members', end: false },
    { to: `/workspaces/${workspaceId}/projects/${project.id}/settings`, label: 'Settings', end: false },
  ]

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Link className="inline-flex items-center gap-1.5 hover:text-teamsync-navy" to={`/workspaces/${workspaceId}/projects`}>
              <FolderKanban aria-hidden="true" size={15} />
              Projects
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate text-slate-600">{project.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
            {project.archived_at && (
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Archived
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden="true" size={15} />
              {project.due_date ? `Due ${formatDate(project.due_date)}` : 'No due date'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users aria-hidden="true" size={15} />
              {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </span>
          </div>
        </div>
        <AvatarGroup people={members} total={memberCount} />
      </div>

      <nav aria-label="Project navigation" className="mt-8 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          <NavLink
            className={({ isActive }) => `whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${isActive ? 'border-teamsync-navy text-teamsync-navy' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
            end={tab.end}
            key={tab.label}
            to={tab.to}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {error && (
        <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <div className="pt-6">
        <Outlet context={{ project, members, memberCount, setProject, refresh } satisfies ProjectOutletContext} />
      </div>
    </section>
  )
}
