import { apiClient } from '../lib/api/client'
import type {
  PaginatedResponse,
  Workspace,
  WorkspaceInvitation,
  WorkspaceInvitableRole,
  WorkspaceMember,
  WorkspaceRole,
} from './types'

const PAGE_SIZE = 100

async function getAllPages<T>(path: string) {
  const results: T[] = []
  let page = 1
  let count: number

  do {
    const { data } = await apiClient.get<PaginatedResponse<T>>(path, {
      params: { page, page_size: PAGE_SIZE },
    })
    results.push(...data.results)
    count = data.count
    page += 1
  } while (results.length < count)

  return results
}

export function listWorkspaces(options: { archived?: 'true' | 'false' | 'all' } = {}) {
  const query = options.archived ? `?archived=${options.archived}` : ''
  return getAllPages<Workspace>(`/workspaces/${query}`)
}

export async function createWorkspace(input: {
  name: string
  description: string
}) {
  const { data } = await apiClient.post<Workspace>('/workspaces/', input)
  return data
}

export async function getWorkspace(workspaceId: string) {
  const { data } = await apiClient.get<Workspace>(`/workspaces/${workspaceId}/`)
  return data
}

export async function updateWorkspace(
  workspaceId: string,
  input: { name: string; description: string },
) {
  const { data } = await apiClient.patch<Workspace>(
    `/workspaces/${workspaceId}/`,
    input,
  )
  return data
}

export function deleteWorkspace(workspaceId: string) {
  return apiClient.delete(`/workspaces/${workspaceId}/`)
}

export async function archiveWorkspace(workspaceId: string) {
  const { data } = await apiClient.post<Workspace>(
    `/workspaces/${workspaceId}/archive/`,
  )
  return data
}

export async function restoreWorkspace(workspaceId: string) {
  const { data } = await apiClient.post<Workspace>(
    `/workspaces/${workspaceId}/restore/`,
  )
  return data
}

export function leaveWorkspace(workspaceId: string) {
  return apiClient.post(`/workspaces/${workspaceId}/leave/`)
}

export function listWorkspaceMembers(workspaceId: string) {
  return getAllPages<WorkspaceMember>(
    `/workspaces/${workspaceId}/members/`,
  )
}

export async function updateWorkspaceMember(
  workspaceId: string,
  memberId: string,
  role: Exclude<WorkspaceRole, 'owner'>,
) {
  const { data } = await apiClient.patch<WorkspaceMember>(
    `/workspaces/${workspaceId}/members/${memberId}/`,
    { role },
  )
  return data
}

export function removeWorkspaceMember(workspaceId: string, memberId: string) {
  return apiClient.delete(`/workspaces/${workspaceId}/members/${memberId}/`)
}

export async function transferWorkspaceOwnership(
  workspaceId: string,
  memberId: string,
) {
  const { data } = await apiClient.post<{
    workspace: Workspace
    new_owner: WorkspaceMember
  }>(`/workspaces/${workspaceId}/ownership/transfer/`, {
    member_id: memberId,
  })
  return data
}

export function listWorkspaceInvitations(workspaceId: string) {
  return getAllPages<WorkspaceInvitation>(
    `/workspaces/${workspaceId}/invitations/`,
  )
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  input: { email: string; role: WorkspaceInvitableRole; message: string },
) {
  const { data } = await apiClient.post<WorkspaceInvitation>(
    `/workspaces/${workspaceId}/invitations/`,
    input,
  )
  return data
}

export async function revokeWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
) {
  const { data } = await apiClient.post<WorkspaceInvitation>(
    `/workspaces/${workspaceId}/invitations/${invitationId}/revoke/`,
  )
  return data
}

export async function resendWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
) {
  const { data } = await apiClient.post<WorkspaceInvitation>(
    `/workspaces/${workspaceId}/invitations/${invitationId}/resend/`,
  )
  return data
}

export async function acceptWorkspaceInvitation(token: string) {
  const { data } = await apiClient.post<{
    workspace: Workspace
    membership: WorkspaceMember
  }>('/invitations/accept/', { token })
  return data
}

export function rejectWorkspaceInvitation(token: string) {
  return apiClient.post('/invitations/reject/', { token })
}

export function listReceivedInvitations() {
  return getAllPages<WorkspaceInvitation>('/invitations/')
}

export async function acceptReceivedInvitation(invitationId: string) {
  const { data } = await apiClient.post<{
    workspace: Workspace
    membership: WorkspaceMember
  }>(`/invitations/${invitationId}/accept/`)
  return data
}

export async function rejectReceivedInvitation(invitationId: string) {
  const { data } = await apiClient.post<WorkspaceInvitation>(
    `/invitations/${invitationId}/reject/`,
  )
  return data
}
