import re

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from apps.projects.models import Project
from apps.realtime.events import project_group, user_group, workspace_group
from apps.users.models import User
from apps.workspaces.models import WorkspaceMember


WORKSPACE_PATH = re.compile(r"^/ws/workspaces/(?P<workspace_id>[0-9a-f-]+)/$")
PROJECT_PATH = re.compile(
    r"^/ws/workspaces/(?P<workspace_id>[0-9a-f-]+)/projects/(?P<project_id>[0-9a-f-]+)/$"
)
NOTIFICATION_PATH = re.compile(r"^/ws/notifications/$")


class TeamSyncConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = await self.authenticate()
        if self.user is None:
            await self.close(code=4401)
            return

        path = self.scope["path"]
        project_match = PROJECT_PATH.match(path)
        workspace_match = WORKSPACE_PATH.match(path)
        notification_match = NOTIFICATION_PATH.match(path)
        if notification_match:
            self.group_name = user_group(self.user.pk)
        elif project_match:
            workspace_id = project_match.group("workspace_id")
            project_id = project_match.group("project_id")
            allowed = await self.can_access_project(workspace_id, project_id)
            if not allowed:
                await self.close(code=4403)
                return
            self.group_name = project_group(project_id)
            self.workspace_id = workspace_id
        elif workspace_match:
            workspace_id = workspace_match.group("workspace_id")
            if not await self.is_workspace_member(workspace_id):
                await self.close(code=4403)
                return
            self.group_name = workspace_group(workspace_id)
            self.workspace_id = workspace_id
        else:
            await self.close(code=4404)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connection.ready"})

    async def disconnect(self, close_code):
        group_name = getattr(self, "group_name", None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "resync":
            await self.send_json({"type": "resync.required"})

    async def teamsync_event(self, event):
        await self.send_json(
            {
                "type": event["event_type"],
                "payload": event["payload"],
            }
        )

    async def authenticate(self):
        raw_cookie = next(
            (
                value
                for key, value in self.scope.get("headers", [])
                if key.lower() == b"cookie"
            ),
            b"",
        ).decode("utf-8")
        access_token = next(
            (
                part.split("=", 1)[1]
                for part in raw_cookie.split("; ")
                if part.startswith("teamsync_access=")
            ),
            None,
        )
        if not access_token:
            return None
        try:
            token = AccessToken(access_token)
        except TokenError:
            return None
        try:
            user_id = token["user_id"]
        except KeyError:
            return None
        return await self.get_user(user_id)

    @database_sync_to_async
    def get_user(self, user_id):
        return User.objects.filter(pk=user_id, is_active=True).first()

    @database_sync_to_async
    def is_workspace_member(self, workspace_id):
        return WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            user=self.user,
        ).exists()

    @database_sync_to_async
    def can_access_project(self, workspace_id, project_id):
        project = Project.objects.filter(
            pk=project_id,
            workspace_id=workspace_id,
        ).first()
        if project is None:
            return False
        if not WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            user=self.user,
        ).exists():
            return False
        return (
            WorkspaceMember.objects.filter(
                workspace_id=workspace_id,
                user=self.user,
                role__in=(WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN),
            ).exists()
            or project.members.filter(user=self.user).exists()
        )
