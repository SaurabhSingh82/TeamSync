export const notificationsUpdatedEvent = 'teamsync:notifications-updated'

export function publishUnreadNotificationCount(unreadCount: number) {
  window.dispatchEvent(
    new CustomEvent<{ unreadCount: number }>(notificationsUpdatedEvent, {
      detail: { unreadCount },
    }),
  )
}
