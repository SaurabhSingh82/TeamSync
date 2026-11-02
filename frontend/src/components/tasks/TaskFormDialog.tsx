import { useState, type FormEvent } from 'react'

import { getApiErrorMessage } from '../../auth/errors'
import type { ProjectMember } from '../../projects/types'
import type { TaskLabel, TaskPriority, TaskStatus } from '../../tasks/types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { taskPriorities, taskStatuses, personName } from '../../tasks/options'

export interface TaskCreateValues {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  start_date: string | null
  due_date: string | null
  assignee_ids: string[]
  collaborator_ids: string[]
  label_ids: string[]
}

export function TaskFormDialog({
  members,
  labels,
  userId,
  canManageAssignments,
  onClose,
  onSave,
}: {
  members: ProjectMember[]
  labels: TaskLabel[]
  userId: string
  canManageAssignments: boolean
  onClose: () => void
  onSave: (values: TaskCreateValues) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([])
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const availableMembers = canManageAssignments
    ? members
    : members.filter((member) => member.user_id === userId)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        start_date: startDate || null,
        due_date: dueDate || null,
        assignee_ids: assigneeIds,
        collaborator_ids: collaboratorIds,
        label_ids: labelIds,
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
      description="Add a task to this project. You can update its details later."
      onClose={onClose}
      size="large"
      title="Create task"
    >
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-medium text-slate-700">
          Task title
          <input
            autoFocus
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950"
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950"
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            value={description}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Status
            <select
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
              value={status}
            >
              {taskStatuses.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Priority
            <select
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
              value={priority}
            >
              {taskPriorities.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Start date
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5"
              max={dueDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
              type="date"
              value={startDate}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Due date
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5"
              min={startDate || undefined}
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MultiSelect
            label="Assignees"
            onChange={setAssigneeIds}
            options={availableMembers.map((member) => ({
              id: member.user_id,
              label: personName(member),
            }))}
            value={assigneeIds}
          />
          <MultiSelect
            label="Collaborators"
            onChange={setCollaboratorIds}
            options={availableMembers.map((member) => ({
              id: member.user_id,
              label: personName(member),
            }))}
            value={collaboratorIds}
          />
        </div>
        <MultiSelect
          label="Labels"
          onChange={setLabelIds}
          options={labels.map((label) => ({ id: label.id, label: label.name }))}
          value={labelIds}
        />
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
            {saving ? 'Creating…' : 'Create task'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: string; label: string }[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-1.5 block min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
        multiple
        onChange={(event) => {
          onChange(Array.from(event.target.selectedOptions, (option) => option.value))
        }}
        value={value}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}
