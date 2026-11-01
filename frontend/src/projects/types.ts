import type { PaginatedResponse } from '../workspaces/types'

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed'
export type ProjectRole = 'manager' | 'member' | 'viewer'

export interface Project {
  id: string
  workspace_id: string
  name: string
  description: string
  status: ProjectStatus
  created_by_id: string
  created_by_username: string
  start_date: string | null
  due_date: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  current_user_project_role: ProjectRole | null
  current_user_workspace_role: 'owner' | 'admin' | 'member' | 'viewer'
}

export interface ProjectMember {
  id: string
  user_id: string
  username: string
  first_name: string
  last_name: string
  avatar_url: string | null
  role: ProjectRole
  joined_at: string
}

export type ProjectPage<T> = PaginatedResponse<T>

export interface ProjectFilters {
  search?: string
  status?: ProjectStatus
  archived?: 'true' | 'false' | 'all'
  page?: number
  page_size?: number
}
