import type { Project } from './types'

export function canManageProject(project: Project) {
  if (project.workspace_archived) return false
  if (project.current_user_workspace_role === 'viewer') return false
  return (
    project.current_user_workspace_role === 'owner' ||
    project.current_user_workspace_role === 'admin' ||
    project.current_user_project_role === 'manager'
  )
}

export function canDeleteProject(project: Project) {
  if (project.workspace_archived) return false
  return (
    project.current_user_workspace_role === 'owner' ||
    project.current_user_workspace_role === 'admin'
  )
}
