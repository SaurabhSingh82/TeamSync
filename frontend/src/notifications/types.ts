export interface NotificationItem {
  id: string
  kind: string
  title: string
  message: string
  target_url: string
  metadata: Record<string, unknown>
  actor_name: string
  created_at: string
  read_at: string | null
}

export interface ActivityEvent {
  id: string
  event_type: string
  object_type: string
  object_id: string
  actor_name: string
  project_id: string | null
  project_name: string
  task_id: string | null
  task_title: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface Page<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
