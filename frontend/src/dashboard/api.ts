import { apiClient } from '../lib/api/client'
import type {
  AnalyticsResponse,
  CalendarEvent,
  DashboardSummary,
  Paginated,
} from './types'

export async function getDashboardSummary() {
  const { data } = await apiClient.get<DashboardSummary>('/dashboard/')
  return data
}

export async function getCalendarEvents(
  start: string,
  end: string,
  page = 1,
) {
  const { data } = await apiClient.get<Paginated<CalendarEvent>>(
    '/calendar/events/',
    { params: { start, end, page, page_size: 100 } },
  )
  return data
}

export async function getAnalytics(page = 1) {
  const { data } = await apiClient.get<AnalyticsResponse>('/analytics/', {
    params: { page },
  })
  return data
}
