import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { ConfirmDialog } from '../components/workspaces/ConfirmDialog'
import { getApiErrorMessage } from '../auth/errors'
import {
  deleteWorkspace,
  getWorkspace,
  updateWorkspace,
} from '../workspaces/api'
import type { Workspace } from '../workspaces/types'

export function WorkspaceSettingsPage() {
  const { workspaceId } = useParams()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    if (!workspaceId) return
    void getWorkspace(workspaceId)
      .then((item) => {
        if (active) {
          setWorkspace(item)
          setName(item.name)
          setDescription(item.description)
          setError('')
          setLoadedWorkspaceId(workspaceId)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setWorkspace(null)
          setError(getApiErrorMessage(loadError))
          setLoadedWorkspaceId(workspaceId)
        }
      })
    return () => {
      active = false
    }
  }, [workspaceId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspaceId) return
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      const updated = await updateWorkspace(workspaceId, { name, description })
      setWorkspace(updated)
      setName(updated.name)
      setDescription(updated.description)
      setSaved(true)
    } catch (saveError) {
      setError(getApiErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!workspaceId) return
    setError('')
    setDeleting(true)
    try {
      await deleteWorkspace(workspaceId)
      navigate('/', { replace: true })
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loadedWorkspaceId !== workspaceId) {
    return <p role="status">Loading workspace…</p>
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

  const canManage = ['owner', 'admin'].includes(workspace.current_user_role)
  const isOwner = workspace.current_user_role === 'owner'

  return (
    <section className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-700">
            {workspace.current_user_role}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {workspace.name}
          </h1>
        </div>
        <Link
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          to={`/workspaces/${workspace.id}/members`}
        >
          View members
        </Link>
      </div>
      <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-medium text-slate-700">
          Workspace name
          <input
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 disabled:bg-slate-100"
            disabled={!canManage}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 disabled:bg-slate-100"
            disabled={!canManage}
            maxLength={5000}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            value={description}
          />
        </label>
        <p className="text-sm text-slate-600">
          Workspace ID: <code>{workspace.id}</code>
        </p>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        {saved && <p className="text-sm text-emerald-800" role="status">Settings saved.</p>}
        {canManage && (
          <button
            className="rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        )}
      </form>
      {isOwner && (
        <div className="mt-12 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-semibold text-slate-950">Delete workspace</h2>
          <p className="mt-2 text-sm text-slate-600">
            Deleting a workspace permanently removes its memberships and invitations.
          </p>
          <button
            className="mt-4 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
            type="button"
          >
            Delete workspace
          </button>
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          busy={deleting}
          confirmLabel="Delete workspace"
          description={
            <>This permanently deletes <strong>{workspace.name}</strong> and revokes member access.</>
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void handleDelete()}
          title="Delete this workspace?"
        />
      )}
    </section>
  )
}
