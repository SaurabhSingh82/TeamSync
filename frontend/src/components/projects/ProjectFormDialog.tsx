import { useState, type FormEvent } from 'react'

import { getApiErrorMessage } from '../../auth/errors'
import type { ProjectStatus } from '../../projects/types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

export interface ProjectFormValues {
  name: string
  description: string
  status: ProjectStatus
  start_date: string | null
  due_date: string | null
}

interface ProjectFormDialogProps {
  onClose: () => void
  onSave: (values: ProjectFormValues) => Promise<void>
}

const statuses: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
]

export function ProjectFormDialog({
  onClose,
  onSave,
}: ProjectFormDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('planning')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        status,
        start_date: startDate || null,
        due_date: dueDate || null,
      })
    } catch (saveError) {
      setError(getApiErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      closeDisabled={saving}
      description="Set the project details. You can update these settings later."
      onClose={onClose}
      title="Create a project"
    >
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-medium text-slate-700">
          Project name
          <input
            autoFocus
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950"
            maxLength={150}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950"
            maxLength={5000}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            value={description}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Status
          <select
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950"
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            value={status}
          >
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Start date
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950"
              max={dueDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
              type="date"
              value={startDate}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Due date
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950"
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
        <div className="flex justify-end gap-3 pt-2">
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Saving…' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
