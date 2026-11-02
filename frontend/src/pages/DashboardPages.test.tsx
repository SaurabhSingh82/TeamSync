import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import '@testing-library/jest-dom/vitest'

const api = vi.hoisted(() => ({
  getDashboardSummary: vi.fn(),
  getCalendarEvents: vi.fn(),
  getAnalytics: vi.fn(),
}))

vi.mock('../dashboard/api', () => api)

import { AnalyticsPage } from './AnalyticsPage'
import { CalendarPage } from './CalendarPage'
import { DashboardPage } from './DashboardPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('M09 dashboard, calendar, and analytics', () => {
  it('shows summary cards and accessible upcoming task links', async () => {
    api.getDashboardSummary.mockResolvedValue({
      projects: { total: 2, active: 1 },
      tasks: {
        total: 3,
        open: 2,
        completed: 1,
        by_status: { todo: 1, in_progress: 1, completed: 1 },
      },
      my_workload: {
        assigned_open: 1,
        overdue: 1,
        due_soon: 1,
        overdue_tasks: [{
          id: 'task-2',
          title: 'Overdue task',
          project_id: 'project-1',
          project_name: 'Launch project',
          workspace_id: 'workspace-1',
          status: 'todo',
          priority: 'high',
          due_date: '2026-11-01',
        }],
      },
      upcoming_tasks: [{
        id: 'task-1',
        title: 'Prepare release',
        project_id: 'project-1',
        project_name: 'Launch project',
        workspace_id: 'workspace-1',
        status: 'todo',
        priority: 'high',
        due_date: '2026-11-05',
      }],
      recent_activity: [],
    })

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Accessible projects')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overdue task' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Prepare release' })).toHaveAttribute(
      'href',
      '/workspaces/workspace-1/projects/project-1/tasks/task-1',
    )
  })

  it('renders authorized calendar events and switches calendar views', async () => {
    api.getCalendarEvents.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        event_date: '2026-11-05',
        event_type: 'task_deadline',
        event_title: 'Prepare release',
        object_id: 'task-1',
        event_project_id: 'project-1',
        event_workspace_id: 'workspace-1',
        event_project_name: 'Launch project',
        event_status: 'todo',
        event_priority: 'high',
      }],
    })

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: /Prepare release/ })).toHaveAttribute(
      'href',
      '/workspaces/workspace-1/projects/project-1/tasks/task-1',
    )
    fireEvent.click(screen.getByRole('button', { name: 'week', pressed: false }))
    expect(screen.getByRole('button', { name: 'week', pressed: true })).toBeInTheDocument()
  })

  it('shows project progress with its completed-of-total denominator', async () => {
    api.getAnalytics.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      totals: {
        task_count: 2,
        completed_task_count: 1,
        status_counts: { todo: 1, completed: 1 },
        progress_denominator: 'All non-archived tasks in accessible, non-archived projects.',
      },
      results: [{
        id: 'project-1',
        workspace_id: 'workspace-1',
        name: 'Launch project',
        status: 'active',
        due_date: null,
        task_count: 2,
        completed_task_count: 1,
        progress_percent: 50,
      }],
    })

    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('1 of 2 tasks completed')).toBeInTheDocument()
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0)
    expect(screen.getByText(/All non-archived tasks/)).toBeInTheDocument()
  })
})
