import { useState, type FormEvent } from 'react'

import { getApiErrorMessage } from '../../auth/errors'
import type {
  WorkspaceInvitableRole,
  WorkspaceRole,
} from '../../workspaces/types'

interface InviteMemberDialogProps {
  role: WorkspaceRole
  busy: boolean
  onInvite: (input: {
    email: string
    role: WorkspaceInvitableRole
  }) => Promise<void>
}

export function InviteMemberDialog({
  role,
  busy,
  onInvite,
}: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await onInvite({
        email: String(form.get('email') ?? ''),
        role: String(form.get('role') ?? 'member') as WorkspaceInvitableRole,
      })
      formElement.reset()
      setOpen(false)
    } catch (inviteError) {
      setError(getApiErrorMessage(inviteError))
    }
  }

  return (
    <div>
      <button
        className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
        onClick={() => setOpen(true)}
        type="button"
      >
        Invite member
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
          <section
            aria-labelledby="invite-dialog-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
          >
            <h2
              className="text-lg font-semibold text-slate-950"
              id="invite-dialog-title"
            >
              Invite someone to this workspace
            </h2>
            <form className="mt-5 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <label className="block text-sm font-medium text-slate-700">
                Email address
                <input
                  autoComplete="email"
                  className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5"
                  name="email"
                  required
                  type="email"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Workspace role
                <select
                  className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5"
                  defaultValue="member"
                  name="role"
                >
                  {role === 'owner' && <option value="admin">Admin</option>}
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              {error && (
                <p className="text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? 'Sending…' : 'Send invitation'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
