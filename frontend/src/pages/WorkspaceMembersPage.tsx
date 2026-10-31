import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { ConfirmDialog } from '../components/workspaces/ConfirmDialog'
import { InviteMemberDialog } from '../components/workspaces/InviteMemberDialog'
import {
  getWorkspace,
  inviteWorkspaceMember,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
  transferWorkspaceOwnership,
  updateWorkspaceMember,
} from '../workspaces/api'
import type {
  Workspace,
  WorkspaceInvitation,
  WorkspaceInvitableRole,
  WorkspaceMember,
  WorkspaceRole,
} from '../workspaces/types'

type Confirmation =
  | { kind: 'remove'; member: WorkspaceMember }
  | { kind: 'transfer'; member: WorkspaceMember }
  | null

const roleLabels: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

async function fetchWorkspacePage(workspaceId: string) {
  const workspace = await getWorkspace(workspaceId)
  const members = await listWorkspaceMembers(workspaceId)
  const invitations = ['owner', 'admin'].includes(workspace.current_user_role)
    ? (await listWorkspaceInvitations(workspaceId)).filter(
        (invitation) =>
          invitation.status === 'pending' || invitation.status === 'expired',
      )
    : []
  return { workspace, members, invitations }
}

export function WorkspaceMembersPage() {
  const { workspaceId } = useParams()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [transferTargetId, setTransferTargetId] = useState('')

  const load = useCallback(async () => {
    if (!workspaceId) return
    const data = await fetchWorkspacePage(workspaceId)
    setWorkspace(data.workspace)
    setMembers(data.members)
    setInvitations(data.invitations)
    setError('')
  }, [workspaceId])

  async function refreshAfterMutation() {
    try {
      await load()
    } catch (loadError) {
      setError(
        `The change succeeded, but the workspace details could not be refreshed: ${getApiErrorMessage(loadError)}`,
      )
    }
  }

  useEffect(() => {
    let active = true
    if (!workspaceId) return
    void fetchWorkspacePage(workspaceId)
      .then((data) => {
        if (active) {
          setWorkspace(data.workspace)
          setMembers(data.members)
          setInvitations(data.invitations)
          setError('')
          setLoadedWorkspaceId(workspaceId)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setWorkspace(null)
          setMembers([])
          setInvitations([])
          setError(getApiErrorMessage(loadError))
          setLoadedWorkspaceId(workspaceId)
        }
      })
    return () => {
      active = false
    }
  }, [workspaceId])

  async function handleInvite(input: {
    email: string
    role: WorkspaceInvitableRole
  }) {
    if (!workspaceId) return
    setBusyAction('invite')
    setError('')
    try {
      await inviteWorkspaceMember(workspaceId, input)
      setNotice(`Invitation created for ${input.email}; email delivery is queued.`)
      await refreshAfterMutation()
    } finally {
      setBusyAction('')
    }
  }

  async function handleRoleChange(
    member: WorkspaceMember,
    role: Exclude<WorkspaceRole, 'owner'>,
  ) {
    if (!workspaceId) return
    setError('')
    setNotice('')
    setBusyAction(member.id)
    try {
      await updateWorkspaceMember(workspaceId, member.id, role)
      setNotice(`${member.username}'s role was updated.`)
      await refreshAfterMutation()
    } catch (updateError) {
      setError(getApiErrorMessage(updateError))
    } finally {
      setBusyAction('')
    }
  }

  async function handleRemove(member: WorkspaceMember) {
    if (!workspaceId) return
    setError('')
    setBusyAction(member.id)
    try {
      await removeWorkspaceMember(workspaceId, member.id)
      setConfirmation(null)
      setNotice(`${member.username} was removed from the workspace.`)
      await refreshAfterMutation()
    } catch (removeError) {
      setError(getApiErrorMessage(removeError))
    } finally {
      setBusyAction('')
    }
  }

  async function handleTransfer(member: WorkspaceMember) {
    if (!workspaceId) return
    setError('')
    setBusyAction(member.id)
    try {
      await transferWorkspaceOwnership(workspaceId, member.id)
      setConfirmation(null)
      setTransferTargetId('')
      setNotice(`Ownership transferred to ${member.username}. Your role is now Admin.`)
      await refreshAfterMutation()
    } catch (transferError) {
      setError(getApiErrorMessage(transferError))
    } finally {
      setBusyAction('')
    }
  }

  async function handleInvitationAction(
    invitation: WorkspaceInvitation,
    action: 'resend' | 'revoke',
  ) {
    if (!workspaceId) return
    setError('')
    setNotice('')
    setBusyAction(invitation.id)
    try {
      if (action === 'resend') {
        await resendWorkspaceInvitation(workspaceId, invitation.id)
        setNotice(`A new invitation email for ${invitation.email} is queued.`)
      } else {
        await revokeWorkspaceInvitation(workspaceId, invitation.id)
        setNotice(`Invitation to ${invitation.email} was revoked.`)
      }
      await refreshAfterMutation()
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
    } finally {
      setBusyAction('')
    }
  }

  if (loadedWorkspaceId !== workspaceId) {
    return <p role="status">Loading workspace members…</p>
  }
  if (!workspace) {
    return (
      <section>
        <p className="text-red-700" role="alert">{error || 'Workspace not found.'}</p>
        <Link className="mt-4 inline-block text-indigo-700 underline" to="/">
          Return home
        </Link>
      </section>
    )
  }

  const isOwner = workspace.current_user_role === 'owner'
  const isAdmin = workspace.current_user_role === 'admin'
  const canManage = isOwner || isAdmin
  const transferTarget = members.find((member) => member.id === transferTargetId)

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm font-medium text-indigo-700 hover:underline"
            to={`/workspaces/${workspace.id}`}
          >
            {workspace.name} settings
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Members
          </h1>
          <p className="mt-2 text-slate-600">
            Your role: <span className="font-medium">{roleLabels[workspace.current_user_role]}</span>
          </p>
        </div>
        {canManage && (
          <InviteMemberDialog
            busy={busyAction === 'invite'}
            onInvite={handleInvite}
            role={workspace.current_user_role}
          />
        )}
      </div>

      {error && <p className="mt-5 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="mt-5 text-sm text-emerald-800" role="status">{notice}</p>}

      <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Member</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              {canManage && <th className="px-4 py-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((member) => {
              const manageable =
                member.role !== 'owner' &&
                (isOwner || (isAdmin && ['member', 'viewer'].includes(member.role)))
              return (
                <tr key={member.id}>
                  <td className="px-4 py-4">
                    <span className="font-medium text-slate-900">
                      {[member.first_name, member.last_name].filter(Boolean).join(' ') ||
                        member.username}
                    </span>
                    <span className="block text-xs text-slate-500">@{member.username}</span>
                  </td>
                  <td className="px-4 py-4">
                    {manageable ? (
                      <select
                        aria-label={`Role for ${member.username}`}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
                        disabled={busyAction === member.id}
                        onChange={(event) => {
                          const role = event.target.value
                          if (
                            role === 'admin' ||
                            role === 'member' ||
                            role === 'viewer'
                          ) {
                            void handleRoleChange(member, role)
                          }
                        }}
                        value={member.role}
                      >
                        {isOwner && <option value="admin">Admin</option>}
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      roleLabels[member.role]
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {new Date(member.joined_at).toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="px-4 py-4">
                      {manageable && (
                        <button
                          className="text-sm font-medium text-red-700 hover:underline"
                          disabled={busyAction === member.id}
                          onClick={() => setConfirmation({ kind: 'remove', member })}
                          type="button"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
            {members.length === 0 && (
              <tr>
                <td
                  className="px-4 py-10 text-center text-slate-500"
                  colSpan={canManage ? 4 : 3}
                >
                  No workspace members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-slate-950">Pending invitations</h2>
          {invitations.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
              No invitations have been sent.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {invitations.map((invitation) => {
                const canManageInvitation =
                  isOwner || invitation.role !== 'admin'
                return (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                    key={invitation.id}
                  >
                    <div>
                      <p className="font-medium text-slate-900">{invitation.email}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {roleLabels[invitation.role]} · {invitation.status} · expires{' '}
                        {new Date(invitation.expires_at).toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Email {invitation.email_delivery.status} ·{' '}
                        {invitation.email_delivery.attempts} attempt
                        {invitation.email_delivery.attempts === 1 ? '' : 's'}
                      </p>
                    </div>
                    {canManageInvitation && (
                      <div className="flex gap-3">
                        {(invitation.status === 'pending' ||
                          invitation.status === 'expired') && (
                          <button
                            className="text-sm font-medium text-indigo-700 hover:underline"
                            disabled={busyAction === invitation.id}
                            onClick={() => void handleInvitationAction(invitation, 'resend')}
                            type="button"
                          >
                            {invitation.email_delivery.status === 'failed'
                              ? 'Retry email'
                              : 'Resend'}
                          </button>
                        )}
                        {invitation.status === 'pending' && (
                          <button
                            className="text-sm font-medium text-red-700 hover:underline"
                            disabled={busyAction === invitation.id}
                            onClick={() => void handleInvitationAction(invitation, 'revoke')}
                            type="button"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {isOwner && (
        <section className="mt-12 border-t border-slate-200 pt-6">
          <h2 className="text-xl font-semibold text-slate-950">Transfer ownership</h2>
          <p className="mt-2 text-sm text-slate-600">
            The selected member becomes Owner, and you become an Admin.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="sr-only" htmlFor="ownership-target">
              Select a new owner
            </label>
            <select
              className="min-w-60 rounded-md border border-slate-300 bg-white px-3 py-2"
              id="ownership-target"
              onChange={(event) => setTransferTargetId(event.target.value)}
              value={transferTargetId}
            >
              <option value="">Select a workspace member</option>
              {members
                .filter((member) => member.role !== 'owner')
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name || member.username} · {roleLabels[member.role]}
                  </option>
                ))}
            </select>
            <button
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
              disabled={!transferTarget}
              onClick={() => {
                if (transferTarget) setConfirmation({ kind: 'transfer', member: transferTarget })
              }}
              type="button"
            >
              Transfer ownership
            </button>
          </div>
        </section>
      )}

      {confirmation?.kind === 'remove' && (
        <ConfirmDialog
          busy={busyAction === confirmation.member.id}
          confirmLabel="Remove member"
          description={
            <>Remove <strong>{confirmation.member.username}</strong>? Their workspace access will be revoked immediately.</>
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void handleRemove(confirmation.member)}
          title="Remove this member?"
        />
      )}
      {confirmation?.kind === 'transfer' && (
        <ConfirmDialog
          busy={busyAction === confirmation.member.id}
          confirmLabel="Transfer ownership"
          description={
            <>Transfer ownership to <strong>{confirmation.member.username}</strong>? You will become an Admin.</>
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void handleTransfer(confirmation.member)}
          title="Confirm ownership transfer"
        />
      )}
    </section>
  )
}
