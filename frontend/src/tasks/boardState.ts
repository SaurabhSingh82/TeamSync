import type { ProjectBoard } from './types'

export function moveTaskOptimistically(
  board: ProjectBoard,
  taskId: string,
  destinationColumnId: string,
  position: number,
): ProjectBoard {
  const columns = board.columns.map((column) => ({ ...column, tasks: [...column.tasks] }))
  const sourceColumn = columns.find((column) =>
    column.tasks.some((task) => task.id === taskId),
  )
  const destinationColumn = columns.find((column) => column.id === destinationColumnId)
  if (!sourceColumn || !destinationColumn) return board

  const task = sourceColumn.tasks.find((item) => item.id === taskId)
  if (!task) return board
  sourceColumn.tasks = sourceColumn.tasks.filter((item) => item.id !== taskId)
  destinationColumn.tasks.splice(position, 0, {
    ...task,
    board_column_id: destinationColumn.id,
    status: destinationColumn.status,
  })

  sourceColumn.tasks = sourceColumn.tasks.map((item, index) => ({
    ...item,
    position: index,
  }))
  destinationColumn.tasks = destinationColumn.tasks.map((item, index) => ({
    ...item,
    position: index,
  }))
  sourceColumn.task_count = sourceColumn.tasks.length
  destinationColumn.task_count = destinationColumn.tasks.length
  return { ...board, columns }
}
