from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless

from django.db import close_old_connections, connection, connections
from django.test import TransactionTestCase
from django.utils import timezone

from apps.notifications.models import Notification
from apps.notifications.services import dispatch_deadline_reminders
from apps.projects.models import ProjectMember
from apps.projects.services import create_project
from apps.tasks.models import BoardColumn, Task, TaskAssignee
from apps.users.models import User
from apps.workspaces.models import WorkspaceMember
from apps.workspaces.services import create_workspace


@skipUnless(
    connection.vendor == "postgresql",
    "PostgreSQL notification concurrency tests require PostgreSQL.",
)
class NotificationPostgreSQLConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = User.objects.create_user(
            username="notification-owner",
            email="notification-owner@example.com",
        )
        self.assignee = User.objects.create_user(
            username="notification-assignee",
            email="notification-assignee@example.com",
        )
        self.workspace = create_workspace(
            owner=self.owner,
            name="Notification concurrency",
            description="PostgreSQL idempotency test",
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.assignee,
            role=WorkspaceMember.Role.MEMBER,
        )
        self.project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={"name": "Notification concurrency project"},
        )
        assignee_membership = ProjectMember.objects.create(
            project=self.project,
            user=self.assignee,
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
            title="Due today",
            due_date=timezone.localdate(),
        )
        TaskAssignee.objects.create(
            task=self.task,
            project_member=assignee_membership,
        )

    def test_simultaneous_reminder_runs_create_one_notification_per_user(self):
        barrier = Barrier(2)

        def dispatch():
            close_old_connections()
            try:
                barrier.wait(timeout=15)
                return dispatch_deadline_reminders(as_of=self.task.due_date)
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(dispatch) for _ in range(2)]
            results = [future.result(timeout=30) for future in futures]

        self.assertEqual(sum(results), 2)
        self.assertEqual(
            Notification.objects.filter(
                task=self.task,
                kind=Notification.Kind.DEADLINE_TODAY,
            ).count(),
            2,
        )
