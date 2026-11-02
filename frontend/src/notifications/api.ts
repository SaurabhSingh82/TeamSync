import { apiClient } from '../lib/api/client'
import type { ActivityEvent, NotificationItem, Page } from './types'

export async function listNotifications(options: {
  unreadOnly?: boolean
  page?: number
  pageSize?: number
} = {}) {
  const { data } = await apiClient.get<Page<NotificationItem>>('/notifications/', {
    params: {
      unread_only: options.unreadOnly,
      page: options.page,
      page_size: options.pageSize,
    },
  })
  return data
}

export async function setNotificationReadState(
  notificationId: string,
  read: boolean,
) {
  const { data } = await apiClient.post<NotificationItem>(
    `/notifications/${notificationId}/${read ? 'read' : 'unread'}/`,
  )
  return data
}

export async function markAllNotificationsRead() {
  const { data } = await apiClient.post<{ updated: number }>(
    '/notifications/read-all/',
  )
  return data
}

export async function listWorkspaceActivity(
  workspaceId: string,
  page = 1,
) {
  const { data } = await apiClient.get<Page<ActivityEvent>>(
    `/workspaces/${workspaceId}/activity/`,
    { params: { page } },
  )
  return data
}
