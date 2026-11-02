import json
from datetime import date

from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.projects.models import Project, ProjectMember
from apps.projects.services import create_project
from apps.tasks.models import Label, Subtask, Task, TaskAssignee, TaskCollaborator
from apps.users.models import User
from apps.workspaces.models import Workspace, WorkspaceMember
from apps.workspaces.services import create_workspace


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class TaskApiTests(TestCase):
    def setUp(self):
        self.owner = self.create_user("task-owner", "task-owner@example.com")
        self.manager = self.create_user("task-manager", "task-manager@example.com")
        self.member = self.create_user("task-member", "task-member@example.com")
        self.viewer = self.create_user("task-viewer", "task-viewer@example.com")
        self.workspace_viewer = self.create_user(
            "task-ws-viewer",
            "task-ws-viewer@example.com",
        )
        self.outsider = self.create_user("task-outsider", "task-outsider@example.com")
        self.workspace = create_workspace(
            owner=self.owner,
            name="Task workspace",
            description="Task API tests",
        )
        for user, role in (
            (self.manager, WorkspaceMember.Role.MEMBER),
            (self.member, WorkspaceMember.Role.MEMBER),
            (self.viewer, WorkspaceMember.Role.MEMBER),
            (self.workspace_viewer, WorkspaceMember.Role.VIEWER),
        ):
            WorkspaceMember.objects.create(
                workspace=self.workspace,
                user=user,
                role=role,
            )
        self.project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={"name": "Task project"},
        )
        self.manager_membership = self.add_project_member(
            self.manager,
            ProjectMember.Role.MANAGER,
        )
        self.member_membership = self.add_project_member(
            self.member,
            ProjectMember.Role.MEMBER,
        )
        self.viewer_membership = self.add_project_member(
            self.viewer,
            ProjectMember.Role.VIEWER,
        )
        self.workspace_viewer_membership = self.add_project_member(
            self.workspace_viewer,
            ProjectMember.Role.MANAGER,
        )
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_response = csrf_client.get("/api/auth/csrf/")
        self.csrf = csrf_response.json()["csrfToken"]
        csrf_cookie = csrf_client.cookies["csrftoken"].value
        self.clients = {
            user.pk: self.authenticated_client(user, csrf_cookie)
            for user in (
                self.owner,
                self.manager,
                self.member,
                self.viewer,
                self.workspace_viewer,
                self.outsider,
            )
        }
        self.outside_workspace = create_workspace(
            owner=self.outsider,
            name="Outside",
            description="Other workspace",
        )
        self.outside_project = create_project(
            workspace=self.outside_workspace,
            creator=self.outsider,
            values={"name": "Outside project"},
        )

    @staticmethod
    def create_user(username, email):
        return User.objects.create_user(
            username=username,
            email=email,
            password="M04-test-password-74!River",
        )

    def add_project_member(self, user, role):
        return ProjectMember.objects.create(
            project=self.project,
            user=user,
            role=role,
        )

    def authenticated_client(self, user, csrf_cookie):
        client = Client(enforce_csrf_checks=True)
        client.cookies["csrftoken"] = csrf_cookie
        client.cookies["teamsync_access"] = str(
            RefreshToken.for_user(user).access_token
        )
        return client

    def request(self, user, method, path, data=None):
        body = json.dumps(data) if data is not None else ""
        return self.clients[user.pk].generic(
            method,
            path,
            body,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf,
        )

    def task_url(self, task_id=None, suffix=""):
        if task_id is None:
            return "/api/tasks/"
        return f"/api/tasks/{task_id}/{suffix}"

    def create_task(self, *, user=None, **values):
        user = user or self.owner
        payload = {
            "project_id": str(self.project.pk),
            "title": "Plan launch",
            "description": "Initial description",
            **values,
        }
        response = self.request(user, "POST", self.task_url(), payload)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_project_manager_and_member_create_tasks_and_viewers_are_read_only(self):
        created = self.create_task(
            user=self.member,
            title="Member-created task",
            assignee_ids=[str(self.member.pk)],
        )
        self.assertEqual(created["status"], Task.Status.TODO)
        self.assertEqual(created["priority"], Task.Priority.MEDIUM)
        self.assertEqual(created["assignees"][0]["user_id"], str(self.member.pk))

        forbidden_create = self.request(
            self.viewer,
            "POST",
            self.task_url(),
            {"project_id": str(self.project.pk), "title": "Viewer task"},
        )
        workspace_viewer_create = self.request(
            self.workspace_viewer,
            "POST",
            self.task_url(),
            {"project_id": str(self.project.pk), "title": "Workspace viewer task"},
        )
        member_cannot_assign_peer_during_creation = self.request(
            self.member,
            "POST",
            self.task_url(),
            {
                "project_id": str(self.project.pk),
                "title": "Member cannot assign peer",
                "assignee_ids": [str(self.manager.pk)],
            },
        )
        self.assertEqual(forbidden_create.status_code, 403)
        self.assertEqual(workspace_viewer_create.status_code, 403)
        self.assertEqual(member_cannot_assign_peer_during_creation.status_code, 403)

    def test_member_can_edit_participating_task_but_not_unrelated_task(self):
        unrelated = self.create_task(user=self.manager, title="Not assigned")
        forbidden = self.request(
            self.member,
            "PATCH",
            self.task_url(unrelated["id"]),
            {"title": "Changed"},
        )
        self.assertEqual(forbidden.status_code, 403)

        assigned_task = self.create_task(
            user=self.manager,
            title="Member assignment",
            assignee_ids=[str(self.member.pk)],
        )
        updated = self.request(
            self.member,
            "PATCH",
            self.task_url(assigned_task["id"]),
            {
                "status": Task.Status.IN_PROGRESS,
                "priority": Task.Priority.HIGH,
                "title": "Updated by assignee",
            },
        )
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertEqual(updated.json()["status"], Task.Status.IN_PROGRESS)
        self.assertEqual(updated.json()["priority"], Task.Priority.HIGH)

    def test_task_creation_validation_and_completed_status(self):
        blank_title = self.request(
            self.owner,
            "POST",
            self.task_url(),
            {"project_id": str(self.project.pk), "title": "   "},
        )
        reversed_dates = self.request(
            self.owner,
            "POST",
            self.task_url(),
            {
                "project_id": str(self.project.pk),
                "title": "Invalid dates",
                "start_date": "2026-12-10",
                "due_date": "2026-12-01",
            },
        )
        self.assertEqual(blank_title.status_code, 400)
        self.assertEqual(reversed_dates.status_code, 400)

        task = self.create_task(
            status=Task.Status.COMPLETED,
            start_date="2026-12-01",
            due_date="2026-12-10",
        )
        self.assertEqual(task["status"], Task.Status.COMPLETED)
        self.assertEqual(task["start_date"], "2026-12-01")

    def test_task_list_search_filters_and_pagination(self):
        self.create_task(
            title="Urgent release",
            priority=Task.Priority.URGENT,
            status=Task.Status.REVIEW,
            due_date="2026-12-12",
            assignee_ids=[str(self.member.pk)],
        )
        self.create_task(
            title="Routine update",
            priority=Task.Priority.LOW,
            status=Task.Status.TODO,
            due_date="2026-12-20",
        )
        url = (
            f"{self.task_url()}?project_id={self.project.pk}"
            "&search=release&status=review&priority=urgent"
            f"&assignee={self.member.pk}&due_before=2026-12-15"
        )
        response = self.request(self.member, "GET", url)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["count"], 1)
        self.assertEqual(response.json()["results"][0]["title"], "Urgent release")

        invalid_filter = self.request(
            self.owner,
            "GET",
            f"{self.task_url()}?project_id={self.project.pk}&due_after=not-a-date",
        )
        invalid_assignee = self.request(
            self.owner,
            "GET",
            f"{self.task_url()}?project_id={self.project.pk}&assignee=not-a-uuid",
        )
        self.assertEqual(invalid_filter.status_code, 400)
        self.assertEqual(invalid_assignee.status_code, 400)

    def test_cross_workspace_and_direct_uuid_access_are_blocked(self):
        outside = self.request(
            self.outsider,
            "POST",
            self.task_url(),
            {
                "project_id": str(self.project.pk),
                "title": "Outside project task",
            },
        )
        local_task = self.create_task()
        hidden = self.request(
            self.outsider,
            "GET",
            self.task_url(local_task["id"]),
        )
        self.assertEqual(outside.status_code, 404)
        self.assertEqual(hidden.status_code, 404)

    def test_assignment_requires_active_project_members_and_member_self_management(self):
        task = self.create_task(user=self.manager)
        add_assignment = self.request(
            self.manager,
            "POST",
            self.task_url(task["id"], "assignees/"),
            {"user_id": str(self.member.pk)},
        )
        self.assertEqual(add_assignment.status_code, 200, add_assignment.content)
        self.assertEqual(len(add_assignment.json()["assignees"]), 1)

        member_cannot_assign_peer = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "collaborators/"),
            {"user_id": str(self.manager.pk)},
        )
        member_can_add_self = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "collaborators/"),
            {"user_id": str(self.member.pk)},
        )
        outsider_assignment = self.request(
            self.manager,
            "POST",
            self.task_url(task["id"], "assignees/"),
            {"user_id": str(self.outsider.pk)},
        )
        self.assertEqual(member_cannot_assign_peer.status_code, 403)
        self.assertEqual(member_can_add_self.status_code, 200)
        self.assertEqual(outsider_assignment.status_code, 400)
        self.assertTrue(
            TaskAssignee.objects.filter(
                task_id=task["id"],
                project_member=self.member_membership,
            ).exists()
        )
        self.assertTrue(
            TaskCollaborator.objects.filter(
                task_id=task["id"],
                project_member=self.member_membership,
            ).exists()
        )

    def test_member_and_manager_task_deletion_permissions(self):
        task = self.create_task(user=self.manager, assignee_ids=[str(self.member.pk)])
        denied = self.request(
            self.member,
            "DELETE",
            self.task_url(task["id"]),
        )
        deleted = self.request(
            self.manager,
            "DELETE",
            self.task_url(task["id"]),
        )
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(Task.objects.filter(pk=task["id"]).exists())

    def test_task_archive_restore_and_duplicate_rules(self):
        label = Label.objects.create(
            project=self.project,
            name="release",
            created_by=self.owner,
        )
        task = self.create_task(
            user=self.manager,
            title="Release task",
            description="Details",
            status=Task.Status.REVIEW,
            priority=Task.Priority.HIGH,
            start_date="2026-12-01",
            due_date="2026-12-15",
            assignee_ids=[str(self.member.pk)],
            collaborator_ids=[str(self.viewer.pk)],
            label_ids=[str(label.pk)],
        )
        Subtask.objects.create(task_id=task["id"], title="Do not copy")
        duplicate_response = self.request(
            self.manager,
            "POST",
            self.task_url(task["id"], "duplicate/"),
        )
        self.assertEqual(duplicate_response.status_code, 201)
        duplicate = duplicate_response.json()
        self.assertEqual(duplicate["status"], Task.Status.TODO)
        self.assertEqual(duplicate["priority"], Task.Priority.HIGH)
        self.assertEqual(duplicate["description"], "Details")
        self.assertEqual(len(duplicate["labels"]), 1)
        self.assertEqual(duplicate["assignees"], [])
        self.assertEqual(duplicate["collaborators"], [])
        self.assertEqual(duplicate["subtask_count"], 0)

        archived = self.request(
            self.manager,
            "POST",
            self.task_url(task["id"], "archive/"),
        )
        self.assertEqual(archived.status_code, 200)
        self.assertIsNotNone(archived.json()["archived_at"])
        archived_list = self.request(
            self.owner,
            "GET",
            f"{self.task_url()}?project_id={self.project.pk}&archived=true",
        )
        self.assertEqual(archived_list.json()["count"], 1)
        restored = self.request(
            self.manager,
            "POST",
            self.task_url(task["id"], "restore/"),
        )
        self.assertEqual(restored.status_code, 200)
        self.assertIsNone(restored.json()["archived_at"])

    def test_labels_are_project_scoped_and_member_can_apply_label(self):
        task = self.create_task(user=self.member, title="Member task")
        label_response = self.request(
            self.manager,
            "POST",
            f"/api/projects/{self.project.pk}/labels/",
            {"name": "frontend"},
        )
        self.assertEqual(label_response.status_code, 201)
        applied = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "labels/"),
            {"label_id": label_response.json()["id"]},
        )
        self.assertEqual(applied.status_code, 200, applied.content)
        self.assertEqual(applied.json()["labels"][0]["name"], "frontend")

        other_project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={"name": "Another project"},
        )
        other_label = Label.objects.create(project=other_project, name="external")
        cross_project = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "labels/"),
            {"label_id": str(other_label.pk)},
        )
        self.assertEqual(cross_project.status_code, 404)

    def test_subtask_progress_and_comment_ownership(self):
        task = self.create_task(user=self.member, title="Participating task")
        subtask_response = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "subtasks/"),
            {"title": "First step"},
        )
        self.assertEqual(subtask_response.status_code, 201)
        subtask_id = subtask_response.json()["id"]
        completed = self.request(
            self.member,
            "PATCH",
            self.task_url(task["id"], f"subtasks/{subtask_id}/"),
            {"is_completed": True},
        )
        self.assertEqual(completed.status_code, 200)
        self.assertTrue(completed.json()["is_completed"])
        details = self.request(self.member, "GET", self.task_url(task["id"]))
        self.assertEqual(details.json()["subtask_count"], 1)
        self.assertEqual(details.json()["completed_subtask_count"], 1)

        comment_response = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "comments/"),
            {"body": "Starting work"},
        )
        comment_id = comment_response.json()["id"]
        edit_own = self.request(
            self.member,
            "PATCH",
            self.task_url(task["id"], f"comments/{comment_id}/"),
            {"body": "Work started"},
        )
        edit_other = self.request(
            self.manager,
            "PATCH",
            self.task_url(task["id"], f"comments/{comment_id}/"),
            {"body": "Manager edit"},
        )
        delete_own = self.request(
            self.member,
            "DELETE",
            self.task_url(task["id"], f"comments/{comment_id}/"),
        )
        self.assertEqual(edit_own.status_code, 200)
        self.assertEqual(edit_other.status_code, 403)
        self.assertEqual(delete_own.status_code, 204)

    def test_workspace_viewer_cannot_delete_own_existing_comment(self):
        task = self.create_task(user=self.member, title="Comment visibility")
        comment_response = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "comments/"),
            {"body": "A member comment"},
        )
        self.assertEqual(comment_response.status_code, 201)
        WorkspaceMember.objects.filter(
            workspace=self.workspace,
            user=self.member,
        ).update(role=WorkspaceMember.Role.VIEWER)

        delete_comment = self.request(
            self.member,
            "DELETE",
            self.task_url(task["id"], f"comments/{comment_response.json()['id']}/"),
        )

        self.assertEqual(delete_comment.status_code, 403)

    def test_project_and_workspace_deletion_are_protected_while_tasks_exist(self):
        task = self.create_task()
        self.request(self.owner, "POST", f"/api/projects/{self.project.pk}/archive/")
        project_delete = self.request(
            self.owner,
            "DELETE",
            f"/api/projects/{self.project.pk}/",
        )
        workspace_delete = self.request(
            self.owner,
            "DELETE",
            f"/api/workspaces/{self.workspace.pk}/",
        )
        self.assertEqual(project_delete.status_code, 409)
        self.assertEqual(workspace_delete.status_code, 409)
        self.assertTrue(Task.objects.filter(pk=task["id"]).exists())

        task_delete = self.request(
            self.owner,
            "DELETE",
            self.task_url(task["id"]),
        )
        project_delete_after_task = self.request(
            self.owner,
            "DELETE",
            f"/api/projects/{self.project.pk}/",
        )
        self.assertEqual(task_delete.status_code, 204)
        self.assertEqual(project_delete_after_task.status_code, 204)

    def test_task_database_constraints(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Task.objects.create(
                    project=self.project,
                    creator=self.owner,
                    title="",
                )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Task.objects.create(
                    project=self.project,
                    creator=self.owner,
                    title="Invalid dates",
                    start_date=date(2026, 12, 10),
                    due_date=date(2026, 12, 9),
                )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Task.objects.create(
                    project=self.project,
                    creator=self.owner,
                    title="Invalid priority",
                    priority="critical",
                )
