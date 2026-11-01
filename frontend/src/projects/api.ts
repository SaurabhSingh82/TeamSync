import { apiClient } from '../lib/api/client'
import type {
  Project,
  ProjectFilters,
  ProjectMember,
  ProjectPage,
  ProjectRole,
} from './types'

export async function listWorkspaceProjects(
  workspaceId: string,
  filters: ProjectFilters = {},
) {
  const { data } = await apiClient.get<ProjectPage<Project>>(
    `/workspaces/${workspaceId}/projects/`,
    { params: filters },
  )
  return data
}

export async function createProject(
  workspaceId: string,
  input: {
    name: string
    description: string
    status?: Project['status']
    start_date: string | null
    due_date: string | null
  },
) {
  const { data } = await apiClient.post<Project>(
    `/workspaces/${workspaceId}/projects/`,
    input,
  )
  return data
}

export async function getProject(projectId: string) {
  const { data } = await apiClient.get<Project>(`/projects/${projectId}/`)
  return data
}

export async function updateProject(
  projectId: string,
  input: Partial<
    Pick<Project, 'name' | 'description' | 'status' | 'start_date' | 'due_date'>
  >,
) {
  const { data } = await apiClient.patch<Project>(
    `/projects/${projectId}/`,
    input,
  )
  return data
}

export function deleteProject(projectId: string) {
  return apiClient.delete(`/projects/${projectId}/`)
}

export async function archiveProject(projectId: string) {
  const { data } = await apiClient.post<Project>(
    `/projects/${projectId}/archive/`,
  )
  return data
}

export async function restoreProject(projectId: string) {
  const { data } = await apiClient.post<Project>(
    `/projects/${projectId}/restore/`,
  )
  return data
}

export async function listProjectMembers(
  projectId: string,
  params: { page?: number; page_size?: number } = {},
) {
  const { data } = await apiClient.get<ProjectPage<ProjectMember>>(
    `/projects/${projectId}/members/`,
    { params },
  )
  return data
}

export async function listAllProjectMembers(projectId: string) {
  const members: ProjectMember[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const result = await listProjectMembers(projectId, {
      page,
      page_size: 100,
    })
    members.push(...result.results)
    hasMore = members.length < result.count
    page += 1
  }

  return members
}

export async function addProjectMember(
  projectId: string,
  input: { user_id: string; role: ProjectRole },
) {
  const { data } = await apiClient.post<ProjectMember>(
    `/projects/${projectId}/members/`,
    input,
  )
  return data
}

export async function updateProjectMember(
  projectId: string,
  memberId: string,
  role: ProjectRole,
) {
  const { data } = await apiClient.patch<ProjectMember>(
    `/projects/${projectId}/members/${memberId}/`,
    { role },
  )
  return data
}

export function removeProjectMember(projectId: string, memberId: string) {
  return apiClient.delete(`/projects/${projectId}/members/${memberId}/`)
}
