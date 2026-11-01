export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'
export type WorkspaceInvitableRole = Exclude<WorkspaceRole, 'owner'>
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'
export type InvitationEmailStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'unknown'

export interface Workspace {
  id: string
  name: string
  description: string
  owner_id: string
  current_user_role: WorkspaceRole
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  id: string
  user_id: string
  username: string
  first_name: string
  last_name: string
  avatar_url: string | null
  role: WorkspaceRole
  joined_at: string
}

export interface WorkspaceInvitation {
  id: string
  email: string
  role: WorkspaceInvitableRole
  status: InvitationStatus
  invited_by_id: string | null
  created_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  email_delivery: {
    status: InvitationEmailStatus
    attempts: number
    last_error: string
  }
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
