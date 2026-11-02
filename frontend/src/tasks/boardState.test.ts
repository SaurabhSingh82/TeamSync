import { describe, expect, it } from 'vitest'

import type { BoardColumn, ProjectBoard, Task } from './types'
import { moveTaskOptimistically } from './boardState'

const sourceColumn: BoardColumn = {
  id: 'todo-column',
  board_id: 1,
  name: 'To Do',
  status: 'todo',
  position: 0,
  is_default: true,
  archived_at: null,
  created_at: '',
  updated_at: '',
  task_count: 1,
  tasks: [],
}

const destinationColumn: BoardColumn = {
  ...sourceColumn,
  id: 'doing-column',
  name: 'In Progress',
  status: 'in_progress',
  position: 1,
  tasks: [],
}

const task: Task = {
  id: 'task-1',
  project_id: 'project-1',
  board_column_id: sourceColumn.id,
  position: 0,
  version: 1,
  title: 'Move this task',
  description: '',
  creator_id: 'user-1',
  creator_username: 'owner',
  assignees: [],
  collaborators: [],
  priority: 'medium',
  status: 'todo',
  start_date: null,
  due_date: null,
  labels: [],
  subtask_count: 0,
  completed_subtask_count: 0,
  created_at: '',
  updated_at: '',
  archived_at: null,
  completed_at: null,
}

const board: ProjectBoard = {
  id: 1,
  project_id: 'project-1',
  version: 1,
  columns: [
    { ...sourceColumn, tasks: [task] },
    { ...destinationColumn, tasks: [] },
  ],
  created_at: '',
  updated_at: '',
}

describe('moveTaskOptimistically', () => {
  it('updates column, status, ordering, and counts without mutating the loaded board', () => {
    const updated = moveTaskOptimistically(board, task.id, destinationColumn.id, 0)

    expect(updated.columns[0].tasks).toEqual([])
    expect(updated.columns[0].task_count).toBe(0)
    expect(updated.columns[1].tasks).toMatchObject([
      {
        id: task.id,
        board_column_id: destinationColumn.id,
        status: 'in_progress',
        position: 0,
      },
    ])
    expect(updated.columns[1].task_count).toBe(1)
    expect(board.columns[0].tasks).toEqual([task])
    expect(board.columns[1].tasks).toEqual([])
  })
})
