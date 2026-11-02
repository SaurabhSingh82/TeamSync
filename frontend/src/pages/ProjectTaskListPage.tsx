import { useEffect, useState } from 'react'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { useAuth } from '../auth/useAuth'
import { AvatarGroup } from '../components/projects/AvatarGroup'
import { TaskFormDialog } from '../components/tasks/TaskFormDialog'
import type { TaskCreateValues } from '../components/tasks/TaskFormDialog'
import { TaskPriorityBadge, TaskStatusBadge } from '../components/tasks/TaskBadge'
import { taskPriorities, taskStatuses } from '../tasks/options'
import { Button } from '../components/ui/Button'
import { listAllProjectMembers } from '../projects/api'
import type { ProjectMember } from '../projects/types'
import { canManageProject } from '../projects/permissions'
import { useProjectContext } from '../components/projects/projectContext'
import { createTask, listProjectLabels, listProjectTasks } from '../tasks/api'
import { formatTaskDate } from '../tasks/format'
import type { Task, TaskFilters, TaskPriority, TaskStatus, TaskLabel } from '../tasks/types'

function TaskCard({ task }: { task: Task }) {
  return (
    <Link
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
      to={`tasks/${task.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 font-semibold text-slate-950">{task.title}</h2>
        <TaskStatusBadge status={task.status} />
      </div>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">
        {task.description || 'No description'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <TaskPriorityBadge priority={task.priority} />
        {task.labels.slice(0, 3).map((label) => (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600" key={label.id}>
            {label.name}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
        <span>{task.assignees.length ? `${task.assignees.length} assignee(s)` : 'Unassigned'}</span>
        <span>{task.due_date ? `Due ${formatTaskDate(task.due_date)}` : 'No due date'}</span>
      </div>
    </Link>
  )
}

export function ProjectTaskListPage() {
  const { project } = useProjectContext()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [priority, setPriority] = useState<TaskPriority | ''>('')
  const [assignee, setAssignee] = useState('')
  const [dueAfter, setDueAfter] = useState('')
  const [dueBefore, setDueBefore] = useState('')
  const [archived, setArchived] = useState<'false' | 'true' | 'all'>('false')
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const pageSize = 20
  const requestKey = `${project.id}:${page}:${search}:${status}:${priority}:${assignee}:${dueAfter}:${dueBefore}:${archived}`
  const canCreate =
    project.current_user_workspace_role !== 'viewer' &&
    (canManageProject(project) || project.current_user_project_role === 'member')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let active = true
    const filters: TaskFilters = {
      project_id: project.id,
      page,
      page_size: pageSize,
      archived,
    }
    if (search) filters.search = search
    if (status) filters.status = status
    if (priority) filters.priority = priority
    if (assignee) filters.assignee = assignee
    if (dueAfter) filters.due_after = dueAfter
    if (dueBefore) filters.due_before = dueBefore

    void Promise.all([
      listProjectTasks(filters),
      listAllProjectMembers(project.id),
      listProjectLabels(project.id),
    ])
      .then(([taskPage, projectMembers, projectLabels]) => {
        if (active) {
          setTasks(taskPage.results)
          setCount(taskPage.count)
          setMembers(projectMembers)
          setLabels(projectLabels)
          setError('')
          setLoadedKey(requestKey)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setTasks([])
          setCount(0)
          setError(getApiErrorMessage(loadError))
          setLoadedKey(requestKey)
        }
      })
    return () => {
      active = false
    }
  }, [project.id, page, search, status, priority, assignee, dueAfter, dueBefore, archived, requestKey])

  async function handleCreate(values: TaskCreateValues) {
    const task = await createTask({
      project_id: project.id,
      ...values,
    })
    navigate(`tasks/${task.id}`)
  }

  const stale = loadedKey !== requestKey

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-teamsync-navy">Project work</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Tasks</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Organize the work, set priorities, and follow task progress.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus aria-hidden="true" size={17} />
            New task
          </Button>
        )}
      </div>

      <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-6">
        <label className="relative min-w-0 xl:col-span-2">
          <span className="sr-only">Search tasks</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search tasks"
            type="search"
            value={searchInput}
          />
        </label>
        <FilterSelect
          ariaLabel="Filter by status"
          onChange={(value) => {
            setStatus(value as TaskStatus | '')
            setPage(1)
          }}
          value={status}
        >
          <option value="">All statuses</option>
          {taskStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </FilterSelect>
        <FilterSelect
          ariaLabel="Filter by priority"
          onChange={(value) => {
            setPriority(value as TaskPriority | '')
            setPage(1)
          }}
          value={priority}
        >
          <option value="">All priorities</option>
          {taskPriorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </FilterSelect>
        <FilterSelect
          ariaLabel="Filter by assignee"
          onChange={(value) => {
            setAssignee(value)
            setPage(1)
          }}
          value={assignee}
        >
          <option value="">All assignees</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.username}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          ariaLabel="Filter archived tasks"
          onChange={(value) => {
            setArchived(value as 'false' | 'true' | 'all')
            setPage(1)
          }}
          value={archived}
        >
          <option value="false">Active tasks</option>
          <option value="true">Archived tasks</option>
          <option value="all">All tasks</option>
        </FilterSelect>
        <label className="text-xs font-medium text-slate-500">
          Due after
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
            onChange={(event) => {
              setDueAfter(event.target.value)
              setPage(1)
            }}
            type="date"
            value={dueAfter}
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Due before
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
            onChange={(event) => {
              setDueBefore(event.target.value)
              setPage(1)
            }}
            type="date"
            value={dueBefore}
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {stale ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500" role="status">
          Loading tasks…
        </div>
      ) : tasks.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <ClipboardList aria-hidden="true" className="mx-auto text-slate-400" size={30} />
          <h3 className="mt-4 font-semibold text-slate-900">
            {search || status || priority || dueAfter || dueBefore ? 'No matching tasks' : 'No tasks yet'}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {canCreate ? 'Create a task to get this project moving.' : 'Tasks you can access will appear here.'}
          </p>
          {canCreate && (
            <Button className="mt-5" onClick={() => setShowCreateDialog(true)}>
              New task
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3.5" scope="col">Task</th>
                  <th className="px-4 py-3.5" scope="col">Status</th>
                  <th className="px-4 py-3.5" scope="col">Priority</th>
                  <th className="px-4 py-3.5" scope="col">Assignees</th>
                  <th className="px-4 py-3.5" scope="col">Due date</th>
                  <th className="px-4 py-3.5" scope="col">Subtasks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <tr className="hover:bg-slate-50/80" key={task.id}>
                    <td className="max-w-sm px-5 py-4">
                      <Link className="font-semibold text-slate-900 hover:text-teamsync-navy hover:underline" to={`tasks/${task.id}`}>
                        {task.title}
                      </Link>
                      <p className="mt-1 truncate text-sm text-slate-500">{task.description || 'No description'}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {task.labels.map((label) => (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600" key={label.id}>{label.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4"><TaskStatusBadge status={task.status} /></td>
                    <td className="px-4 py-4"><TaskPriorityBadge priority={task.priority} /></td>
                    <td className="px-4 py-4">
                      <AvatarGroup people={task.assignees} total={task.assignees.length} />
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">{formatTaskDate(task.due_date)}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {task.completed_subtask_count}/{task.subtask_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 grid gap-3 md:hidden">
            {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <p>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} of {count}</p>
            <div className="flex gap-2">
              <Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} variant="secondary">
                Previous
              </Button>
              <Button disabled={page * pageSize >= count} onClick={() => setPage((value) => value + 1)} variant="secondary">
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {showCreateDialog && (
        <TaskFormDialog
          canManageAssignments={canManageProject(project)}
          labels={labels}
          members={members}
          onClose={() => setShowCreateDialog(false)}
          onSave={handleCreate}
          userId={user?.id ?? ''}
        />
      )}
    </section>
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
