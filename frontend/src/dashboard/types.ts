export interface DashboardTask {
  id: string
  title: string
  project_id: string
  project_name: string
  workspace_id: string
  status: string
  priority: string
  due_date: string | null
}

export interface DashboardActivity {
  id: string
  event_type: string
  actor_name: string
  project_id: string | null
  workspace_id: string
  project_name: string
  task_id: string | null
  task_title: string
  created_at: string
}

export interface DashboardSummary {
  projects: {
    total: number
    active: number
  }
  tasks: {
    total: number
    open: number
    completed: number
    by_status: Record<string, number>
  }
  my_workload: {
    assigned_open: number
    overdue: number
    due_soon: number
    overdue_tasks: DashboardTask[]
  }
  upcoming_tasks: DashboardTask[]
  recent_activity: DashboardActivity[]
}

export interface CalendarEvent {
  event_date: string
  event_type: 'task_start' | 'task_deadline' | 'project_start' | 'project_deadline' | 'milestone_due'
  event_title: string
  object_id: string
  event_project_id: string
  event_workspace_id: string
  event_project_name: string
  event_status: string
  event_priority: string
}

export interface ProjectProgress {
  id: string
  workspace_id: string
  name: string
  status: string
  due_date: string | null
  task_count: number
  completed_task_count: number
  progress_percent: number
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface AnalyticsResponse extends Paginated<ProjectProgress> {
  totals: {
    task_count: number
    completed_task_count: number
    status_counts: Record<string, number>
    progress_denominator: string
  }
}
