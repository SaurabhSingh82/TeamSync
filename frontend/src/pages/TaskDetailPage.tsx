import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Archive,
  Check,
  Copy,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  Users,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { useAuth } from '../auth/useAuth'
import { useProjectContext } from '../components/projects/projectContext'
import { TaskPriorityBadge, TaskStatusBadge } from '../components/tasks/TaskBadge'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/workspaces/ConfirmDialog'
import { listAllProjectMembers } from '../projects/api'
import { canManageProject } from '../projects/permissions'
import type { ProjectMember } from '../projects/types'
import {
  addTaskAssignee,
  addTaskCollaborator,
  addTaskLabel,
  archiveTask,
  createProjectLabel,
  createSubtask,
  createTaskComment,
  deleteSubtask,
  deleteTask,
  deleteTaskComment,
  duplicateTask,
  getTask,
  listProjectLabels,
  listTaskComments,
  listTaskSubtasks,
  removeTaskAssignee,
  removeTaskCollaborator,
  removeTaskLabel,
  restoreTask,
  updateSubtask,
  updateTask,
  updateTaskComment,
} from '../tasks/api'
import { formatTaskDate, formatTaskTimestamp } from '../tasks/format'
import { personName, taskPriorities, taskStatuses } from '../tasks/options'
import type { Subtask, Task, TaskComment, TaskLabel, TaskPriority, TaskStatus } from '../tasks/types'

export function TaskDetailPage() {
  const { taskId, workspaceId, projectId } = useParams()
  const { project } = useProjectContext()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [task, setTask] = useState<Task | null>(null)
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [loadedTaskId, setLoadedTaskId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!taskId) return
    const [currentTask, subtaskPage, commentPage, projectMembers, projectLabels] =
      await Promise.all([
        getTask(taskId),
        listTaskSubtasks(taskId),
        listTaskComments(taskId),
        listAllProjectMembers(project.id),
        listProjectLabels(project.id),
      ])
    setTask(currentTask)
    setSubtasks(subtaskPage.results)
    setComments(commentPage.results)
    setMembers(projectMembers)
    setLabels(projectLabels)
    setError('')
  }, [project.id, taskId])

  useEffect(() => {
    let active = true
    if (!taskId) return
    void Promise.all([
      getTask(taskId),
      listTaskSubtasks(taskId),
      listTaskComments(taskId),
      listAllProjectMembers(project.id),
      listProjectLabels(project.id),
    ])
      .then(([currentTask, subtaskPage, commentPage, projectMembers, projectLabels]) => {
        if (active) {
          setTask(currentTask)
          setSubtasks(subtaskPage.results)
          setComments(commentPage.results)
          setMembers(projectMembers)
          setLabels(projectLabels)
          setError('')
          setLoadedTaskId(taskId)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setTask(null)
          setError(getApiErrorMessage(loadError))
          setLoadedTaskId(taskId)
        }
      })
    return () => {
      active = false
    }
  }, [project.id, taskId])

  const isManager = canManageProject(project)
  const isProjectMember = project.current_user_workspace_role !== 'viewer' &&
    project.current_user_project_role === 'member'
  const isParticipant = Boolean(
    task &&
    user &&
    (
      task.creator_id === user.id ||
      task.assignees.some((member) => member.user_id === user.id) ||
      task.collaborators.some((member) => member.user_id === user.id)
    ),
  )
  const canEdit = isManager || (isProjectMember && isParticipant)
  const canManageOwnAssignments = isProjectMember
  const progress = !task?.subtask_count
    ? 0
    : Math.round((task.completed_subtask_count / task.subtask_count) * 100)

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await action()
      setNotice(successMessage)
      await refresh()
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!taskId) return
    setBusy(true)
    setError('')
    try {
      await deleteTask(taskId)
      navigate(`/workspaces/${workspaceId}/projects/${projectId}/tasks`, { replace: true })
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError))
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleDuplicate() {
    if (!taskId) return
    setBusy(true)
    setError('')
    try {
      const duplicate = await duplicateTask(taskId)
      navigate(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${duplicate.id}`)
    } catch (duplicateError) {
      setError(getApiErrorMessage(duplicateError))
    } finally {
      setBusy(false)
    }
  }

  if (loadedTaskId !== taskId) {
    return <p className="text-sm text-slate-600" role="status">Loading task…</p>
  }
  if (!task || task.project_id !== project.id) {
    return (
      <section>
        <p className="text-sm text-red-800" role="alert">{error || 'Task not found.'}</p>
        <Link className="mt-4 inline-flex text-sm font-semibold text-teamsync-navy hover:underline" to={`/workspaces/${workspaceId}/projects/${projectId}/tasks`}>
          Return to project tasks
        </Link>
      </section>
    )
  }

  const currentUserIsAssignee = task.assignees.some((member) => member.user_id === user?.id)
  const currentUserIsCollaborator = task.collaborators.some((member) => member.user_id === user?.id)

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          <Link className="hover:text-teamsync-navy" to={`/workspaces/${workspaceId}/projects/${projectId}/tasks`}>
            Tasks
          </Link>
          <span aria-hidden="true" className="mx-2">/</span>
          <span className="text-slate-700">{task.title}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button disabled={busy} onClick={() => void handleDuplicate()} variant="secondary">
              <Copy aria-hidden="true" size={16} />
              Duplicate
            </Button>
          )}
          {isManager && (
            <>
              <Button
                disabled={busy}
                onClick={() => void runAction(
                  () => task.archived_at ? restoreTask(task.id) : archiveTask(task.id),
                  task.archived_at ? 'Task restored.' : 'Task archived.',
                )}
                variant="secondary"
              >
                {task.archived_at ? <RotateCcw aria-hidden="true" size={16} /> : <Archive aria-hidden="true" size={16} />}
                {task.archived_at ? 'Restore' : 'Archive'}
              </Button>
              <Button disabled={busy} onClick={() => setConfirmDelete(true)} variant="danger">
                <Trash2 aria-hidden="true" size={16} />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{notice}</p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <div className="space-y-5">
          <TaskEditor
            canEdit={canEdit}
            key={`${task.id}:${task.updated_at}`}
            onSave={async (values) => {
              await updateTask(task.id, values)
              await refresh()
              setNotice('Task updated.')
            }}
            task={task}
          />
          <SubtaskSection
            canEdit={canEdit}
            onError={setError}
            onRefresh={refresh}
            subtasks={subtasks}
            task={task}
          />
          <CommentSection
            canComment={canEdit}
            comments={comments}
            currentUserId={user?.id ?? ''}
            isManager={isManager}
            onError={setError}
            onRefresh={refresh}
            taskId={task.id}
          />
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-950">Task overview</h2>
              <TaskStatusBadge status={task.status} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500">Priority</span>
              <TaskPriorityBadge priority={task.priority} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">Start date</p>
                <p className="mt-1 text-slate-700">{formatTaskDate(task.start_date)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">Due date</p>
                <p className="mt-1 text-slate-700">{formatTaskDate(task.due_date)}</p>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
              Created by {task.creator_username ?? 'Former member'} · {formatTaskTimestamp(task.created_at)}
            </div>
            {task.archived_at && (
              <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">This task is archived.</p>
            )}
          </section>

          <MembershipSection
            canManage={isManager}
            canManageOwnAssignments={canManageOwnAssignments}
            currentUserIsAssignee={currentUserIsAssignee}
            currentUserIsCollaborator={currentUserIsCollaborator}
            members={members}
            onError={setError}
            onRefresh={refresh}
            task={task}
            userId={user?.id ?? ''}
          />

          <LabelSection
            canEdit={canEdit}
            isManager={isManager}
            labels={labels}
            onError={setError}
            onRefresh={refresh}
            task={task}
          />
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Subtask progress</h2>
            <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
              <span>{task.completed_subtask_count} of {task.subtask_count} complete</span>
              <span>{progress}%</span>
            </div>
            <div aria-label={`${progress}% of subtasks complete`} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-teamsync-navy transition-all" style={{ width: `${progress}%` }} />
            </div>
          </section>
        </aside>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          busy={busy}
          confirmLabel="Delete task"
          description={<>Permanently delete <strong>{task.title}</strong>, including its subtasks and comments?</>}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void handleDelete()}
          title="Delete this task?"
        />
      )}
    </section>
  )
}

function TaskEditor({
  task,
  canEdit,
  onSave,
}: {
  task: Task
  canEdit: boolean
  onSave: (values: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'start_date' | 'due_date'>>) => Promise<void>
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [startDate, setStartDate] = useState(task.start_date ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-medium text-slate-700">
          Task title
          <input
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xl font-semibold text-slate-950 disabled:border-transparent disabled:bg-transparent disabled:px-0"
            disabled={!canEdit}
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm leading-6 text-slate-700 disabled:border-transparent disabled:bg-transparent disabled:px-0"
            disabled={!canEdit}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            value={description}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Status
            <select
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-50"
              disabled={!canEdit}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
              value={status}
            >
              {taskStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Priority
            <select
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-50"
              disabled={!canEdit}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
              value={priority}
            >
              {taskPriorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Start date
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 disabled:bg-slate-50"
              disabled={!canEdit}
              max={dueDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
              type="date"
              value={startDate}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Due date
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 disabled:bg-slate-50"
              disabled={!canEdit}
              min={startDate || undefined}
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </label>
        </div>
        {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
        {canEdit && (
          <div className="flex justify-end">
            <Button disabled={saving} type="submit">{saving ? 'Saving…' : 'Save task'}</Button>
          </div>
        )}
      </form>
    </section>
  )
}

function MembershipSection({
  task,
  members,
  userId,
  canManage,
  canManageOwnAssignments,
  currentUserIsAssignee,
  currentUserIsCollaborator,
  onRefresh,
  onError,
}: {
  task: Task
  members: ProjectMember[]
  userId: string
  canManage: boolean
  canManageOwnAssignments: boolean
  currentUserIsAssignee: boolean
  currentUserIsCollaborator: boolean
  onRefresh: () => Promise<void>
  onError: (message: string) => void
}) {
  const [selectedAssignee, setSelectedAssignee] = useState('')
  const [selectedCollaborator, setSelectedCollaborator] = useState('')

  async function mutate(action: () => Promise<unknown>) {
    onError('')
    try {
      await action()
      await onRefresh()
    } catch (error) {
      onError(getApiErrorMessage(error))
    }
  }

  const assignedIds = new Set(task.assignees.map((item) => item.user_id))
  const collaboratorIds = new Set(task.collaborators.map((item) => item.user_id))

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Users aria-hidden="true" className="text-slate-400" size={18} />
        <h2 className="font-semibold text-slate-950">People</h2>
      </div>
      <PersonAssignmentList
        canManage={canManage}
        canManageSelf={canManageOwnAssignments}
        currentUserId={userId}
        label="Assignees"
        members={task.assignees}
        onRemove={(id) => void mutate(() => removeTaskAssignee(task.id, id))}
      />
      {canManage ? (
        <div className="mt-2 flex gap-2">
          <select
            aria-label="Assign project member"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
            onChange={(event) => setSelectedAssignee(event.target.value)}
            value={selectedAssignee}
          >
            <option value="">Assign a member…</option>
            {members.filter((member) => !assignedIds.has(member.user_id)).map((member) => (
              <option key={member.user_id} value={member.user_id}>{personName(member)}</option>
            ))}
          </select>
          <Button
            disabled={!selectedAssignee}
            onClick={() => void mutate(async () => {
              await addTaskAssignee(task.id, selectedAssignee)
              setSelectedAssignee('')
            })}
            type="button"
          >
            Assign
          </Button>
        </div>
      ) : canManageOwnAssignments && !currentUserIsAssignee ? (
        <Button
          className="mt-2"
          onClick={() => void mutate(() => addTaskAssignee(task.id, userId))}
          type="button"
          variant="secondary"
        >
          Add me as assignee
        </Button>
      ) : canManageOwnAssignments && currentUserIsAssignee ? (
        <Button
          className="mt-2"
          onClick={() => void mutate(() => removeTaskAssignee(task.id, userId))}
          type="button"
          variant="quiet"
        >
          Remove me as assignee
        </Button>
      ) : null}

      <PersonAssignmentList
        canManage={canManage}
        canManageSelf={canManageOwnAssignments}
        currentUserId={userId}
        label="Collaborators"
        members={task.collaborators}
        onRemove={(id) => void mutate(() => removeTaskCollaborator(task.id, id))}
      />
      {canManage ? (
        <div className="mt-2 flex gap-2">
          <select
            aria-label="Add task collaborator"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
            onChange={(event) => setSelectedCollaborator(event.target.value)}
            value={selectedCollaborator}
          >
            <option value="">Add a collaborator…</option>
            {members.filter((member) => !collaboratorIds.has(member.user_id)).map((member) => (
              <option key={member.user_id} value={member.user_id}>{personName(member)}</option>
            ))}
          </select>
          <Button
            disabled={!selectedCollaborator}
            onClick={() => void mutate(async () => {
              await addTaskCollaborator(task.id, selectedCollaborator)
              setSelectedCollaborator('')
            })}
            type="button"
          >
            Add
          </Button>
        </div>
      ) : canManageOwnAssignments && !currentUserIsCollaborator ? (
        <Button
          className="mt-2"
          onClick={() => void mutate(() => addTaskCollaborator(task.id, userId))}
          type="button"
          variant="secondary"
        >
          Add me as collaborator
        </Button>
      ) : canManageOwnAssignments && currentUserIsCollaborator ? (
        <Button
          className="mt-2"
          onClick={() => void mutate(() => removeTaskCollaborator(task.id, userId))}
          type="button"
          variant="quiet"
        >
          Remove me as collaborator
        </Button>
      ) : null}
    </section>
  )
}

function PersonAssignmentList({
  label,
  members,
  canManage,
  canManageSelf,
  currentUserId,
  onRemove,
}: {
  label: string
  members: ProjectMember[]
  canManage: boolean
  canManageSelf: boolean
  currentUserId: string
  onRemove: (userId: string) => void
}) {
  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      {members.length ? (
        <ul className="mt-2 space-y-2">
          {members.map((member) => (
            <li className="flex items-center gap-2" key={member.id}>
              <Avatar alt={personName(member)} className="size-7" name={personName(member)} src={member.avatar_url} />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{personName(member)}</span>
              {(canManage || (canManageSelf && member.user_id === currentUserId)) && (
                <button
                  aria-label={`Remove ${personName(member)} from ${label.toLowerCase()}`}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-700"
                  onClick={() => onRemove(member.user_id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No {label.toLowerCase()} yet.</p>
      )}
    </div>
  )
}

function LabelSection({
  task,
  labels,
  canEdit,
  isManager,
  onRefresh,
  onError,
}: {
  task: Task
  labels: TaskLabel[]
  canEdit: boolean
  isManager: boolean
  onRefresh: () => Promise<void>
  onError: (message: string) => void
}) {
  const [selectedLabel, setSelectedLabel] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const attachedIds = new Set(task.labels.map((label) => label.id))
  const availableLabels = labels.filter((label) => !attachedIds.has(label.id))

  async function apply(action: () => Promise<unknown>, successMessage = '') {
    onError('')
    setSaving(true)
    try {
      await action()
      if (successMessage) setNewLabel('')
      setSelectedLabel('')
      await onRefresh()
    } catch (error) {
      onError(getApiErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Tag aria-hidden="true" className="text-slate-400" size={18} />
        <h2 className="font-semibold text-slate-950">Labels</h2>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {task.labels.map((label) => (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700" key={label.id}>
            {label.name}
            {canEdit && (
              <button
                aria-label={`Remove label ${label.name}`}
                className="rounded-full hover:text-red-700"
                onClick={() => void apply(() => removeTaskLabel(task.id, label.id))}
                type="button"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!task.labels.length && <span className="text-sm text-slate-500">No labels.</span>}
      </div>
      {canEdit && (
        <div className="mt-4 flex gap-2">
          <select
            aria-label="Add project label to task"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
            onChange={(event) => setSelectedLabel(event.target.value)}
            value={selectedLabel}
          >
            <option value="">Add a label…</option>
            {availableLabels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
          </select>
          <Button
            disabled={!selectedLabel || saving}
            onClick={() => void apply(() => addTaskLabel(task.id, selectedLabel))}
            type="button"
            variant="secondary"
          >
            Add
          </Button>
        </div>
      )}
      {isManager && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!newLabel.trim()) return
            void apply(() => createProjectLabel(task.project_id, newLabel), 'created')
          }}
        >
          <input
            aria-label="Create project label"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
            maxLength={40}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Create a project label"
            value={newLabel}
          />
          <Button disabled={!newLabel.trim() || saving} type="submit" variant="secondary">
            <Plus aria-hidden="true" size={15} />
            Create
          </Button>
        </form>
      )}
    </section>
  )
}

function SubtaskSection({
  task,
  subtasks,
  canEdit,
  onRefresh,
  onError,
}: {
  task: Task
  subtasks: Subtask[]
  canEdit: boolean
  onRefresh: () => Promise<void>
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  async function run(action: () => Promise<unknown>) {
    onError('')
    setSaving(true)
    try {
      await action()
      setTitle('')
      await onRefresh()
    } catch (error) {
      onError(getApiErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Subtasks</h2>
          <p className="mt-1 text-sm text-slate-500">
            {task.completed_subtask_count} of {task.subtask_count} complete
          </p>
        </div>
        <Check aria-hidden="true" className="text-slate-400" size={19} />
      </div>
      {subtasks.length ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {subtasks.map((subtask) => (
            <li className="flex items-center gap-3 py-3" key={subtask.id}>
              <input
                aria-label={`Mark ${subtask.title} ${subtask.is_completed ? 'incomplete' : 'completed'}`}
                checked={subtask.is_completed}
                className="size-4 rounded border-slate-300 text-teamsync-navy"
                disabled={!canEdit || saving}
                onChange={(event) => void run(() => updateSubtask(task.id, subtask.id, { is_completed: event.target.checked }))}
                type="checkbox"
              />
              <span className={`min-w-0 flex-1 text-sm ${subtask.is_completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {subtask.title}
              </span>
              {canEdit && (
                <button
                  aria-label={`Delete subtask ${subtask.title}`}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-700"
                  disabled={saving}
                  onClick={() => void run(() => deleteSubtask(task.id, subtask.id))}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No subtasks yet.</p>
      )}
      {canEdit && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (title.trim()) void run(() => createSubtask(task.id, title))
          }}
        >
          <input
            aria-label="New subtask title"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a subtask"
            value={title}
          />
          <Button disabled={!title.trim() || saving} type="submit">
            <Plus aria-hidden="true" size={16} />
            Add
          </Button>
        </form>
      )}
    </section>
  )
}

function CommentSection({
  taskId,
  comments,
  currentUserId,
  canComment,
  isManager,
  onRefresh,
  onError,
}: {
  taskId: string
  comments: TaskComment[]
  currentUserId: string
  canComment: boolean
  isManager: boolean
  onRefresh: () => Promise<void>
  onError: (message: string) => void
}) {
  const [body, setBody] = useState('')
  const [editId, setEditId] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function run(action: () => Promise<unknown>, clearComposer = false) {
    onError('')
    setSaving(true)
    try {
      await action()
      if (clearComposer) {
        setBody('')
        setEditId('')
      }
      await onRefresh()
    } catch (error) {
      onError(getApiErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Comments</h2>
      {canComment && (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (body.trim()) void run(() => createTaskComment(taskId, body), true)
          }}
        >
          <label className="block text-sm font-medium text-slate-700">
            Add a comment
            <textarea
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              value={body}
            />
          </label>
          <div className="mt-3 flex justify-end">
            <Button disabled={!body.trim() || saving} type="submit">
              {saving ? 'Posting…' : 'Post comment'}
            </Button>
          </div>
        </form>
      )}
      {comments.length ? (
        <ul className="mt-5 divide-y divide-slate-100">
          {comments.map((comment) => {
            const author = [comment.author_first_name, comment.author_last_name].filter(Boolean).join(' ') || comment.author_username || 'Former member'
            const ownComment = comment.author_id === currentUserId
            const canManageOwnComment = canComment && ownComment
            return (
              <li className="py-4" key={comment.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{author}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatTaskTimestamp(comment.created_at)}</p>
                  </div>
                  {(canManageOwnComment || isManager) && editId !== comment.id && (
                    <div className="flex gap-2">
                      {canManageOwnComment && (
                        <button
                          className="text-xs font-semibold text-teamsync-navy hover:underline"
                          onClick={() => {
                            setEditId(comment.id)
                            setEditBody(comment.body)
                          }}
                          type="button"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        className="text-xs font-semibold text-red-700 hover:underline"
                        disabled={saving}
                        onClick={() => void run(() => deleteTaskComment(taskId, comment.id))}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                {editId === comment.id ? (
                  <form
                    className="mt-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void run(() => updateTaskComment(taskId, comment.id, editBody), true)
                    }}
                  >
                    <textarea
                      autoFocus
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      onChange={(event) => setEditBody(event.target.value)}
                      rows={3}
                      value={editBody}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button onClick={() => setEditId('')} type="button" variant="secondary">Cancel</Button>
                      <Button disabled={!editBody.trim() || saving} type="submit">Save comment</Button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.body}</p>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No comments yet.</p>
      )}
    </section>
  )
}
