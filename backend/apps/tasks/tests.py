import json
from datetime import date

from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.projects.models import Project, ProjectMember
from apps.projects.services import create_project
from apps.tasks.models import (
    BoardColumn,
    Label,
    Subtask,
    Task,
    TaskActivity,
    TaskAssignee,
    TaskCollaborator,
    TaskComment,
)
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

    def board_url(self, suffix=""):
        return f"/api/projects/{self.project.pk}/board/{suffix}"

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
            {"title": "Changed", "expected_version": unrelated["version"]},
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
                "expected_version": assigned_task["version"],
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
        self.assertIsNotNone(task["completed_at"])

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

    def test_comments_support_replies_mentions_edit_state_and_activity(self):
        task = self.create_task(user=self.member, title="Collaboration task")
        root_response = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "comments/"),
            {
                "body": "Please review this change",
                "mention_ids": [str(self.manager.pk)],
            },
        )
        self.assertEqual(root_response.status_code, 201, root_response.content)
        root = root_response.json()
        self.assertFalse(root["is_edited"])
        self.assertEqual(root["mentions"][0]["user_id"], str(self.manager.pk))

        reply_response = self.request(
            self.manager,
            "POST",
            self.task_url(task["id"], "comments/"),
            {
                "body": "I will take a look",
                "parent_comment_id": root["id"],
                "mention_ids": [str(self.member.pk)],
            },
        )
        self.assertEqual(reply_response.status_code, 201, reply_response.content)
        self.assertEqual(reply_response.json()["parent_comment_id"], root["id"])
        self.assertEqual(
            reply_response.json()["mentions"][0]["user_id"],
            str(self.member.pk),
        )

        edited = self.request(
            self.manager,
            "PATCH",
            self.task_url(task["id"], f"comments/{reply_response.json()['id']}/"),
            {"body": "I reviewed it", "mention_ids": []},
        )
        self.assertEqual(edited.status_code, 200, edited.content)
        self.assertTrue(edited.json()["is_edited"])
        self.assertEqual(edited.json()["mentions"], [])

        actions = set(
            TaskActivity.objects.filter(task_id=task["id"]).values_list(
                "action",
                flat=True,
            )
        )
        self.assertTrue(
            {
                TaskActivity.Action.COMMENTED,
                TaskActivity.Action.REPLIED,
                TaskActivity.Action.COMMENT_UPDATED,
                TaskActivity.Action.MENTIONED,
            }.issubset(actions)
        )

    def test_comment_mentions_and_replies_must_belong_to_active_task_members(self):
        task = self.create_task(user=self.member, title="Validated mentions")
        other_task = self.create_task(user=self.member, title="Different thread")
        workspace_only = self.create_user(
            "workspace-only",
            "workspace-only@example.com",
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=workspace_only,
            role=WorkspaceMember.Role.MEMBER,
        )
        other_comment = self.request(
            self.member,
            "POST",
            self.task_url(other_task["id"], "comments/"),
            {"body": "A separate thread"},
        ).json()

        invalid_mention = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "comments/"),
            {"body": "Invalid mention", "mention_ids": [str(workspace_only.pk)]},
        )
        invalid_parent = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "comments/"),
            {
                "body": "Cross-task reply",
                "parent_comment_id": other_comment["id"],
            },
        )
        self.assertEqual(invalid_mention.status_code, 400)
        self.assertIn("mention_ids", invalid_mention.json())
        self.assertEqual(invalid_parent.status_code, 400)
        self.assertIn("parent_comment_id", invalid_parent.json())

        root = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "comments/"),
            {"body": "Root comment"},
        ).json()
        reply = self.request(
            self.manager,
            "POST",
            self.task_url(task["id"], "comments/"),
            {"body": "First-level reply", "parent_comment_id": root["id"]},
        ).json()
        nested_reply = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "comments/"),
            {"body": "Unsupported nested reply", "parent_comment_id": reply["id"]},
        )
        self.assertEqual(nested_reply.status_code, 400)
        self.assertIn("parent_comment_id", nested_reply.json())

    def test_deleting_a_root_comment_preserves_replies_as_comments(self):
        task = self.create_task(user=self.member, title="Preserved replies")
        root = self.request(
            self.member,
            "POST",
            self.task_url(task["id"], "comments/"),
            {"body": "Parent"},
        ).json()
        reply = self.request(
            self.manager,
            "POST",
            self.task_url(task["id"], "comments/"),
            {"body": "Reply", "parent_comment_id": root["id"]},
        ).json()

        deleted = self.request(
            self.manager,
            "DELETE",
            self.task_url(task["id"], f"comments/{root['id']}/"),
        )

        self.assertEqual(deleted.status_code, 204)
        surviving_reply = TaskComment.objects.get(pk=reply["id"])
        self.assertIsNone(surviving_reply.parent_comment_id)

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
                    board_column=self.project.board.columns.get(
                        status=Task.Status.TODO,
                        is_default=True,
                    ),
                    creator=self.owner,
                    title="",
                )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Task.objects.create(
                    project=self.project,
                    board_column=self.project.board.columns.get(
                        status=Task.Status.TODO,
                        is_default=True,
                    ),
                    creator=self.owner,
                    title="Invalid dates",
                    start_date=date(2026, 12, 10),
                    due_date=date(2026, 12, 9),
                )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Task.objects.create(
                    project=self.project,
                    board_column=self.project.board.columns.get(
                        status=Task.Status.TODO,
                        is_default=True,
                    ),
                    creator=self.owner,
                    title="Invalid priority",
                    priority="critical",
                )

    def test_project_board_has_default_columns_and_task_status_mapping(self):
        response = self.request(self.owner, "GET", self.board_url())
        self.assertEqual(response.status_code, 200, response.content)
        columns = response.json()["columns"]
        self.assertEqual(
            [(column["name"], column["status"]) for column in columns],
            [
                ("To Do", Task.Status.TODO),
                ("In Progress", Task.Status.IN_PROGRESS),
                ("Review", Task.Status.REVIEW),
                ("Completed", Task.Status.COMPLETED),
            ],
        )
        self.assertTrue(all(column["is_default"] for column in columns))

        task = self.create_task(status=Task.Status.COMPLETED)
        self.assertEqual(task["board_column_id"], columns[-1]["id"])
        self.assertIsNotNone(task["completed_at"])
        self.assertEqual(task["version"], 1)

    def test_board_column_create_update_reorder_and_role_permissions(self):
        initial = self.request(self.manager, "GET", self.board_url()).json()
        created = self.request(
            self.manager,
            "POST",
            f"/api/projects/{self.project.pk}/columns/",
            {
                "name": "Ready for review",
                "status": Task.Status.REVIEW,
                "position": 2,
                "expected_board_version": initial["version"],
            },
        )
        self.assertEqual(created.status_code, 201, created.content)
        column_id = created.json()["id"]
        version = created.json()["board_version"]

        renamed = self.request(
            self.manager,
            "PATCH",
            f"/api/columns/{column_id}/",
            {
                "name": "Peer review",
                "expected_board_version": version,
            },
        )
        self.assertEqual(renamed.status_code, 200, renamed.content)
        self.assertEqual(renamed.json()["name"], "Peer review")
        version = renamed.json()["board_version"]

        current = self.request(
            self.manager,
            "GET",
            self.board_url(),
        ).json()
        column_ids = [column["id"] for column in current["columns"]]
        reordered = self.request(
            self.manager,
            "POST",
            f"/api/projects/{self.project.pk}/columns/reorder/",
            {
                "column_ids": list(reversed(column_ids)),
                "expected_board_version": version,
            },
        )
        self.assertEqual(reordered.status_code, 200, reordered.content)
        self.assertEqual(
            [column["id"] for column in reordered.json()["columns"]],
            list(reversed(column_ids)),
        )

        member_cannot_create = self.request(
            self.member,
            "POST",
            f"/api/projects/{self.project.pk}/columns/",
            {
                "name": "Member column",
                "status": Task.Status.TODO,
                "expected_board_version": reordered.json()["board_version"],
            },
        )
        viewer_cannot_reorder = self.request(
            self.viewer,
            "POST",
            f"/api/projects/{self.project.pk}/columns/reorder/",
            {
                "column_ids": list(reversed(column_ids)),
                "expected_board_version": reordered.json()["board_version"],
            },
        )
        workspace_viewer_cannot_reorder = self.request(
            self.workspace_viewer,
            "POST",
            f"/api/projects/{self.project.pk}/columns/reorder/",
            {
                "column_ids": list(reversed(column_ids)),
                "expected_board_version": reordered.json()["board_version"],
            },
        )
        self.assertEqual(member_cannot_create.status_code, 403)
        self.assertEqual(viewer_cannot_reorder.status_code, 403)
        self.assertEqual(workspace_viewer_cannot_reorder.status_code, 403)

    def test_task_move_updates_column_status_order_and_completion(self):
        task = self.create_task(title="Move between columns")
        board = self.request(self.owner, "GET", self.board_url()).json()
        in_progress = next(
            column
            for column in board["columns"]
            if column["status"] == Task.Status.IN_PROGRESS
        )
        moved = self.request(
            self.owner,
            "POST",
            self.task_url(task["id"], "move/"),
            {
                "column_id": in_progress["id"],
                "position": 0,
                "expected_task_version": task["version"],
                "expected_board_version": board["version"],
            },
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.assertEqual(moved.json()["status"], Task.Status.IN_PROGRESS)
        self.assertEqual(moved.json()["board_column_id"], in_progress["id"])
        self.assertEqual(moved.json()["position"], 0)
        self.assertIsNone(moved.json()["completed_at"])

        completed = next(
            column
            for column in board["columns"]
            if column["status"] == Task.Status.COMPLETED
        )
        completed_move = self.request(
            self.owner,
            "POST",
            self.task_url(task["id"], "move/"),
            {
                "column_id": completed["id"],
                "position": 0,
                "expected_task_version": moved.json()["version"],
                "expected_board_version": moved.json()["board_version"],
            },
        )
        self.assertEqual(completed_move.status_code, 200, completed_move.content)
        self.assertEqual(completed_move.json()["status"], Task.Status.COMPLETED)
        self.assertIsNotNone(completed_move.json()["completed_at"])

        stale = self.request(
            self.owner,
            "POST",
            self.task_url(task["id"], "move/"),
            {
                "column_id": in_progress["id"],
                "position": 0,
                "expected_task_version": task["version"],
                "expected_board_version": board["version"],
            },
        )
        self.assertEqual(stale.status_code, 409)

    def test_task_creation_can_target_active_column_on_same_project_board(self):
        board = self.request(self.owner, "GET", self.board_url()).json()
        custom_column = self.request(
            self.owner,
            "POST",
            f"/api/projects/{self.project.pk}/columns/",
            {
                "name": "Ready for review",
                "status": Task.Status.REVIEW,
                "expected_board_version": board["version"],
            },
        )
        self.assertEqual(custom_column.status_code, 201, custom_column.content)

        created = self.request(
            self.owner,
            "POST",
            self.task_url(),
            {
                "project_id": str(self.project.pk),
                "board_column_id": custom_column.json()["id"],
                "title": "Custom-column task",
                "status": Task.Status.REVIEW,
            },
        )
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()["board_column_id"], custom_column.json()["id"])
        self.assertEqual(created.json()["status"], Task.Status.REVIEW)

        cross_project_column = BoardColumn.objects.get(
            board__project=self.outside_project,
            is_default=True,
            status=Task.Status.REVIEW,
        )
        rejected = self.request(
            self.owner,
            "POST",
            self.task_url(),
            {
                "project_id": str(self.project.pk),
                "board_column_id": str(cross_project_column.pk),
                "title": "Cross-project column task",
                "status": Task.Status.REVIEW,
            },
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("board_column_id", rejected.json())

    def test_nonempty_custom_column_requires_valid_task_migration_to_delete(self):
        board = self.request(self.owner, "GET", self.board_url()).json()
        created = self.request(
            self.owner,
            "POST",
            f"/api/projects/{self.project.pk}/columns/",
            {
                "name": "Backlog",
                "status": Task.Status.TODO,
                "expected_board_version": board["version"],
            },
        )
        self.assertEqual(created.status_code, 201, created.content)
        task = self.create_task(title="Backlog task")
        board = self.request(self.owner, "GET", self.board_url()).json()
        moved = self.request(
            self.owner,
            "POST",
            self.task_url(task["id"], "move/"),
            {
                "column_id": created.json()["id"],
                "position": 0,
                "expected_task_version": task["version"],
                "expected_board_version": board["version"],
            },
        )
        self.assertEqual(moved.status_code, 200, moved.content)

        delete_url = f"/api/columns/{created.json()['id']}/"
        no_destination = self.request(
            self.owner,
            "DELETE",
            delete_url,
            {"expected_board_version": moved.json()["board_version"]},
        )
        self.assertEqual(no_destination.status_code, 400)
        board = self.request(self.owner, "GET", self.board_url()).json()
        todo = next(column for column in board["columns"] if column["is_default"] and column["status"] == Task.Status.TODO)
        deleted = self.request(
            self.owner,
            "DELETE",
            delete_url,
            {
                "destination_column_id": todo["id"],
                "expected_board_version": board["version"],
            },
        )
        self.assertEqual(deleted.status_code, 200, deleted.content)
        task_model = Task.objects.get(pk=task["id"])
        self.assertEqual(str(task_model.board_column_id), todo["id"])
        self.assertEqual(task_model.status, Task.Status.TODO)

    def test_board_combines_filters_and_rejects_cross_project_access(self):
        label = self.request(
            self.manager,
            "POST",
            f"/api/projects/{self.project.pk}/labels/",
            {"name": "board-filter"},
        )
        self.assertEqual(label.status_code, 201, label.content)
        matched = self.create_task(
            title="Filter match",
            status=Task.Status.REVIEW,
            priority=Task.Priority.HIGH,
            label_ids=[label.json()["id"]],
        )
        self.create_task(
            title="Different task",
            status=Task.Status.TODO,
            priority=Task.Priority.LOW,
        )
        board = self.request(
            self.member,
            "GET",
            f"{self.board_url()}?search=Filter&status=review&priority=high&label={label.json()['id']}",
        )
        self.assertEqual(board.status_code, 200, board.content)
        task_ids = [
            task["id"]
            for column in board.json()["columns"]
            for task in column["tasks"]
        ]
        self.assertEqual(task_ids, [matched["id"]])

        viewer_read = self.request(self.viewer, "GET", self.board_url())
        outsider_read = self.request(
            self.outsider,
            "GET",
            f"/api/projects/{self.project.pk}/board/",
        )
        self.assertEqual(viewer_read.status_code, 200)
        self.assertEqual(outsider_read.status_code, 404)

    def test_task_activity_records_creation_updates_and_board_moves(self):
        task = self.create_task(title="History task")
        updated = self.request(
            self.owner,
            "PATCH",
            self.task_url(task["id"]),
            {
                "title": "Updated history task",
                "expected_version": task["version"],
            },
        )
        self.assertEqual(updated.status_code, 200, updated.content)
        board = self.request(self.owner, "GET", self.board_url()).json()
        review = next(
            column
            for column in board["columns"]
            if column["status"] == Task.Status.REVIEW
        )
        moved = self.request(
            self.owner,
            "POST",
            self.task_url(task["id"], "move/"),
            {
                "column_id": review["id"],
                "position": 0,
                "expected_task_version": updated.json()["version"],
                "expected_board_version": board["version"],
            },
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        history = self.request(
            self.owner,
            "GET",
            self.task_url(task["id"], "activity/"),
        )
        self.assertEqual(history.status_code, 200, history.content)
        actions = [item["action"] for item in history.json()["results"]]
        self.assertEqual(
            actions,
            [
                TaskActivity.Action.MOVED,
                TaskActivity.Action.UPDATED,
                TaskActivity.Action.CREATED,
            ],
        )
