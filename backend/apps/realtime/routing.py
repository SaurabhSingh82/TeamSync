from django.urls import re_path

from apps.realtime.consumers import TeamSyncConsumer


websocket_urlpatterns = [
    re_path(
        r"ws/notifications/$",
        TeamSyncConsumer.as_asgi(),
    ),
    re_path(
        r"ws/workspaces/(?P<workspace_id>[0-9a-f-]+)/$",
        TeamSyncConsumer.as_asgi(),
    ),
    re_path(
        r"ws/workspaces/(?P<workspace_id>[0-9a-f-]+)/projects/(?P<project_id>[0-9a-f-]+)/$",
        TeamSyncConsumer.as_asgi(),
    ),
]
