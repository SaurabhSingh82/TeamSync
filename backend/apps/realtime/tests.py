import asyncio
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.projects.models import Project, ProjectMember
from apps.projects.services import create_project
from apps.realtime.events import project_group, workspace_group
from apps.users.models import User
from apps.workspaces.models import WorkspaceMember
from apps.workspaces.services import create_workspace
from config.asgi import application


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class RealtimeConnectionTests(TransactionTestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="realtime-owner",
            email="realtime-owner@example.com",
            password="password",
        )
        self.outsider = User.objects.create_user(
            username="realtime-outsider",
            email="realtime-outsider@example.com",
            password="password",
        )
        self.workspace = create_workspace(
            owner=self.owner,
            name="Realtime workspace",
            description="Realtime tests",
        )
        self.project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={"name": "Realtime project"},
        )
        self.tokens = {
            user.pk: str(RefreshToken.for_user(user).access_token)
            for user in (self.owner, self.outsider)
        }

    def _headers(self, user):
        token = self.tokens[user.pk]
        return [(b"cookie", f"teamsync_access={token}".encode())]

    async def _connect(self, path, user):
        communicator = WebsocketCommunicator(
            application,
            path,
            headers=self._headers(user) if user is not None else [],
        )
        connected, _ = await communicator.connect()
        return communicator, connected

    def test_workspace_connection_requires_membership(self):
        async def scenario():
            communicator, connected = await self._connect(
                f"/ws/workspaces/{self.workspace.pk}/",
                self.outsider,
            )
            self.assertFalse(connected)
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_unauthenticated_and_expired_connections_are_rejected(self):
        expired = AccessToken.for_user(self.owner)
        expired.set_exp(lifetime=timedelta(seconds=-1))

        async def scenario():
            unauthenticated, connected = await self._connect(
                f"/ws/workspaces/{self.workspace.pk}/",
                None,
            )
            self.assertFalse(connected)
            await unauthenticated.disconnect()

            expired_communicator = WebsocketCommunicator(
                application,
                f"/ws/workspaces/{self.workspace.pk}/",
                headers=[(b"cookie", f"teamsync_access={expired}".encode())],
            )
            expired_connected, _ = await expired_communicator.connect()
            self.assertFalse(expired_connected)
            await expired_communicator.disconnect()

        async_to_sync(scenario)()

    def test_authenticated_notification_connection_receives_user_events(self):
        async def scenario():
            communicator, connected = await self._connect(
                "/ws/notifications/",
                self.owner,
            )
            self.assertTrue(connected)
            self.assertEqual(
                await communicator.receive_json_from(),
                {"type": "connection.ready"},
            )
            await get_channel_layer().group_send(
                f"user.{self.owner.pk}",
                {
                    "type": "teamsync.event",
                    "event_type": "notification.created",
                    "payload": {"notification_id": "notification-1"},
                },
            )
            self.assertEqual(
                await communicator.receive_json_from(),
                {
                    "type": "notification.created",
                    "payload": {"notification_id": "notification-1"},
                },
            )
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_project_connection_requires_project_access(self):
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.outsider,
            role=WorkspaceMember.Role.MEMBER,
        )

        async def scenario():
            communicator, connected = await self._connect(
                f"/ws/workspaces/{self.workspace.pk}/projects/{self.project.pk}/",
                self.outsider,
            )
            self.assertFalse(connected)
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_authorized_project_receives_committed_group_events(self):
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.outsider,
            role=WorkspaceMember.Role.MEMBER,
        )
        ProjectMember.objects.create(
            project=self.project,
            user=self.outsider,
            role=ProjectMember.Role.MEMBER,
        )

        async def scenario():
            communicator, connected = await self._connect(
                f"/ws/workspaces/{self.workspace.pk}/projects/{self.project.pk}/",
                self.outsider,
            )
            self.assertTrue(connected)
            self.assertEqual(
                await communicator.receive_json_from(),
                {"type": "connection.ready"},
            )
            await get_channel_layer().group_send(
                project_group(self.project.pk),
                {
                    "type": "teamsync.event",
                    "event_type": "task.updated",
                    "payload": {"task_id": "task-1"},
                },
            )
            self.assertEqual(
                await communicator.receive_json_from(),
                {
                    "type": "task.updated",
                    "payload": {"task_id": "task-1"},
                },
            )
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_workspace_event_is_not_sent_to_project_only_subscription(self):
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.outsider,
            role=WorkspaceMember.Role.MEMBER,
        )
        ProjectMember.objects.create(
            project=self.project,
            user=self.outsider,
            role=ProjectMember.Role.MEMBER,
        )

        async def scenario():
            communicator, connected = await self._connect(
                f"/ws/workspaces/{self.workspace.pk}/projects/{self.project.pk}/",
                self.outsider,
            )
            self.assertTrue(connected)
            await communicator.receive_json_from()
            await get_channel_layer().group_send(
                workspace_group(self.workspace.pk),
                {
                    "type": "teamsync.event",
                    "event_type": "workspace.updated",
                    "payload": {"workspace_id": str(self.workspace.pk)},
                },
            )
            with self.assertRaises(asyncio.TimeoutError):
                await communicator.receive_json_from(timeout=0.05)
            try:
                await communicator.disconnect()
            except asyncio.CancelledError:
                pass

        async_to_sync(scenario)()
