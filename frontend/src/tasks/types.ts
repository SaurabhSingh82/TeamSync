import type { ProjectMember, ProjectPage } from '../projects/types'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed'

export interface TaskLabel {
  id: string
  project_id: string
  name: string
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  title: string
  description: string
  creator_id: string | null
  creator_username: string | null
  assignees: ProjectMember[]
  collaborators: ProjectMember[]
  priority: TaskPriority
  status: TaskStatus
  start_date: string | null
  due_date: string | null
  labels: TaskLabel[]
  subtask_count: number
  completed_subtask_count: number
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface Subtask {
  id: string
  task_id: string
  title: string
  is_completed: boolean
  created_by_id: string | null
  created_by_username: string | null
  created_at: string
  updated_at: string
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string | null
  author_username: string | null
  author_first_name: string | null
  author_last_name: string | null
  body: string
  created_at: string
  updated_at: string
}

export interface TaskFilters {
  project_id: string
  search?: string
  status?: TaskStatus
  priority?: TaskPriority
  assignee?: string
  due_after?: string
  due_before?: string
  due_date?: string
  archived?: 'true' | 'false' | 'all'
  page?: number
  page_size?: number
}

export type TaskPage<T> = ProjectPage<T>
