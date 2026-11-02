import { apiClient } from '../lib/api/client'
import type { ProjectPage } from '../projects/types'
import type {
  Subtask,
  BoardColumn,
  ProjectBoard,
  TaskActivity,
  Task,
  TaskComment,
  TaskFilters,
  TaskLabel,
} from './types'

export async function getProjectBoard(
  projectId: string,
  filters: Omit<TaskFilters, 'project_id' | 'page' | 'page_size'> = {},
  includeArchived = false,
) {
  const { data } = await apiClient.get<ProjectBoard>(
    `/projects/${projectId}/board/`,
    { params: { ...filters, include_archived: includeArchived } },
  )
  return data
}

export async function createBoardColumn(
  projectId: string,
  input: {
    name: string
    status: Task['status']
    position?: number
    expected_board_version: number
  },
) {
  const { data } = await apiClient.post<BoardColumn & { board_version: number }>(
    `/projects/${projectId}/columns/`,
    input,
  )
  return data
}

export async function updateBoardColumn(
  columnId: string,
  input: {
    name?: string
    status?: Task['status']
    position?: number
    expected_board_version: number
  },
) {
  const { data } = await apiClient.patch<BoardColumn & { board_version: number }>(
    `/columns/${columnId}/`,
    input,
  )
  return data
}

export async function reorderBoardColumns(
  projectId: string,
  columnIds: string[],
  expectedBoardVersion: number,
) {
  const { data } = await apiClient.post<{
    columns: BoardColumn[]
    board_version: number
  }>(`/projects/${projectId}/columns/reorder/`, {
    column_ids: columnIds,
    expected_board_version: expectedBoardVersion,
  })
  return data
}

export async function deleteBoardColumn(
  columnId: string,
  destinationColumnId: string | null,
  expectedBoardVersion: number,
) {
  const { data } = await apiClient.delete<{ board_version: number }>(
    `/columns/${columnId}/`,
    {
      data: {
        destination_column_id: destinationColumnId,
        expected_board_version: expectedBoardVersion,
      },
    },
  )
  return data
}

export async function archiveBoardColumn(
  columnId: string,
  destinationColumnId: string | null,
  expectedBoardVersion: number,
) {
  const { data } = await apiClient.post<BoardColumn & { board_version: number }>(
    `/columns/${columnId}/archive/`,
    {
      destination_column_id: destinationColumnId,
      expected_board_version: expectedBoardVersion,
    },
  )
  return data
}

export async function restoreBoardColumn(
  columnId: string,
  expectedBoardVersion: number,
) {
  const { data } = await apiClient.post<BoardColumn & { board_version: number }>(
    `/columns/${columnId}/restore/`,
    { expected_board_version: expectedBoardVersion },
  )
  return data
}

export async function moveTask(
  taskId: string,
  input: {
    column_id: string
    position: number
    expected_task_version: number
    expected_board_version: number
  },
) {
  const { data } = await apiClient.post<Task & { board_version: number }>(
    `/tasks/${taskId}/move/`,
    input,
  )
  return data
}

export async function listProjectTasks(filters: TaskFilters) {
  const { data } = await apiClient.get<ProjectPage<Task>>('/tasks/', {
    params: filters,
  })
  return data
}

export async function createTask(input: {
  project_id: string
  board_column_id?: string
  title: string
  description: string
  priority: Task['priority']
  status: Task['status']
  start_date: string | null
  due_date: string | null
  assignee_ids: string[]
  collaborator_ids: string[]
  label_ids: string[]
}) {
  const { data } = await apiClient.post<Task>('/tasks/', input)
  return data
}

export async function getTask(taskId: string) {
  const { data } = await apiClient.get<Task>(`/tasks/${taskId}/`)
  return data
}

export async function updateTask(
  taskId: string,
  input: Partial<
    Pick<
      Task,
      'title' | 'description' | 'priority' | 'status' | 'start_date' | 'due_date'
    >
  > & { expected_version: number },
) {
  const { data } = await apiClient.patch<Task>(`/tasks/${taskId}/`, input)
  return data
}

export function deleteTask(taskId: string) {
  return apiClient.delete(`/tasks/${taskId}/`)
}

export async function archiveTask(taskId: string) {
  const { data } = await apiClient.post<Task>(`/tasks/${taskId}/archive/`)
  return data
}

export async function restoreTask(taskId: string) {
  const { data } = await apiClient.post<Task>(`/tasks/${taskId}/restore/`)
  return data
}

export async function duplicateTask(taskId: string) {
  const { data } = await apiClient.post<Task>(`/tasks/${taskId}/duplicate/`)
  return data
}

export async function listProjectLabels(projectId: string) {
  const results: TaskLabel[] = []
  let page = 1
  let count: number
  do {
    const { data } = await apiClient.get<ProjectPage<TaskLabel>>(
      `/projects/${projectId}/labels/`,
      { params: { page, page_size: 100 } },
    )
    results.push(...data.results)
    count = data.count
    page += 1
  } while (results.length < count)
  return results
}

export async function createProjectLabel(projectId: string, name: string) {
  const { data } = await apiClient.post<TaskLabel>(
    `/projects/${projectId}/labels/`,
    { name },
  )
  return data
}

export async function addTaskLabel(taskId: string, labelId: string) {
  const { data } = await apiClient.post<Task>(
    `/tasks/${taskId}/labels/`,
    { label_id: labelId },
  )
  return data
}

export function removeTaskLabel(taskId: string, labelId: string) {
  return apiClient.delete(`/tasks/${taskId}/labels/${labelId}/`)
}

export async function addTaskAssignee(taskId: string, userId: string) {
  const { data } = await apiClient.post<Task>(
    `/tasks/${taskId}/assignees/`,
    { user_id: userId },
  )
  return data
}

export function removeTaskAssignee(taskId: string, userId: string) {
  return apiClient.delete(`/tasks/${taskId}/assignees/${userId}/`)
}

export async function addTaskCollaborator(taskId: string, userId: string) {
  const { data } = await apiClient.post<Task>(
    `/tasks/${taskId}/collaborators/`,
    { user_id: userId },
  )
  return data
}

export function removeTaskCollaborator(taskId: string, userId: string) {
  return apiClient.delete(`/tasks/${taskId}/collaborators/${userId}/`)
}

export async function listTaskSubtasks(taskId: string) {
  const { data } = await apiClient.get<ProjectPage<Subtask>>(
    `/tasks/${taskId}/subtasks/`,
  )
  return data
}

export async function createSubtask(taskId: string, title: string) {
  const { data } = await apiClient.post<Subtask>(
    `/tasks/${taskId}/subtasks/`,
    { title },
  )
  return data
}

export async function updateSubtask(
  taskId: string,
  subtaskId: string,
  input: Partial<Pick<Subtask, 'title' | 'is_completed'>>,
) {
  const { data } = await apiClient.patch<Subtask>(
    `/tasks/${taskId}/subtasks/${subtaskId}/`,
    input,
  )
  return data
}

export function deleteSubtask(taskId: string, subtaskId: string) {
  return apiClient.delete(`/tasks/${taskId}/subtasks/${subtaskId}/`)
}

export async function listTaskComments(taskId: string) {
  const { data } = await apiClient.get<ProjectPage<TaskComment>>(
    `/tasks/${taskId}/comments/`,
  )
  return data
}

export async function listTaskActivity(taskId: string) {
  const { data } = await apiClient.get<ProjectPage<TaskActivity>>(
    `/tasks/${taskId}/activity/`,
  )
  return data
}

export async function createTaskComment(taskId: string, body: string) {
  const { data } = await apiClient.post<TaskComment>(
    `/tasks/${taskId}/comments/`,
    { body },
  )
  return data
}

export async function updateTaskComment(
  taskId: string,
  commentId: string,
  body: string,
) {
  const { data } = await apiClient.patch<TaskComment>(
    `/tasks/${taskId}/comments/${commentId}/`,
    { body },
  )
  return data
}

export function deleteTaskComment(taskId: string, commentId: string) {
  return apiClient.delete(`/tasks/${taskId}/comments/${commentId}/`)
}
