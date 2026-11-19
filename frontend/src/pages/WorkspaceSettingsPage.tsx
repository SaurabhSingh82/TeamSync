import { useEffect, useState, type FormEvent } from 'react'
import { Archive, RotateCcw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'

import { ConfirmDialog } from '../components/workspaces/ConfirmDialog'
import { getApiErrorMessage } from '../auth/errors'
import {
  deleteWorkspace,
  getWorkspace,
  archiveWorkspace,
  restoreWorkspace,
  updateWorkspace,
} from '../workspaces/api'
import type { Workspace } from '../workspaces/types'
import { CenteredLoader } from '../components/ui/Loading'

export function WorkspaceSettingsPage() {
  const { workspaceId } = useParams()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
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

  async function handleArchive() {
    if (!workspaceId || !workspace) return
    setError('')
    setArchiving(true)
    try {
      const updated = workspace.archived_at
        ? await restoreWorkspace(workspaceId)
        : await archiveWorkspace(workspaceId)
      setWorkspace(updated)
      setConfirmArchive(false)
    } catch (archiveError) {
      setError(getApiErrorMessage(archiveError))
      setConfirmArchive(false)
    } finally {
      setArchiving(false)
    }
  }

  if (loadedWorkspaceId !== workspaceId) {
    return <CenteredLoader message="Loading workspace…" />
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

  const canManage =
    !workspace.archived_at &&
    ['owner', 'admin'].includes(workspace.current_user_role)
  const isOwner = workspace.current_user_role === 'owner'

  return (
    <section className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <div>
          <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            {workspace.current_user_role}
          </span>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
            {workspace.name}
          </h1>
        </div>
        <Link
          className="h-8 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          to={`/workspaces/${workspace.id}/members`}
        >
          View members
        </Link>
      </div>

      {workspace.archived_at && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200" role="status">
          This workspace is archived and read-only. Only the Owner can restore it.
        </p>
      )}

      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          General Settings
        </h2>
        <form className="mt-4 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Workspace name
            <input
              className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:disabled:bg-slate-800/40"
              disabled={!canManage}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Description
            <textarea
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-800 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:disabled:bg-slate-800/40"
              disabled={!canManage}
              maxLength={5000}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              value={description}
            />
          </label>
          <p className="text-[11px] text-slate-400">
            Workspace ID: <code className="font-mono text-slate-600 dark:text-slate-300">{workspace.id}</code>
          </p>
          {error && <p className="text-xs text-red-700 dark:text-red-400" role="alert">{error}</p>}
          {saved && <p className="text-xs text-emerald-800 dark:text-emerald-400" role="status">Settings saved successfully.</p>}
          {canManage && (
            <button
              className="teamsync-primary-button h-8 rounded-lg px-4 text-xs font-semibold"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          )}
        </form>
      </div>

      {isOwner && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Workspace Lifecycle
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {workspace.archived_at
              ? 'Restore this workspace to allow members to collaborate and make updates again.'
              : 'Archiving hides this workspace from normal lists and places it in read-only mode.'}
          </p>
          <button
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            disabled={archiving}
            onClick={() => {
              if (workspace.archived_at) void handleArchive()
              else setConfirmArchive(true)
            }}
            type="button"
          >
            {workspace.archived_at
              ? <RotateCcw aria-hidden="true" size={14} />
              : <Archive aria-hidden="true" size={14} />}
            {workspace.archived_at ? 'Restore workspace' : 'Archive workspace'}
          </button>
        </div>
      )}

      {isOwner && (
        <div className="rounded-xl border border-red-200 bg-red-50/20 p-5 shadow-2xs dark:border-red-950/60 dark:bg-red-950/20">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-red-800 dark:text-red-400">
            Danger Zone · Delete Workspace
          </h2>
          <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">
            Permanently removes this workspace, projects, and all member access. This action cannot be reversed.
          </p>
          <button
            className="mt-3 h-8 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-900/40"
            onClick={() => setConfirmDelete(true)}
            type="button"
          >
            Delete workspace
          </button>
        </div>
      )}
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
      {confirmArchive && (
        <ConfirmDialog
          busy={archiving}
          confirmLabel="Archive workspace"
          description={
            <>Archive <strong>{workspace.name}</strong>? Members will retain read access, but workspace changes will be disabled.</>
          }
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => void handleArchive()}
          title="Archive this workspace?"
        />
      )}
    </section>
  )
}
