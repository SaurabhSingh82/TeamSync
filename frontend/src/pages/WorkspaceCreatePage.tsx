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
    <section className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        Create a workspace
      </h1>
      <p className="mt-2 text-slate-600">
        Start a shared space and invite your team when you are ready.
      </p>
      <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-medium text-slate-700">
          Workspace name
          <input
            autoFocus
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5"
            maxLength={100}
            name="name"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5"
            maxLength={5000}
            name="description"
            rows={4}
          />
        </label>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <button
          className="rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white disabled:opacity-60"
          disabled={saving}
          type="submit"
        >
          {saving ? 'Creating…' : 'Create workspace'}
        </button>
      </form>
    </section>
  )
}
