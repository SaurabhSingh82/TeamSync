import type { ProjectRole, ProjectStatus } from '../../projects/types'

const statusLabels: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
}

const statusClasses: Record<ProjectStatus, string> = {
  planning: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-800',
  on_hold: 'bg-amber-100 text-amber-900',
  completed: 'bg-blue-100 text-blue-900',
}

const roleLabels: Record<ProjectRole, string> = {
  manager: 'Project Manager',
  member: 'Member',
  viewer: 'Viewer',
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  )
}

export function ProjectRoleBadge({ role }: { role: ProjectRole }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
      {roleLabels[role]}
    </span>
  )
}
