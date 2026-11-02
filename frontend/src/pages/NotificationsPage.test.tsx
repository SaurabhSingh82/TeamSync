import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import '@testing-library/jest-dom/vitest'

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  setNotificationReadState: vi.fn(),
  listWorkspaceActivity: vi.fn(),
}))

vi.mock('../notifications/api', () => api)

import { NotificationsPage } from './NotificationsPage'
import { WorkspaceActivityPage } from './WorkspaceActivityPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('M08 notifications and activity', () => {
  it('lists notifications and marks an item read', async () => {
    const item = {
      id: 'notice-1',
      kind: 'task_assigned',
      title: 'You were added to a task',
      message: 'Prepare launch',
      target_url: '',
      metadata: {},
      actor_name: 'Project Manager',
      created_at: '2026-11-02T10:00:00Z',
      read_at: null,
    }
    api.listNotifications.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [item],
    })
    api.setNotificationReadState.mockResolvedValue({
      ...item,
      read_at: '2026-11-02T10:01:00Z',
    })

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('You were added to a task')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }))

    await waitFor(() => {
      expect(api.setNotificationReadState).toHaveBeenCalledWith('notice-1', true)
    })
    expect(await screen.findByRole('button', { name: 'Mark unread' })).toBeInTheDocument()
  })

  it('renders authorized workspace activity with a task link', async () => {
    api.listWorkspaceActivity.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 'activity-1',
        event_type: 'created',
        object_type: 'task',
        object_id: 'task-1',
        actor_name: 'Project Manager',
        project_id: 'project-1',
        project_name: 'Launch project',
        task_id: 'task-1',
        task_title: 'Prepare launch',
        metadata: {},
        created_at: '2026-11-02T10:00:00Z',
      }],
    })

    render(
      <MemoryRouter initialEntries={['/workspaces/workspace-1/activity']}>
        <Routes>
          <Route
            element={<WorkspaceActivityPage />}
            path="/workspaces/:workspaceId/activity"
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: 'Prepare launch' })).toHaveAttribute(
      'href',
      '/workspaces/workspace-1/projects/project-1/tasks/task-1',
    )
    expect(api.listWorkspaceActivity).toHaveBeenCalledWith('workspace-1')
  })
})
