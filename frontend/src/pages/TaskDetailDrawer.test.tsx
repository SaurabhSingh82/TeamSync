import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import '@testing-library/jest-dom/vitest'

import { TaskDetailDrawer } from './TaskDetailDrawer'

vi.mock('./TaskDetailPage', () => ({
  TaskDetailPage: () => <p>Task detail content</p>,
}))

afterEach(() => cleanup())

describe('TaskDetailDrawer', () => {
  it('keeps the task view mounted and preserves query state when closed', () => {
    const refreshBoard = vi.fn()

    function TasksLayout() {
      const location = useLocation()
      return (
        <>
          <p>Project task view</p>
          <output>{location.search}</output>
          <Outlet context={{ refreshBoard }} />
        </>
      )
    }

    render(
      <MemoryRouter initialEntries={['/workspaces/w1/projects/p1/tasks/t1?view=board&priority=high']}>
        <Routes>
          <Route
            element={<TasksLayout />}
            path="/workspaces/:workspaceId/projects/:projectId/tasks"
          >
            <Route element={<p>Board content</p>} index />
            <Route element={<TaskDetailDrawer />} path=":taskId" />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Project task view')).toBeInTheDocument()
    expect(screen.getByText('Task detail content')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close task details' }))

    expect(screen.getByText('Board content')).toBeInTheDocument()
    expect(screen.getByText('?view=board&priority=high')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Task details' })).not.toBeInTheDocument()
    expect(refreshBoard).toHaveBeenCalledOnce()
  })

  it('closes on Escape', () => {
    const refreshBoard = vi.fn()

    function TasksLayout() {
      return <Outlet context={{ refreshBoard }} />
    }

    render(
      <MemoryRouter initialEntries={['/workspaces/w1/projects/p1/tasks/t1']}>
        <Routes>
          <Route
            element={<TasksLayout />}
            path="/workspaces/:workspaceId/projects/:projectId/tasks"
          >
            <Route element={<p>Board content</p>} index />
            <Route element={<TaskDetailDrawer />} path=":taskId" />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.getByText('Board content')).toBeInTheDocument()
    expect(refreshBoard).toHaveBeenCalledOnce()
  })
})
