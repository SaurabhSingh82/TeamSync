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
  board_column_id: string
  position: number
  version: number
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
  completed_at: string | null
}

export interface BoardColumn {
  id: string
  board_id: number
  name: string
  status: TaskStatus
  position: number
  is_default: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
  tasks: Task[]
  task_count: number
}

export interface ProjectBoard {
  id: number
  project_id: string
  version: number
  columns: BoardColumn[]
  created_at: string
  updated_at: string
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

export interface TaskActivity {
  id: string
  task_id: string
  actor_id: string | null
  actor_username: string | null
  action: 'created' | 'updated' | 'moved'
  metadata: Record<string, string | string[]>
  created_at: string
}

export interface TaskFilters {
  project_id: string
  search?: string
  status?: TaskStatus
  priority?: TaskPriority
  assignee?: string
  label?: string
  due_after?: string
  due_before?: string
  due_date?: string
  archived?: 'true' | 'false' | 'all'
  page?: number
  page_size?: number
}

export type TaskPage<T> = ProjectPage<T>
