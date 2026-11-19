import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { createWorkspace } from '../workspaces/api'

export function WorkspaceCreatePage() {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    const form = new FormData(event.currentTarget)
    try {
      const workspace = await createWorkspace({
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
      })
      navigate(`/workspaces/${workspace.id}`, { replace: true })
    } catch (createError) {
      setError(getApiErrorMessage(createError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <div className="border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Create a workspace
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Set up a collaborative space to organize projects, tasks, and team members.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Workspace name
            <input
              autoFocus
              className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              maxLength={100}
              name="name"
              placeholder="e.g. Acme Engineering"
              required
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Description
            <textarea
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              maxLength={5000}
              name="description"
              placeholder="Brief overview of the workspace goal…"
              rows={3}
            />
          </label>
          {error && <p className="text-xs text-red-700 dark:text-red-400" role="alert">{error}</p>}
          <button
            className="teamsync-primary-button h-8 rounded-lg px-4 text-xs font-semibold shadow-2xs"
            disabled={saving}
            type="submit"
          >
            {saving ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
      </div>
    </section>
  )
}
