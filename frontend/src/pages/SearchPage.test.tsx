import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import '@testing-library/jest-dom/vitest'

const api = vi.hoisted(() => ({
  searchTeamSync: vi.fn(),
}))

vi.mock('../search/api', () => api)

import { SearchPage } from './SearchPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('global search', () => {
  it('shows authorized result groups and links to matching records', async () => {
    api.searchTeamSync.mockResolvedValue({
      query: 'launch',
      page: 1,
      page_size: 10,
      projects: {
        count: 1,
        page: 1,
        page_size: 10,
        results: [{
          id: 'project-1',
          name: 'Launch project',
          description: 'Release work',
          status: 'active',
          workspace_id: 'workspace-1',
          workspace_name: 'Product',
        }],
      },
      tasks: {
        count: 1,
        page: 1,
        page_size: 10,
        results: [{
          id: 'task-1',
          title: 'Launch checklist',
          status: 'todo',
          priority: 'high',
          due_date: '2026-11-12',
          project_id: 'project-1',
          project_name: 'Launch project',
          workspace_id: 'workspace-1',
        }],
      },
      members: { count: 0, page: 1, page_size: 10, results: [] },
      comments: {
        count: 1,
        page: 1,
        page_size: 10,
        results: [{
          id: 'comment-1',
          body: 'Launch after review',
          task_id: 'task-1',
          task_title: 'Launch checklist',
          project_id: 'project-1',
          project_name: 'Launch project',
          workspace_id: 'workspace-1',
          author_username: 'member',
          created_at: '2026-11-02T10:00:00Z',
        }],
      },
    })

    render(
      <MemoryRouter initialEntries={['/search?q=launch']}>
        <Routes>
          <Route element={<SearchPage />} path="/search" />
        </Routes>
      </MemoryRouter>,
    )

    const taskLinks = await screen.findAllByRole('link', { name: 'Launch checklist' })
    expect(taskLinks[0]).toHaveAttribute(
      'href',
      '/workspaces/workspace-1/projects/project-1/tasks/task-1',
    )
    expect(screen.getByText('Launch after review')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Task filters'))
    expect(screen.getByLabelText('Assignee name or ID')).toBeInTheDocument()
    expect(api.searchTeamSync).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'launch', page: 1, page_size: 10 }),
    )
  })
})
