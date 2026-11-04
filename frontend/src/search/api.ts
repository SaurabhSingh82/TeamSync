import { apiClient } from '../lib/api/client'
import type { TaskPriority, TaskStatus } from '../tasks/types'

export interface SearchProjectResult {
  id: string
  name: string
  description: string
  status: string
  workspace_id: string
  workspace_name: string
}

export interface SearchTaskResult {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  project_id: string
  project_name: string
  workspace_id: string
}

export interface SearchMemberResult {
  id: string
  username: string
  first_name: string
  last_name: string
  workspace_id: string
  workspace_name: string
}

export interface SearchCommentResult {
  id: string
  body: string
  task_id: string
  task_title: string
  project_id: string
  project_name: string
  workspace_id: string
  author_username: string | null
  created_at: string
}

export interface SearchResultGroup<T> {
  count: number
  page: number
  page_size: number
  results: T[]
}

export interface GlobalSearchResults {
  query: string
  page: number
  page_size: number
  projects: SearchResultGroup<SearchProjectResult>
  tasks: SearchResultGroup<SearchTaskResult>
  members: SearchResultGroup<SearchMemberResult>
  comments: SearchResultGroup<SearchCommentResult>
}

export type GlobalSearchFilters = {
  q: string
  page?: number
  page_size?: number
  project?: string
  status?: TaskStatus
  priority?: TaskPriority
  assignee?: string
  creator?: string
  label?: string
  due_after?: string
  due_before?: string
}

export async function searchTeamSync(filters: GlobalSearchFilters) {
  const { data } = await apiClient.get<GlobalSearchResults>('/search/', {
    params: filters,
  })
  return data
}
