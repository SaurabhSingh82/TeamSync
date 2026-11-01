import { CalendarDays, CircleUserRound, Clock3, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { AvatarGroup } from '../components/projects/AvatarGroup'
import { useProjectContext } from '../components/projects/projectContext'
import { ProjectRoleBadge } from '../components/ui/Badge'
import { canManageProject } from '../projects/permissions'
import { formatDate, formatTimestamp } from '../projects/format'

export function ProjectOverviewPage() {
  const { project, members, memberCount } = useProjectContext()
  const { workspaceId } = useParams()
  const canManage = canManageProject(project)

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-950">Project overview</h2>
          {project.current_user_project_role && (
            <ProjectRoleBadge role={project.current_user_project_role} />
          )}
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">
          {project.description || 'Add a description in project settings to give members more context.'}
        </p>
        <div className="mt-7 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <Metadata label="Start date" value={project.start_date ? formatDate(project.start_date) : 'Not set'} icon={<CalendarDays size={17} />} />
          <Metadata label="Due date" value={project.due_date ? formatDate(project.due_date) : 'Not set'} icon={<CalendarDays size={17} />} />
          <Metadata label="Created by" value={project.created_by_username} icon={<CircleUserRound size={17} />} />
          <Metadata label="Last updated" value={formatTimestamp(project.updated_at)} icon={<Clock3 size={17} />} />
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Project members</h2>
              <p className="mt-1 text-sm text-slate-500">{memberCount} {memberCount === 1 ? 'person' : 'people'}</p>
            </div>
            <Users aria-hidden="true" className="text-slate-400" size={19} />
          </div>
          <div className="mt-5">
            <AvatarGroup people={members} total={memberCount} />
          </div>
          {members.length > 0 && (
            <ul className="mt-5 divide-y divide-slate-100">
              {members.slice(0, 5).map((member) => (
                <li className="flex items-center justify-between gap-3 py-3" key={member.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.username}
                    </p>
                    <p className="truncate text-xs text-slate-500">@{member.username}</p>
                  </div>
                  <span className="shrink-0 text-xs capitalize text-slate-500">
                    {member.role === 'manager' ? 'Manager' : member.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link className="mt-4 inline-flex text-sm font-semibold text-teamsync-navy hover:underline" to={`/workspaces/${workspaceId}/projects/${project.id}/members`}>
            View all members
          </Link>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-950">Project access</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Project membership is limited to people in this workspace. Workspace access rules continue to apply.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <span className="text-sm text-slate-600">Your workspace role</span>
            <span className="text-sm font-semibold capitalize text-slate-800">{project.current_user_workspace_role}</span>
          </div>
          {canManage && (
            <Link
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              to={`/workspaces/${workspaceId}/projects/${project.id}/members`}
            >
              Manage project members
            </Link>
          )}
        </section>
      </aside>
    </div>
  )
}

function Metadata({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-medium text-slate-700">{value}</p>
      </div>
    </div>
  )
}
