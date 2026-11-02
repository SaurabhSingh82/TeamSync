from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.projects.models import Project, ProjectMember
from apps.projects.services import create_project
from apps.tasks.models import BoardColumn, Task, TaskActivity, TaskAssignee
from apps.users.models import User
from apps.workspaces.models import WorkspaceMember
from apps.workspaces.services import create_workspace


class DashboardApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="dashboard-owner",
            email="dashboard-owner@example.com",
        )
        self.member = User.objects.create_user(
            username="dashboard-member",
            email="dashboard-member@example.com",
        )
        self.outsider = User.objects.create_user(
            username="dashboard-outsider",
            email="dashboard-outsider@example.com",
        )
        self.workspace = create_workspace(
            owner=self.owner,
            name="Dashboard workspace",
            description="Dashboard endpoint tests",
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.member,
            role=WorkspaceMember.Role.MEMBER,
        )
        self.project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={
                "name": "Member project",
                "status": Project.Status.ACTIVE,
                "start_date": timezone.localdate(),
                "due_date": timezone.localdate() + timedelta(days=8),
            },
        )
        self.member_project = ProjectMember.objects.create(
            project=self.project,
            user=self.member,
            role=ProjectMember.Role.MEMBER,
        )
        self.hidden_project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={
                "name": "Hidden project",
                "status": Project.Status.ACTIVE,
            },
        )
        self.today = timezone.localdate()
        self.task = self.create_task(
            self.project,
            "Prepare release",
            start_date=self.today,
            due_date=self.today + timedelta(days=2),
        )
        TaskAssignee.objects.create(
            task=self.task,
            project_member=self.member_project,
        )
        self.overdue_task = self.create_task(
            self.project,
            "Overdue task",
            due_date=self.today - timedelta(days=1),
        )
        TaskAssignee.objects.create(
            task=self.overdue_task,
            project_member=self.member_project,
        )
        self.completed_task = self.create_task(
            self.project,
            "Published release",
            status=Task.Status.COMPLETED,
        )
        self.archived_task = self.create_task(
            self.project,
            "Archived task",
            archived_at=timezone.now(),
        )
        self.hidden_task = self.create_task(
            self.hidden_project,
            "Private project task",
            due_date=self.today + timedelta(days=1),
        )
        TaskActivity.objects.create(
            task=self.task,
            actor=self.owner,
            action=TaskActivity.Action.CREATED,
            metadata={"title": self.task.title},
        )
        self.client = APIClient()

    @staticmethod
    def create_task(project, title, **values):
        task_status = values.pop("status", Task.Status.TODO)
        column = BoardColumn.objects.get(
            board__project=project,
            status=task_status,
            is_default=True,
        )
        return Task.objects.create(
            project=project,
            board_column=column,
            creator=project.created_by,
            title=title,
            status=task_status,
            **values,
        )

    def test_dashboard_summary_is_project_scoped_and_aggregated(self):
        self.client.force_authenticate(self.member)

        response = self.client.get("/api/dashboard/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["projects"], {"total": 1, "active": 1})
        self.assertEqual(data["tasks"]["total"], 3)
        self.assertEqual(data["tasks"]["completed"], 1)
        self.assertEqual(data["tasks"]["open"], 2)
        self.assertEqual(data["my_workload"]["overdue"], 1)
        self.assertEqual(
            [task["title"] for task in data["upcoming_tasks"]],
            ["Prepare release"],
        )
        self.assertEqual(
            [task["title"] for task in data["my_workload"]["overdue_tasks"]],
            ["Overdue task"],
        )
        self.assertEqual(len(data["recent_activity"]), 1)

    def test_analytics_uses_non_archived_task_denominator_and_member_scope(self):
        self.client.force_authenticate(self.member)

        response = self.client.get("/api/analytics/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["totals"]["task_count"], 3)
        self.assertEqual(data["totals"]["completed_task_count"], 1)
        self.assertEqual(data["results"][0]["task_count"], 3)
        self.assertEqual(data["results"][0]["completed_task_count"], 1)
        self.assertEqual(data["results"][0]["progress_percent"], 33)
        self.assertIn("non-archived tasks", data["totals"]["progress_denominator"])
        self.assertNotIn(
            self.hidden_project.pk,
            [project["id"] for project in data["results"]],
        )

    def test_calendar_returns_only_authorized_task_and_project_events(self):
        self.client.force_authenticate(self.member)

        response = self.client.get(
            "/api/calendar/events/",
            {
                "start": self.today.isoformat(),
                "end": (self.today + timedelta(days=7)).isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        events = response.json()["results"]
        self.assertEqual(
            {(event["event_type"], event["event_title"]) for event in events},
            {
                ("task_start", "Prepare release"),
                ("task_deadline", "Prepare release"),
                ("project_start", "Member project"),
            },
        )
        self.assertNotIn(
            self.hidden_task.pk,
            [event["object_id"] for event in events],
        )

    def test_calendar_rejects_missing_invalid_and_oversized_ranges(self):
        self.client.force_authenticate(self.member)

        missing = self.client.get("/api/calendar/events/")
        invalid = self.client.get(
            "/api/calendar/events/",
            {"start": "not-a-date", "end": self.today.isoformat()},
        )
        oversized = self.client.get(
            "/api/calendar/events/",
            {
                "start": self.today.isoformat(),
                "end": (self.today + timedelta(days=42)).isoformat(),
            },
        )

        self.assertEqual(missing.status_code, 400)
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(oversized.status_code, 400)

    def test_dashboard_endpoints_require_authentication(self):
        self.assertEqual(self.client.get("/api/dashboard/").status_code, 401)
        self.assertEqual(self.client.get("/api/analytics/").status_code, 401)
        self.assertEqual(self.client.get("/api/calendar/events/").status_code, 401)

    def test_workspace_admin_can_view_all_workspace_projects(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get("/api/analytics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 2)
