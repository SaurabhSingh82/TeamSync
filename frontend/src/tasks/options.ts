import type { ProjectMember } from '../projects/types'
import type { TaskPriority, TaskStatus } from './types'

export const taskStatuses: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
]

export const taskPriorities: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export function personName(member: ProjectMember) {
  return [member.first_name, member.last_name].filter(Boolean).join(' ') || member.username
}
