import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import {
  acceptReceivedInvitation,
  listReceivedInvitations,
  rejectReceivedInvitation,
} from '../workspaces/api'
import type { WorkspaceInvitation } from '../workspaces/types'

export function InvitationsPage() {
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      setInvitations(await listReceivedInvitations())
      setError('')
    } catch (loadError) {
      setError(getApiErrorMessage(loadError))
    }
  }, [])

  useEffect(() => {
    let active = true
    void listReceivedInvitations()
      .then((result) => {
        if (active) setInvitations(result)
      })
      .catch((loadError: unknown) => {
        if (active) setError(getApiErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [])

  async function act(invitation: WorkspaceInvitation, action: 'accept' | 'reject') {
    setBusyId(invitation.id)
    setError('')
    try {
      if (action === 'accept') {
        const result = await acceptReceivedInvitation(invitation.id)
        navigate(`/workspaces/${result.workspace.id}`, { replace: true })
      } else {
        await rejectReceivedInvitation(invitation.id)
        await load()
      }
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
      await load()
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Invitations</h1>
      <p className="mt-2 text-sm text-slate-600">Workspace invitations sent to your account.</p>
      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-6 space-y-4">
        {invitations.length === 0 && (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
            You have no invitations.
          </p>
        )}
        {invitations.map((invitation) => {
          const pending = invitation.status === 'pending'
          return (
            <article className="rounded-lg border border-slate-200 bg-white p-5" key={invitation.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-950">{invitation.workspace_name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {invitation.invited_by_name || 'A workspace administrator'} invited you as a {invitation.role}.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                  {invitation.status}
                </span>
              </div>
              {invitation.message && (
                <p className="mt-4 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  {invitation.message}
                </p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Expires {new Date(invitation.expires_at).toLocaleString()}
              </p>
              {pending && (
                <div className="mt-4 flex gap-3">
                  <button
                    className="teamsync-primary-button rounded-md px-4 py-2 text-sm font-semibold"
                    disabled={busyId === invitation.id}
                    onClick={() => void act(invitation, 'accept')}
                    type="button"
                  >
                    Accept
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    disabled={busyId === invitation.id}
                    onClick={() => void act(invitation, 'reject')}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              )}
              {!pending && invitation.workspace_id && (
                <Link className="mt-4 inline-block text-sm text-indigo-700 hover:underline" to={`/workspaces/${invitation.workspace_id}`}>
                  Open workspace
                </Link>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
