import type { Project } from './types'

export function canManageProject(project: Project) {
  if (project.current_user_workspace_role === 'viewer') return false
  return (
    project.current_user_workspace_role === 'owner' ||
    project.current_user_workspace_role === 'admin' ||
    project.current_user_project_role === 'manager'
  )
}

export function canDeleteProject(project: Project) {
  return (
    project.current_user_workspace_role === 'owner' ||
    project.current_user_workspace_role === 'admin'
  )
}
