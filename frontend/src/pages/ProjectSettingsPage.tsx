import { useState, type FormEvent } from 'react'
import { Archive, RotateCcw, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { useProjectContext } from '../components/projects/projectContext'
import { ConfirmDialog } from '../components/workspaces/ConfirmDialog'
import { Button } from '../components/ui/Button'
import {
  archiveProject,
  deleteProject,
  restoreProject,
  updateProject,
} from '../projects/api'
import { canDeleteProject, canManageProject } from '../projects/permissions'
import type { Project, ProjectStatus } from '../projects/types'

const statuses: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
]

export function ProjectSettingsPage() {
  const { project, setProject } = useProjectContext()
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyAction, setBusyAction] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canManage = canManageProject(project)
  const canDelete = canDeleteProject(project)

  async function handleArchive() {
    setError('')
    setNotice('')
    setBusyAction(true)
    try {
      const updated = project.archived_at
        ? await restoreProject(project.id)
        : await archiveProject(project.id)
      setProject(updated)
      setNotice(project.archived_at ? 'Project restored.' : 'Project archived.')
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
    } finally {
      setBusyAction(false)
    }
  }

  async function handleDelete() {
    setError('')
    setBusyAction(true)
    try {
      await deleteProject(project.id)
      navigate(`/workspaces/${workspaceId}/projects`, { replace: true })
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError))
      setConfirmDelete(false)
    } finally {
      setBusyAction(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          {notice}
        </p>
      )}
      <ProjectDetailsForm
        canManage={canManage}
        key={project.id}
        onSaved={(updated) => {
          setProject(updated)
          setNotice('Project settings saved.')
          setError('')
        }}
        project={project}
      />

      {canManage && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold text-slate-950">Project lifecycle</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {project.archived_at
                  ? 'This project is archived. Restore it to include it in the active project list.'
                  : 'Archive a project to remove it from the active list while preserving its project data.'}
              </p>
            </div>
            <Button disabled={busyAction} onClick={() => void handleArchive()} variant="secondary">
              {project.archived_at ? <RotateCcw aria-hidden="true" size={16} /> : <Archive aria-hidden="true" size={16} />}
              {project.archived_at ? 'Restore project' : 'Archive project'}
            </Button>
          </div>
        </section>
      )}

      {canDelete && (
        <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold text-red-900">Permanently delete project</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Deletion is available only after archiving. This action cannot be undone.
              </p>
            </div>
            <Button
              disabled={!project.archived_at || busyAction}
              onClick={() => setConfirmDelete(true)}
              variant="danger"
            >
              <Trash2 aria-hidden="true" size={16} />
              Delete project
            </Button>
          </div>
        </section>
      )}

      {confirmDelete && (
        <ConfirmDialog
          busy={busyAction}
          confirmLabel="Delete project permanently"
          description={<>Permanently delete <strong>{project.name}</strong>? This project must already be archived.</>}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void handleDelete()}
          title="Delete this project?"
        />
      )}
    </div>
  )
}

function ProjectDetailsForm({
  project,
  canManage,
  onSaved,
}: {
  project: Project
  canManage: boolean
  onSaved: (project: Project) => void
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [status, setStatus] = useState(project.status)
  const [startDate, setStartDate] = useState(project.start_date ?? '')
  const [dueDate, setDueDate] = useState(project.due_date ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      const updated = await updateProject(project.id, {
        name: name.trim(),
        description: description.trim(),
        status,
        start_date: startDate || null,
        due_date: dueDate || null,
      })
      onSaved(updated)
    } catch (saveError) {
      setError(getApiErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Project details</h2>
        <p className="mt-1 text-sm text-slate-500">Update the information and status shown to project members.</p>
      </div>
      <form className="mt-6 max-w-3xl space-y-5" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-medium text-slate-700">
          Project name
          <input
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 disabled:bg-slate-50"
            disabled={!canManage}
            maxLength={150}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 disabled:bg-slate-50"
            disabled={!canManage}
            maxLength={5000}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            value={description}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Status
          <select
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 disabled:bg-slate-50"
            disabled={!canManage}
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            value={status}
          >
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Start date
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 disabled:bg-slate-50"
              disabled={!canManage}
              max={dueDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
              type="date"
              value={startDate}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Due date
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 disabled:bg-slate-50"
              disabled={!canManage}
              min={startDate || undefined}
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </label>
        </div>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        {canManage && (
          <Button disabled={saving} type="submit">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </form>
    </section>
  )
}
