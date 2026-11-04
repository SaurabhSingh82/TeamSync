import json

from django.test import Client, TestCase, override_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.projects.models import Project, ProjectMember
from apps.projects.services import create_project
from apps.tasks.models import BoardColumn, Label, Task, TaskComment
from apps.users.models import User
from apps.workspaces.models import Workspace, WorkspaceMember
from apps.workspaces.services import create_workspace


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class SearchApiTests(TestCase):
    def setUp(self):
        self.owner = self.create_user("search-owner", "search-owner@example.com")
        self.member = self.create_user("search-member", "search-member@example.com")
        self.outsider = self.create_user("search-outsider", "search-outsider@example.com")
        self.workspace = create_workspace(
            owner=self.owner,
            name="Search workspace",
            description="Workspace available to search",
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.member,
            role=WorkspaceMember.Role.MEMBER,
        )
        self.project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={"name": "Search project"},
        )
        ProjectMember.objects.create(
            project=self.project,
            user=self.member,
            role=ProjectMember.Role.MEMBER,
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.outsider,
            role=WorkspaceMember.Role.MEMBER,
        )
        self.task = self.create_task(self.project, "Searchable task")
        self.task.due_date = "2026-11-10"
        self.task.save(update_fields=("due_date",))
        self.task.assignees.add(
            ProjectMember.objects.get(project=self.project, user=self.member),
        )
        label = Label.objects.create(
            project=self.project,
            name="Launch readiness",
            created_by=self.owner,
        )
        self.task.labels.add(label)
        TaskComment.objects.create(
            task=self.task,
            author=self.member,
            body="A searchable comment body",
        )

        self.outside_workspace = create_workspace(
            owner=self.outsider,
            name="Private workspace",
            description="Must not appear in global search",
        )
        self.outside_project = create_project(
            workspace=self.outside_workspace,
            creator=self.outsider,
            values={"name": "Private search project"},
        )
        outside_task = self.create_task(self.outside_project, "Private searchable task")
        TaskComment.objects.create(
            task=outside_task,
            author=self.outsider,
            body="Private searchable comment",
        )

        csrf_client = Client(enforce_csrf_checks=True)
        csrf_response = csrf_client.get("/api/auth/csrf/")
        self.csrf = csrf_response.json()["csrfToken"]
        csrf_cookie = csrf_client.cookies["csrftoken"].value
        self.clients = {
            user.pk: self.authenticated_client(user, csrf_cookie)
            for user in (self.owner, self.member, self.outsider)
        }

    @staticmethod
    def create_user(username, email):
        return User.objects.create_user(username=username, email=email, password="SafePass123!")

    @staticmethod
    def create_task(project, title):
        column = BoardColumn.objects.get(
            board__project=project,
            is_default=True,
            status="todo",
        )
        return Task.objects.create(
            project=project,
            board_column=column,
            title=title,
            creator=project.created_by,
        )

    def authenticated_client(self, user, csrf_cookie):
        client = Client(enforce_csrf_checks=True)
        client.cookies["csrftoken"] = csrf_cookie
        client.cookies["teamsync_access"] = str(
            RefreshToken.for_user(user).access_token
        )
        return client

    def search(self, user, query):
        return self.clients[user.pk].get(
            f"/api/search/?{query}",
            HTTP_X_CSRFTOKEN=self.csrf,
        )

    def test_global_search_returns_accessible_projects_tasks_members_and_comments(self):
        response = self.search(self.member, "q=search")

        self.assertEqual(response.status_code, 200, response.content)
        results = response.json()
        self.assertEqual(results["projects"]["count"], 1)
        self.assertEqual(results["tasks"]["results"][0]["id"], str(self.task.pk))
        self.assertIn(
            self.owner.username,
            [item["username"] for item in results["members"]["results"]],
        )
        self.assertEqual(
            results["comments"]["results"][0]["body"],
            "A searchable comment body",
        )
        self.assertNotIn("email", results["members"]["results"][0])

    def test_search_does_not_disclose_records_outside_accessible_projects(self):
        response = self.search(self.member, "q=Private")

        self.assertEqual(response.status_code, 200, response.content)
        results = response.json()
        for group in ("projects", "tasks", "members", "comments"):
            self.assertEqual(results[group]["count"], 0)

    def test_search_returns_workspace_members_without_private_profile_fields(self):
        response = self.search(self.member, "q=search-outsider")

        self.assertEqual(response.status_code, 200, response.content)
        member_results = response.json()["members"]
        self.assertEqual(member_results["count"], 1)
        self.assertEqual(
            member_results["results"][0]["username"],
            self.outsider.username,
        )
        self.assertNotIn("email", member_results["results"][0])

    def test_search_supports_task_filters_and_pagination(self):
        response = self.search(
            self.member,
            "q=searchable&project=Search&status=todo&priority=medium"
            "&assignee=search-member&creator=search-owner"
            "&label=Launch&due_after=2026-11-01&due_before=2026-11-30"
            "&page_size=1",
        )

        self.assertEqual(response.status_code, 200, response.content)
        results = response.json()
        self.assertEqual(results["tasks"]["count"], 1)
        self.assertEqual(len(results["tasks"]["results"]), 1)
        self.assertEqual(results["tasks"]["page"], 1)

    def test_comment_search_finds_comment_when_task_text_does_not_match(self):
        comment_only_task = self.create_task(self.project, "Ordinary task title")
        TaskComment.objects.create(
            task=comment_only_task,
            author=self.member,
            body="A unique phrase searchable only in the comment",
        )

        response = self.search(self.member, "q=unique+phrase")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["tasks"]["count"], 0)
        self.assertEqual(response.json()["comments"]["count"], 1)
        self.assertEqual(
            response.json()["comments"]["results"][0]["task_title"],
            "Ordinary task title",
        )

    def test_search_paginates_each_result_group_and_caps_page_size(self):
        self.create_task(self.project, "Searchable second task")

        response = self.search(self.member, "q=searchable&page=2&page_size=1")

        self.assertEqual(response.status_code, 200, response.content)
        results = response.json()
        self.assertEqual(results["page"], 2)
        self.assertEqual(results["page_size"], 1)
        self.assertEqual(results["tasks"]["count"], 2)
        self.assertEqual(results["tasks"]["page"], 2)
        self.assertEqual(len(results["tasks"]["results"]), 1)

        capped = self.search(self.member, "q=searchable&page_size=100")
        self.assertEqual(capped.status_code, 200, capped.content)
        self.assertEqual(capped.json()["page_size"], 20)

    def test_search_rejects_missing_or_oversized_query_and_invalid_filters(self):
        missing_query = self.search(self.member, "")
        oversized_query = self.search(self.member, f"q={'x' * 101}")
        invalid_status = self.search(self.member, "q=searchable&status=unknown")

        self.assertEqual(missing_query.status_code, 400)
        self.assertEqual(oversized_query.status_code, 400)
        self.assertEqual(invalid_status.status_code, 400)

    def test_search_requires_authentication(self):
        response = Client().get("/api/search/?q=searchable")

        self.assertEqual(response.status_code, 401)
