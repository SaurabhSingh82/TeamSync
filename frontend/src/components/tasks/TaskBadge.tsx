import type { TaskPriority, TaskStatus } from '../../tasks/types'

const statusNames: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  completed: 'Completed',
}

const statusStyles: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-900',
  review: 'bg-amber-100 text-amber-900',
  completed: 'bg-emerald-100 text-emerald-900',
}

const priorityNames: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

const priorityStyles: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-sky-100 text-sky-900',
  high: 'bg-orange-100 text-orange-900',
  urgent: 'bg-red-100 text-red-900',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {statusNames[status]}
    </span>
  )
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${priorityStyles[priority]}`}>
      {priorityNames[priority]}
    </span>
  )
}
