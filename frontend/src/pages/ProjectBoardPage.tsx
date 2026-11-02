import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  GripVertical,
  ListChecks,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link, useLocation, useNavigate, useParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { useAuth } from '../auth/useAuth'
import { TaskFormDialog } from '../components/tasks/TaskFormDialog'
import type { TaskCreateValues } from '../components/tasks/TaskFormDialog'
import { TaskPriorityBadge } from '../components/tasks/TaskBadge'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { AvatarGroup } from '../components/projects/AvatarGroup'
import { listAllProjectMembers } from '../projects/api'
import { canManageProject } from '../projects/permissions'
import type { ProjectMember } from '../projects/types'
import { useProjectContext } from '../components/projects/projectContext'
import {
  archiveBoardColumn,
  createBoardColumn,
  createTask,
  deleteBoardColumn,
  getProjectBoard,
  listProjectLabels,
  moveTask,
  reorderBoardColumns,
  restoreBoardColumn,
  updateBoardColumn,
} from '../tasks/api'
import { formatTaskDate } from '../tasks/format'
import { taskPriorities, taskStatuses } from '../tasks/options'
import { moveTaskOptimistically } from '../tasks/boardState'
import type { BoardColumn, ProjectBoard, Task, TaskLabel, TaskPriority, TaskStatus } from '../tasks/types'

type ColumnAction =
  | { kind: 'rename'; column: BoardColumn }
  | { kind: 'archive' | 'delete'; column: BoardColumn }

const columnStatusStyles: Record<TaskStatus, string> = {
  todo: 'bg-slate-400',
  in_progress: 'bg-blue-600',
  review: 'bg-amber-500',
  completed: 'bg-emerald-500',
}

export function ProjectBoardPage({
  refreshKey = 0,
}: {
  refreshKey?: number
}) {
  const { project } = useProjectContext()
  const { user } = useAuth()
  const { workspaceId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [board, setBoard] = useState<ProjectBoard | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [priority, setPriority] = useState<TaskPriority | ''>('')
  const [assignee, setAssignee] = useState('')
  const [label, setLabel] = useState('')
  const [dueAfter, setDueAfter] = useState('')
  const [dueBefore, setDueBefore] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [createTaskStatus, setCreateTaskStatus] = useState<TaskStatus>('todo')
  const [createTaskColumnId, setCreateTaskColumnId] = useState<string | null>(null)
  const [showCreateColumn, setShowCreateColumn] = useState(false)
  const [columnAction, setColumnAction] = useState<ColumnAction | null>(null)
  const [newColumnName, setNewColumnName] = useState('')
  const [newColumnStatus, setNewColumnStatus] = useState<TaskStatus>('todo')
  const [renameValue, setRenameValue] = useState('')
  const [destinationColumnId, setDestinationColumnId] = useState('')
  const [savingDialog, setSavingDialog] = useState(false)
  const pageKey = `${project.id}:${refreshKey}:${includeArchived}`
  const canManageBoard = canManageProject(project)
  const canCreateTask =
    project.current_user_workspace_role !== 'viewer' &&
    (canManageBoard || project.current_user_project_role === 'member')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const loadBoard = useCallback(async () => {
    const [currentBoard, projectMembers, projectLabels] = await Promise.all([
      getProjectBoard(project.id, {}, includeArchived),
      listAllProjectMembers(project.id),
      listProjectLabels(project.id),
    ])
    setBoard(currentBoard)
    setMembers(projectMembers)
    setLabels(projectLabels)
    setError('')
    setLoadedKey(pageKey)
    return currentBoard
  }, [includeArchived, pageKey, project.id])

  useEffect(() => {
    let active = true
    void Promise.all([
      getProjectBoard(project.id, {}, includeArchived),
      listAllProjectMembers(project.id),
      listProjectLabels(project.id),
    ])
      .then(([currentBoard, projectMembers, projectLabels]) => {
        if (!active) return
        setBoard(currentBoard)
        setMembers(projectMembers)
        setLabels(projectLabels)
        setError('')
        setLoadedKey(pageKey)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setBoard(null)
        setError(getApiErrorMessage(loadError))
        setLoadedKey(pageKey)
      })
    return () => {
      active = false
    }
  }, [includeArchived, pageKey, project.id])

  const visibleColumns = useMemo(() => {
    if (!board) return []
    return board.columns.map((column) => ({
      ...column,
      visibleTasks: column.tasks.filter((task) => {
        const query = search.trim().toLocaleLowerCase()
        if (
          query &&
          !task.title.toLocaleLowerCase().includes(query) &&
          !task.description.toLocaleLowerCase().includes(query)
        ) return false
        if (status && task.status !== status) return false
        if (priority && task.priority !== priority) return false
        if (assignee && !task.assignees.some((member) => member.user_id === assignee)) return false
        if (label && !task.labels.some((taskLabel) => taskLabel.id === label)) return false
        if (dueAfter && (!task.due_date || task.due_date < dueAfter)) return false
        if (dueBefore && (!task.due_date || task.due_date > dueBefore)) return false
        return true
      }),
    }))
  }, [assignee, board, dueAfter, dueBefore, label, priority, search, status])

  async function reloadAfterMutation() {
    try {
      await loadBoard()
    } catch (loadError) {
      setError(getApiErrorMessage(loadError))
    }
  }

  async function handleMove(event: DragEndEvent) {
    if (!board || !event.over || mutating) return
    const taskId = String(event.active.id)
    const source = board.columns.find((column) => column.tasks.some((task) => task.id === taskId))
    if (!source || source.archived_at) return
    const task = source.tasks.find((item) => item.id === taskId)
    if (!task || !canMoveTask(task)) return

    const overId = String(event.over.id)
    const destination =
      board.columns.find((column) => column.id === overId) ??
      board.columns.find((column) => column.tasks.some((item) => item.id === overId))
    if (!destination || destination.archived_at) return

    const overTask = destination.tasks.find((item) => item.id === overId)
    let position = overTask
      ? overTask.position - (source.id === destination.id && task.position < overTask.position ? 1 : 0)
      : destination.tasks.filter((item) => item.id !== task.id).length
    position = Math.max(0, position)
    if (source.id === destination.id && task.position === position) return

    const originalBoard = board
    setError('')
    setBoard(moveTaskOptimistically(board, task.id, destination.id, position))
    setMutating(true)
    try {
      await moveTask(task.id, {
        column_id: destination.id,
        position,
        expected_task_version: task.version,
        expected_board_version: board.version,
      })
      await reloadAfterMutation()
    } catch (moveError) {
      setBoard(originalBoard)
      const message = getApiErrorMessage(moveError)
      await reloadAfterMutation()
      setError(message)
    } finally {
      setMutating(false)
    }
  }

  function canMoveTask(task: Task) {
    if (canManageBoard) return true
    if (project.current_user_workspace_role === 'viewer' || project.current_user_project_role !== 'member') {
      return false
    }
    return Boolean(
      user &&
      (
        task.creator_id === user.id ||
        task.assignees.some((member) => member.user_id === user.id) ||
        task.collaborators.some((member) => member.user_id === user.id)
      ),
    )
  }

  async function handleCreateTask(values: TaskCreateValues) {
    const task = await createTask({
      project_id: project.id,
      ...(createTaskColumnId ? { board_column_id: createTaskColumnId } : {}),
      ...values,
    })
    setShowCreateTask(false)
    setCreateTaskColumnId(null)
    await reloadAfterMutation()
    navigate(
      `/workspaces/${workspaceId}/projects/${project.id}/tasks/${task.id}${location.search}`,
    )
  }

  async function handleCreateColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!board || !newColumnName.trim()) return
    setSavingDialog(true)
    setError('')
    try {
      await createBoardColumn(project.id, {
        name: newColumnName.trim(),
        status: newColumnStatus,
        expected_board_version: board.version,
      })
      setShowCreateColumn(false)
      setNewColumnName('')
      await reloadAfterMutation()
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
    } finally {
      setSavingDialog(false)
    }
  }

  async function handleRenameColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!board || columnAction?.kind !== 'rename' || !renameValue.trim()) return
    setSavingDialog(true)
    setError('')
    try {
      await updateBoardColumn(columnAction.column.id, {
        name: renameValue.trim(),
        expected_board_version: board.version,
      })
      setColumnAction(null)
      await reloadAfterMutation()
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
    } finally {
      setSavingDialog(false)
    }
  }

  async function handleColumnAction() {
    if (!board || !columnAction || columnAction.kind === 'rename') return
    setSavingDialog(true)
    setError('')
    try {
      if (columnAction.kind === 'archive') {
        await archiveBoardColumn(
          columnAction.column.id,
          destinationColumnId || null,
          board.version,
        )
      } else {
        await deleteBoardColumn(
          columnAction.column.id,
          destinationColumnId || null,
          board.version,
        )
      }
      setColumnAction(null)
      setDestinationColumnId('')
      await reloadAfterMutation()
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
    } finally {
      setSavingDialog(false)
    }
  }

  async function handleRestoreColumn(column: BoardColumn) {
    if (!board || mutating) return
    setMutating(true)
    setError('')
    try {
      await restoreBoardColumn(column.id, board.version)
      await reloadAfterMutation()
    } catch (actionError) {
      const message = getApiErrorMessage(actionError)
      await reloadAfterMutation()
      setError(message)
    } finally {
      setMutating(false)
    }
  }

  async function handleColumnOrder(column: BoardColumn, direction: -1 | 1) {
    if (!board || mutating) return
    const active = board.columns.filter((item) => !item.archived_at)
    const index = active.findIndex((item) => item.id === column.id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= active.length) return
    const reordered = arrayMove(active, index, nextIndex)
    setMutating(true)
    setError('')
    try {
      await reorderBoardColumns(
        project.id,
        reordered.map((item) => item.id),
        board.version,
      )
      await reloadAfterMutation()
    } catch (actionError) {
      const message = getApiErrorMessage(actionError)
      await reloadAfterMutation()
      setError(message)
    } finally {
      setMutating(false)
    }
  }

  const activeColumnCount = board?.columns.filter((column) => !column.archived_at).length ?? 0
  const loading = loadedKey !== pageKey

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-teamsync-navy">Project work</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Kanban board</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Drag tasks between columns to update their status and order.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageBoard && (
            <Button onClick={() => setShowCreateColumn(true)} variant="secondary">
              <Settings2 aria-hidden="true" size={16} />
              Add column
            </Button>
          )}
          {canCreateTask && (
            <Button onClick={() => {
              setCreateTaskStatus('todo')
              setCreateTaskColumnId(null)
              setShowCreateTask(true)
            }}>
              <Plus aria-hidden="true" size={17} />
              New task
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-52 flex-1">
            <span className="sr-only">Search tasks</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks"
              type="search"
              value={search}
            />
          </label>
          <div className="min-w-36">
            <FilterSelect ariaLabel="Filter by status" onChange={(value) => setStatus(value as TaskStatus | '')} value={status}>
              <option value="">All statuses</option>
              {taskStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </FilterSelect>
          </div>
          <div className="min-w-36">
            <FilterSelect ariaLabel="Filter by priority" onChange={(value) => setPriority(value as TaskPriority | '')} value={priority}>
              <option value="">All priorities</option>
              {taskPriorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </FilterSelect>
          </div>
          <div className="min-w-40">
            <FilterSelect ariaLabel="Filter by assignee" onChange={setAssignee} value={assignee}>
              <option value="">All assignees</option>
              {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.username}</option>)}
            </FilterSelect>
          </div>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              More filters
            </summary>
            <div className="absolute right-0 z-20 mt-2 grid w-64 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <FilterSelect ariaLabel="Filter by label" onChange={setLabel} value={label}>
                <option value="">All labels</option>
                {labels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </FilterSelect>
              <label className="text-xs font-medium text-slate-500">
                Due after
                <input
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
                  onChange={(event) => setDueAfter(event.target.value)}
                  type="date"
                  value={dueAfter}
                />
              </label>
              <label className="text-xs font-medium text-slate-500">
                Due before
                <input
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
                  onChange={(event) => setDueBefore(event.target.value)}
                  type="date"
                  value={dueBefore}
                />
              </label>
              {canManageBoard && (
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    checked={includeArchived}
                    onChange={(event) => setIncludeArchived(event.target.checked)}
                    type="checkbox"
                  />
                  Show archived columns
                </label>
              )}
            </div>
          </details>
          <button
            className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={() => {
              setSearch('')
              setStatus('')
              setPriority('')
              setAssignee('')
              setLabel('')
              setDueAfter('')
              setDueBefore('')
              setIncludeArchived(false)
            }}
            type="button"
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500" role="status">
          Loading board…
        </div>
      ) : !board ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
          The board could not be loaded.
        </div>
      ) : (
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={(event) => void handleMove(event)}
          sensors={sensors}
        >
          <div className="mt-6 flex items-start gap-5 overflow-x-auto pb-5">
            {visibleColumns.map((column) => (
              <BoardColumnView
                canManage={canManageBoard}
                canMoveTask={canMoveTask}
                column={column}
                index={visibleColumns
                  .filter((item) => !item.archived_at)
                  .findIndex((item) => item.id === column.id)}
                key={column.id}
                locationSearch={location.search}
                mutating={mutating}
                onArchive={() => {
                  setDestinationColumnId('')
                  setColumnAction({ kind: 'archive', column })
                }}
                onAddTask={canCreateTask ? () => {
                  setCreateTaskStatus(column.status)
                  setCreateTaskColumnId(column.id)
                  setShowCreateTask(true)
                } : undefined}
                onDelete={() => {
                  setDestinationColumnId('')
                  setColumnAction({ kind: 'delete', column })
                }}
                onMoveColumn={handleColumnOrder}
                onRename={() => {
                  setRenameValue(column.name)
                  setColumnAction({ kind: 'rename', column })
                }}
                onRestore={() => void handleRestoreColumn(column)}
                totalActiveColumns={activeColumnCount}
                workspaceId={workspaceId ?? ''}
                projectId={project.id}
              />
            ))}
            {visibleColumns.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                No columns are available.
              </p>
            )}
          </div>
        </DndContext>
      )}

      {showCreateTask && (
        <TaskFormDialog
          canManageAssignments={canManageBoard}
          defaultStatus={createTaskStatus}
          labels={labels}
          members={members}
          onClose={() => setShowCreateTask(false)}
          onSave={handleCreateTask}
          userId={user?.id ?? ''}
        />
      )}

      {showCreateColumn && (
        <Dialog
          closeDisabled={savingDialog}
          description="Add a column to organize this project's workflow."
          onClose={() => setShowCreateColumn(false)}
          title="Add board column"
        >
          <form className="space-y-4" onSubmit={(event) => void handleCreateColumn(event)}>
            <label className="block text-sm font-medium text-slate-700">
              Column name
              <input
                autoFocus
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5"
                maxLength={100}
                onChange={(event) => setNewColumnName(event.target.value)}
                required
                value={newColumnName}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Tasks in this column use status
              <select
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                onChange={(event) => setNewColumnStatus(event.target.value as TaskStatus)}
                value={newColumnStatus}
              >
                {taskStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <DialogActions
              onCancel={() => setShowCreateColumn(false)}
              saving={savingDialog}
              submitLabel="Add column"
            />
          </form>
        </Dialog>
      )}

      {columnAction?.kind === 'rename' && (
        <Dialog
          closeDisabled={savingDialog}
          description="Update the name shown on the board."
          onClose={() => setColumnAction(null)}
          title="Rename column"
        >
          <form className="space-y-4" onSubmit={(event) => void handleRenameColumn(event)}>
            <label className="block text-sm font-medium text-slate-700">
              Column name
              <input
                autoFocus
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5"
                maxLength={100}
                onChange={(event) => setRenameValue(event.target.value)}
                required
                value={renameValue}
              />
            </label>
            <DialogActions
              onCancel={() => setColumnAction(null)}
              saving={savingDialog}
              submitLabel="Save name"
            />
          </form>
        </Dialog>
      )}

      {(columnAction?.kind === 'archive' || columnAction?.kind === 'delete') && (
        <Dialog
          closeDisabled={savingDialog}
          description={
            columnAction.kind === 'archive'
              ? 'Archive this column. It can be restored later.'
              : 'Permanently delete this column.'
          }
          onClose={() => setColumnAction(null)}
          title={`${columnAction.kind === 'archive' ? 'Archive' : 'Delete'} “${columnAction.column.name}”?`}
        >
          <div className="space-y-4">
            {columnAction.column.task_count > 0 && (
              <label className="block text-sm font-medium text-slate-700">
                Move its {columnAction.column.task_count} task(s) to
                <select
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                  onChange={(event) => setDestinationColumnId(event.target.value)}
                  required
                  value={destinationColumnId}
                >
                  <option value="">Choose a destination</option>
                  {board?.columns
                    .filter((column) => !column.archived_at && column.id !== columnAction.column.id)
                    .map((column) => (
                      <option key={column.id} value={column.id}>{column.name}</option>
                    ))}
                </select>
              </label>
            )}
            <p className="text-sm text-slate-600">
              {columnAction.kind === 'archive'
                ? 'Tasks in this column must be moved before it is archived.'
                : 'Tasks in this column must be moved before it is deleted.'}
            </p>
            <div className="flex justify-end gap-3">
              <Button disabled={savingDialog} onClick={() => setColumnAction(null)} type="button" variant="secondary">
                Cancel
              </Button>
              <Button
                disabled={savingDialog || (columnAction.column.task_count > 0 && !destinationColumnId)}
                onClick={() => void handleColumnAction()}
                type="button"
                variant={columnAction.kind === 'delete' ? 'danger' : 'primary'}
              >
                {savingDialog ? 'Saving…' : columnAction.kind === 'archive' ? 'Archive column' : 'Delete column'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  )
}

function BoardColumnView({
  column,
  canManage,
  canMoveTask,
  mutating,
  locationSearch,
  workspaceId,
  projectId,
  index,
  totalActiveColumns,
  onRename,
  onArchive,
  onRestore,
  onDelete,
  onAddTask,
  onMoveColumn,
}: {
  column: BoardColumn & { visibleTasks: Task[] }
  canManage: boolean
  canMoveTask: (task: Task) => boolean
  mutating: boolean
  locationSearch: string
  workspaceId: string
  projectId: string
  index: number
  totalActiveColumns: number
  onRename: () => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
  onAddTask?: () => void
  onMoveColumn: (column: BoardColumn, direction: -1 | 1) => void
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.id,
    disabled: Boolean(column.archived_at) || mutating,
  })
  const isArchived = Boolean(column.archived_at)
  const hasTasks = column.task_count > 0

  return (
    <section
      aria-label={`${column.name}, ${column.task_count} tasks`}
      className={`w-[19rem] shrink-0 rounded-xl border p-3.5 transition ${isOver ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-100'} ${isArchived ? 'opacity-75' : ''}`}
      ref={setNodeRef}
    >
      <header className="mb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${columnStatusStyles[column.status]}`} />
            <h3 className="truncate text-sm font-semibold text-slate-900">{column.name}</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-slate-500">
              {column.visibleTasks.length}{column.visibleTasks.length !== column.task_count ? `/${column.task_count}` : ''}
            </span>
          </div>
          {(canManage || onAddTask) && (
            <div className="flex shrink-0 items-center gap-0.5">
              {canManage && !isArchived && (
                <>
                  <button
                    aria-label={`Move ${column.name} left`}
                    className="rounded p-1.5 text-slate-500 hover:bg-white disabled:opacity-40"
                    disabled={mutating || index === 0}
                    onClick={() => onMoveColumn(column, -1)}
                    type="button"
                  >
                    <ArrowLeft aria-hidden="true" size={15} />
                  </button>
                  <button
                    aria-label={`Move ${column.name} right`}
                    className="rounded p-1.5 text-slate-500 hover:bg-white disabled:opacity-40"
                    disabled={mutating || index >= totalActiveColumns - 1}
                    onClick={() => onMoveColumn(column, 1)}
                    type="button"
                  >
                    <ArrowRight aria-hidden="true" size={15} />
                  </button>
                  <ColumnMenu
                    onArchive={onArchive}
                    onDelete={onDelete}
                    onRename={onRename}
                  />
                </>
              )}
              {canManage && isArchived && (
                <button
                  aria-label={`Restore ${column.name}`}
                  className="rounded p-1.5 text-slate-500 hover:bg-white disabled:opacity-40"
                  disabled={mutating}
                  onClick={onRestore}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <SortableContext
        items={column.visibleTasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="min-h-20 space-y-3">
          {column.visibleTasks.map((task) => (
            <SortableTaskCard
              canMove={canMoveTask(task) && !isArchived}
              key={task.id}
              locationSearch={locationSearch}
              mutating={mutating}
              projectId={projectId}
              task={task}
              workspaceId={workspaceId}
            />
          ))}
          {column.visibleTasks.length === 0 && hasTasks && (
            <div className="grid min-h-20 place-items-center rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
              No tasks match the filters
            </div>
          )}
        </div>
      </SortableContext>
      {onAddTask && !isArchived && (
        <button
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs font-medium transition ${isOver ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700'}`}
          onClick={onAddTask}
          type="button"
        >
          <Plus aria-hidden="true" size={15} />
          Add new task
        </button>
      )}
      {!hasTasks && !onAddTask && !isArchived && (
        <p className="mt-2 text-center text-xs text-slate-400">Drop tasks here</p>
      )}
    </section>
  )
}

function SortableTaskCard({
  task,
  canMove,
  mutating,
  workspaceId,
  projectId,
  locationSearch,
}: {
  task: Task
  canMove: boolean
  mutating: boolean
  workspaceId: string
  projectId: string
  locationSearch: string
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id, disabled: !canMove || mutating })

  return (
    <article
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:border-slate-300 hover:shadow-md ${isDragging ? 'z-10 opacity-60 shadow-lg' : ''}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="flex items-start gap-2">
        {canMove && (
          <button
            aria-label={`Move task ${task.title}`}
            className="mt-0.5 shrink-0 cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
            disabled={mutating}
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" size={16} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {task.labels.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1">
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800">
                {task.labels[0].name}
              </span>
              {task.labels.length > 1 && (
                <span className="text-[11px] text-slate-400">+{task.labels.length - 1}</span>
              )}
            </div>
          )}
          <Link
            className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900 hover:text-teamsync-navy hover:underline"
            to={`/workspaces/${workspaceId}/projects/${projectId}/tasks/${task.id}${locationSearch}`}
          >
            {task.title}
          </Link>
          {task.description && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">{task.description}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TaskPriorityBadge priority={task.priority} />
            {task.subtask_count > 0 && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${task.completed_subtask_count === task.subtask_count ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                title={`${task.completed_subtask_count} of ${task.subtask_count} subtasks completed`}
              >
                <ListChecks aria-hidden="true" size={13} />
                {task.completed_subtask_count}/{task.subtask_count}
              </span>
            )}
            {task.due_date && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                Due {formatTaskDate(task.due_date)}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <AvatarGroup people={task.assignees} total={task.assignees.length} />
          </div>
        </div>
      </div>
    </article>
  )
}

function ColumnMenu({
  onRename,
  onArchive,
  onDelete,
}: {
  onRename: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label="Column actions"
        className="rounded p-1.5 text-slate-500 hover:bg-white"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <MenuAction icon={<Check size={14} />} label="Rename" onClick={() => { setOpen(false); onRename() }} />
          <MenuAction icon={<Archive size={14} />} label="Archive" onClick={() => { setOpen(false); onArchive() }} />
          <MenuAction danger icon={<Trash2 size={14} />} label="Delete" onClick={() => { setOpen(false); onDelete() }} />
        </div>
      )}
    </div>
  )
}

function MenuAction({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs ${danger ? 'text-red-700 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  )
}

function FilterSelect({
  ariaLabel,
  children,
  value,
  onChange,
}: {
  ariaLabel: string
  children: React.ReactNode
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span className="sr-only">{ariaLabel}</span>
      <select
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  )
}

function DialogActions({
  onCancel,
  saving,
  submitLabel,
}: {
  onCancel: () => void
  saving: boolean
  submitLabel: string
}) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <Button disabled={saving} onClick={onCancel} type="button" variant="secondary">
        Cancel
      </Button>
      <Button disabled={saving} type="submit">
        {saving ? 'Saving…' : submitLabel}
      </Button>
    </div>
  )
}
