from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.notifications.models import ActivityEvent, Notification
from apps.notifications.services import dispatch_deadline_reminders
from apps.projects.models import ProjectMember
from apps.projects.services import create_project
from apps.tasks.models import BoardColumn, Task, TaskActivity, TaskAssignee
from apps.tasks.permissions import get_task_access
from apps.tasks.services import add_task_assignment, create_task_comment
from apps.users.models import User
from apps.workspaces.models import WorkspaceMember
from apps.workspaces.services import create_workspace


class NotificationAndActivityTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="notice-owner",
            email="notice-owner@example.com",
        )
        self.member = User.objects.create_user(
            username="notice-member",
            email="notice-member@example.com",
        )
        self.outsider = User.objects.create_user(
            username="notice-outsider",
            email="notice-outsider@example.com",
        )
        self.non_project_member = User.objects.create_user(
            username="notice-workspace-member",
            email="notice-workspace-member@example.com",
        )
        self.workspace = create_workspace(
            owner=self.owner,
            name="Notifications workspace",
            description="Notification and activity tests",
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.member,
            role=WorkspaceMember.Role.MEMBER,
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.non_project_member,
            role=WorkspaceMember.Role.MEMBER,
        )
        self.project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={"name": "Notifications project"},
        )
        self.project_member = ProjectMember.objects.create(
            project=self.project,
            user=self.member,
            role=ProjectMember.Role.MEMBER,
        )
        self.task = Task.objects.create(
            project=self.project,
            board_column=BoardColumn.objects.get(
                board__project=self.project,
                status=Task.Status.TODO,
                is_default=True,
            ),
            creator=self.owner,
            title="Prepare launch",
            due_date=timezone.localdate(),
        )
        self.client = APIClient()

    def test_deadline_reminders_are_idempotent_per_task_due_date_and_recipient(self):
        TaskAssignee.objects.create(
            task=self.task,
            project_member=self.project_member,
        )
        today = timezone.localdate()

        self.assertEqual(dispatch_deadline_reminders(as_of=today), 2)
        self.assertEqual(dispatch_deadline_reminders(as_of=today), 0)
        self.assertEqual(
            Notification.objects.filter(
                task=self.task,
                kind=Notification.Kind.DEADLINE_TODAY,
            ).count(),
            2,
        )

        self.task.due_date = today - timedelta(days=1)
        self.task.save(update_fields=("due_date", "updated_at"))
        self.assertEqual(dispatch_deadline_reminders(as_of=today), 2)
        self.assertEqual(dispatch_deadline_reminders(as_of=today), 0)
        self.assertEqual(
            Notification.objects.filter(
                task=self.task,
                kind=Notification.Kind.DEADLINE_OVERDUE,
            ).count(),
            2,
        )
        Notification.objects.filter(task=self.task).delete()
        self.project.archived_at = timezone.now()
        self.project.save(update_fields=("archived_at", "updated_at"))
        self.assertEqual(dispatch_deadline_reminders(as_of=today), 0)

    def test_task_activity_is_published_without_comment_body(self):
        TaskActivity.objects.create(
            task=self.task,
            actor=self.owner,
            action=TaskActivity.Action.COMMENTED,
            metadata={"comment_id": "comment-1", "body": "private text"},
        )

        event = ActivityEvent.objects.get(event_type=TaskActivity.Action.COMMENTED)
        self.assertEqual(event.workspace_id, self.workspace.pk)
        self.assertEqual(event.project_id, self.project.pk)
        self.assertEqual(event.metadata, {"comment_id": "comment-1"})

    def test_activity_endpoint_is_workspace_and_project_scoped(self):
        TaskActivity.objects.create(
            task=self.task,
            actor=self.owner,
            action=TaskActivity.Action.CREATED,
            metadata={"title": self.task.title},
        )
        self.client.force_authenticate(self.member)

        member_response = self.client.get(
            f"/api/workspaces/{self.workspace.pk}/activity/"
        )
        self.assertEqual(member_response.status_code, 200)
        self.assertEqual(member_response.json()["count"], 1)

        self.client.force_authenticate(self.non_project_member)
        non_project_member_response = self.client.get(
            f"/api/workspaces/{self.workspace.pk}/activity/"
        )
        self.assertEqual(non_project_member_response.status_code, 200)
        self.assertEqual(non_project_member_response.json()["count"], 0)

        self.client.force_authenticate(self.outsider)
        outsider_response = self.client.get(
            f"/api/workspaces/{self.workspace.pk}/activity/"
        )
        self.assertEqual(outsider_response.status_code, 404)

    def test_notification_read_state_is_limited_to_recipient(self):
        notification = Notification.objects.create(
            recipient=self.member,
            workspace=self.workspace,
            task=self.task,
            kind=Notification.Kind.TASK_ASSIGNED,
            title="Task assigned",
            event_key="assigned-to-member",
        )
        self.client.force_authenticate(self.outsider)
        response = self.client.post(
            f"/api/notifications/{notification.pk}/read/"
        )
        self.assertEqual(response.status_code, 404)
        notification.refresh_from_db()
        self.assertIsNone(notification.read_at)

        self.client.force_authenticate(self.member)
        response = self.client.post(
            f"/api/notifications/{notification.pk}/read/"
        )
        self.assertEqual(response.status_code, 200)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)

        self.client.post(f"/api/notifications/{notification.pk}/unread/")
        response = self.client.post("/api/notifications/read-all/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["updated"], 1)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)

        WorkspaceMember.objects.filter(
            workspace=self.workspace,
            user=self.member,
        ).delete()
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 0)

    def test_assignment_creates_activity_and_recipient_notification(self):
        add_task_assignment(
            access=get_task_access(self.owner, self.task.pk),
            actor=self.owner,
            user_id=self.member.pk,
        )

        notification = Notification.objects.get(
            recipient=self.member,
            kind=Notification.Kind.TASK_ASSIGNED,
        )
        self.assertEqual(notification.task_id, self.task.pk)
        self.assertTrue(
            ActivityEvent.objects.filter(
                task=self.task,
                event_type=TaskActivity.Action.ASSIGNMENT_ADDED,
            ).exists()
        )

    def test_comment_and_mention_notifications_exclude_comment_text(self):
        create_task_comment(
            access=get_task_access(self.owner, self.task.pk),
            actor=self.owner,
            body="A private discussion detail",
            mention_ids=(self.member.pk,),
        )

        notifications = list(Notification.objects.filter(recipient=self.member))
        self.assertEqual(len(notifications), 1)
        self.assertEqual(notifications[0].kind, Notification.Kind.TASK_MENTION)
        self.assertNotIn(
            "A private discussion detail",
            str(notifications[0].metadata),
        )
        events = ActivityEvent.objects.filter(task=self.task)
        self.assertTrue(events.exists())
        self.assertTrue(
            all(
                "A private discussion detail" not in str(event.metadata)
                for event in events
            )
        )

    @patch("apps.realtime.events.schedule_user_event")
    def test_notify_workspace_invitation_schedules_realtime_invitation_event(
        self, mock_schedule_user_event
    ):
        from apps.workspaces.services import create_invitation

        new_user = User.objects.create_user(
            username="invited-user",
            email="invited-user@example.com",
        )
        invitation = create_invitation(
            workspace=self.workspace,
            inviter=self.owner,
            email=new_user.email,
            role="member",
            message="Welcome to TeamSync!",
        )

        notification = Notification.objects.get(
            recipient=new_user,
            kind=Notification.Kind.WORKSPACE_INVITATION,
        )
        self.assertEqual(notification.metadata["role"], "member")
        self.assertEqual(notification.metadata["invitation_id"], str(invitation.pk))

        # Check mock calls to schedule_user_event: both notification.created and invitation.created
        event_types = [
            call.kwargs.get("event_type")
            for call in mock_schedule_user_event.call_args_list
        ]
        self.assertIn("notification.created", event_types)
        self.assertIn("invitation.created", event_types)

        # Verify payload for invitation.created
        invitation_call = next(
            call
            for call in mock_schedule_user_event.call_args_list
            if call.kwargs.get("event_type") == "invitation.created"
        )
        payload = invitation_call.kwargs["payload"]
        self.assertEqual(payload["invitation_id"], str(invitation.pk))
        self.assertEqual(payload["workspace_name"], self.workspace.name)
        self.assertEqual(payload["role"], "member")
        self.assertEqual(payload["message"], "Welcome to TeamSync!")

