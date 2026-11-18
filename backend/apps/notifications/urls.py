from django.urls import path

from apps.notifications.views import (
    NotificationListView,
    NotificationPreferenceView,
    NotificationMarkAllReadView,
    NotificationReadStateView,
    WorkspaceActivityView,
)


urlpatterns = [
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path(
        "notifications/preferences/",
        NotificationPreferenceView.as_view(),
        name="notification-preferences",
    ),
    path(
        "notifications/read-all/",
        NotificationMarkAllReadView.as_view(),
        name="notification-read-all",
    ),
    path(
        "notifications/<uuid:notification_id>/<str:read_state>/",
        NotificationReadStateView.as_view(),
        name="notification-read-state",
    ),
    path(
        "workspaces/<uuid:workspace_id>/activity/",
        WorkspaceActivityView.as_view(),
        name="workspace-activity",
    ),
]
