import json
from datetime import date
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from apps.projects.models import Project, ProjectMember
from apps.projects.services import create_project
from apps.users.models import User
from apps.workspaces.models import Workspace, WorkspaceMember
from apps.workspaces.services import create_workspace


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"]
)
class ProjectApiTests(TestCase):
    def setUp(self):
        self.owner = self.create_user("owner", "owner@example.com")
        self.admin = self.create_user("admin", "admin@example.com")
        self.member = self.create_user("member", "member@example.com")
        self.manager = self.create_user("manager", "manager@example.com")
        self.viewer = self.create_user("viewer", "viewer@example.com")
        self.outsider = self.create_user("outsider", "outsider@example.com")
        self.workspace = create_workspace(
            owner=self.owner,
            name="Engineering",
            description="Project test workspace",
        )
        self.admin_workspace_membership = self.add_workspace_member(
            self.admin,
            WorkspaceMember.Role.ADMIN,
        )
        self.member_workspace_membership = self.add_workspace_member(
            self.member,
            WorkspaceMember.Role.MEMBER,
        )
        self.manager_workspace_membership = self.add_workspace_member(
            self.manager,
            WorkspaceMember.Role.MEMBER,
        )
        self.viewer_workspace_membership = self.add_workspace_member(
            self.viewer,
            WorkspaceMember.Role.VIEWER,
        )
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_response = csrf_client.get("/api/auth/csrf/")
        self.csrf = csrf_response.json()["csrfToken"]
        csrf_cookie = csrf_client.cookies["csrftoken"].value
        self.owner_client = self.authenticated_client(self.owner, csrf_cookie)
        self.admin_client = self.authenticated_client(self.admin, csrf_cookie)
        self.member_client = self.authenticated_client(self.member, csrf_cookie)
        self.manager_client = self.authenticated_client(self.manager, csrf_cookie)
        self.viewer_client = self.authenticated_client(self.viewer, csrf_cookie)
        self.outsider_client = self.authenticated_client(self.outsider, csrf_cookie)
        self.project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={"name": "Launch", "description": "First project"},
        )
        self.owner_project_membership = ProjectMember.objects.get(
            project=self.project,
            user=self.owner,
        )
        self.member_project_membership = self.add_project_member(
            self.member,
            ProjectMember.Role.MEMBER,
        )
        self.manager_project_membership = self.add_project_member(
            self.manager,
            ProjectMember.Role.MANAGER,
        )
        self.viewer_project_membership = self.add_project_member(
            self.viewer,
            ProjectMember.Role.VIEWER,
        )

    @staticmethod
    def create_user(username, email):
        return User.objects.create_user(
            username=username,
            email=email,
            password="SecurePass!83520",
        )

    def add_workspace_member(self, user, role):
        return WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=user,
            role=role,
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
        client.cookies["teamsync_access"] = str(RefreshToken.for_user(user).access_token)
        return client

    def request(self, client, method, path, data=None):
        body = json.dumps(data) if data is not None else ""
        return client.generic(
            method,
            path,
            body,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf,
        )

    def workspace_projects_url(self, workspace=None):
        workspace = workspace or self.workspace
        return f"/api/workspaces/{workspace.pk}/projects/"

    def project_url(self, project=None, suffix=""):
        project = project or self.project
        return f"/api/projects/{project.pk}/{suffix}"

    def test_project_creation_is_atomic_and_creator_becomes_manager(self):
        response = self.request(
            self.admin_client,
            "POST",
            self.workspace_projects_url(),
            {
                "name": "  New Project  ",
                "description": "A project",
                "start_date": "2026-11-01",
                "due_date": "2026-11-30",
            },
        )

        self.assertEqual(response.status_code, 201, response.content)
        project = Project.objects.get(pk=response.json()["id"])
        self.assertEqual(project.name, "New Project")
        self.assertEqual(project.status, Project.Status.PLANNING)
        self.assertEqual(project.created_by_id, self.admin.pk)
        self.assertTrue(
            ProjectMember.objects.filter(
                project=project,
                user=self.admin,
                role=ProjectMember.Role.MANAGER,
            ).exists()
        )

    def test_only_workspace_owner_and_admin_can_create_projects(self):
        for client in (self.member_client, self.viewer_client):
            response = self.request(
                client,
                "POST",
                self.workspace_projects_url(),
                {"name": "Forbidden"},
            )
            self.assertEqual(response.status_code, 403)

    def test_creator_and_workspace_admin_access_project_without_membership(self):
        second_project = create_project(
            workspace=self.workspace,
            creator=self.admin,
            values={"name": "Admin Project"},
        )
        self.assertFalse(
            ProjectMember.objects.filter(
                project=second_project,
                user=self.owner,
            ).exists()
        )

        owner_read = self.request(
            self.owner_client,
            "GET",
            self.project_url(second_project),
        )
        admin_read = self.request(
            self.admin_client,
            "GET",
            self.project_url(second_project),
        )
        member_read = self.request(
            self.member_client,
            "GET",
            self.project_url(second_project),
        )
        self.assertEqual(owner_read.status_code, 200)
        self.assertEqual(admin_read.status_code, 200)
        self.assertEqual(member_read.status_code, 404)

    def test_project_listing_is_workspace_and_project_scoped(self):
        second_project = create_project(
            workspace=self.workspace,
            creator=self.admin,
            values={"name": "Internal"},
        )
        owner_response = self.request(
            self.owner_client,
            "GET",
            self.workspace_projects_url(),
        )
        member_response = self.request(
            self.member_client,
            "GET",
            self.workspace_projects_url(),
        )
        outsider_response = self.request(
            self.outsider_client,
            "GET",
            self.workspace_projects_url(),
        )

        self.assertEqual(owner_response.status_code, 200)
        self.assertEqual(owner_response.json()["count"], 2)
        self.assertEqual(member_response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in member_response.json()["results"]],
            [str(self.project.pk)],
        )
        self.assertEqual(outsider_response.status_code, 404)
        self.assertNotIn(
            str(second_project.pk),
            [item["id"] for item in member_response.json()["results"]],
        )

    def test_project_roles_and_workspace_viewer_permissions_are_enforced(self):
        member_read = self.request(
            self.member_client,
            "GET",
            self.project_url(),
        )
        member_write = self.request(
            self.member_client,
            "PATCH",
            self.project_url(),
            {"description": "Changed"},
        )
        manager_write = self.request(
            self.manager_client,
            "PATCH",
            self.project_url(),
            {"description": "Changed by manager"},
        )
        viewer_read = self.request(
            self.viewer_client,
            "GET",
            self.project_url(),
        )
        viewer_write = self.request(
            self.viewer_client,
            "PATCH",
            self.project_url(),
            {"description": "Must remain read-only"},
        )

        self.assertEqual(member_read.status_code, 200)
        self.assertEqual(member_write.status_code, 403)
        self.assertEqual(manager_write.status_code, 200)
        self.assertEqual(viewer_read.status_code, 200)
        self.assertEqual(viewer_write.status_code, 403)

        self.viewer_project_membership.role = ProjectMember.Role.MANAGER
        self.viewer_project_membership.save(update_fields=("role",))
        elevated_viewer_write = self.request(
            self.viewer_client,
            "PATCH",
            self.project_url(),
            {"description": "Still read-only"},
        )
        self.assertEqual(elevated_viewer_write.status_code, 403)

    def test_project_crud_rejects_cross_workspace_and_direct_uuid_access(self):
        other_workspace = create_workspace(
            owner=self.outsider,
            name="Other",
            description="Private",
        )
        other_project = create_project(
            workspace=other_workspace,
            creator=self.outsider,
            values={"name": "Private project"},
        )
        response = self.request(
            self.owner_client,
            "GET",
            self.project_url(other_project),
        )
        self.assertEqual(response.status_code, 404)

    def test_search_status_archived_filter_and_completed_listing(self):
        completed = create_project(
            workspace=self.workspace,
            creator=self.admin,
            values={"name": "Release notes", "status": Project.Status.COMPLETED},
        )
        Project.objects.filter(pk=self.project.pk).update(
            archived_at=timezone.now(),
        )

        default_list = self.request(
            self.owner_client,
            "GET",
            self.workspace_projects_url(),
        )
        archived_list = self.request(
            self.owner_client,
            "GET",
            f"{self.workspace_projects_url()}?archived=true",
        )
        filtered = self.request(
            self.owner_client,
            "GET",
            f"{self.workspace_projects_url()}?status=completed&search=release",
        )

        self.assertEqual(
            [item["id"] for item in default_list.json()["results"]],
            [str(completed.pk)],
        )
        self.assertEqual(
            [item["id"] for item in archived_list.json()["results"]],
            [str(self.project.pk)],
        )
        self.assertEqual(
            [item["id"] for item in filtered.json()["results"]],
            [str(completed.pk)],
        )

    def test_status_changes_invalid_filters_and_pagination(self):
        status_response = self.request(
            self.manager_client,
            "PATCH",
            self.project_url(),
            {"status": Project.Status.ON_HOLD},
        )
        self.assertEqual(status_response.status_code, 200)
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, Project.Status.ON_HOLD)

        invalid_status = self.request(
            self.owner_client,
            "GET",
            f"{self.workspace_projects_url()}?status=unknown",
        )
        invalid_archive_filter = self.request(
            self.owner_client,
            "GET",
            f"{self.workspace_projects_url()}?archived=maybe",
        )
        self.assertEqual(invalid_status.status_code, 400)
        self.assertEqual(invalid_archive_filter.status_code, 400)

        for index in range(22):
            Project.objects.create(
                workspace=self.workspace,
                created_by=self.owner,
                name=f"Paginated {index}",
            )
        page = self.request(
            self.owner_client,
            "GET",
            f"{self.workspace_projects_url()}?page=2&page_size=10",
        )
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.json()["count"], 23)
        self.assertEqual(len(page.json()["results"]), 10)

    def test_invalid_project_dates_are_rejected_by_api_and_database(self):
        response = self.request(
            self.owner_client,
            "POST",
            self.workspace_projects_url(),
            {
                "name": "Invalid dates",
                "start_date": "2026-11-20",
                "due_date": "2026-11-19",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("due_date", response.json())

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Project.objects.filter(pk=self.project.pk).update(
                    start_date=date(2026, 11, 20),
                    due_date=date(2026, 11, 19),
                )

    def test_project_name_and_membership_constraints_are_database_enforced(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Project.objects.create(
                    workspace=self.workspace,
                    created_by=self.owner,
                    name="",
                )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProjectMember.objects.create(
                    project=self.project,
                    user=self.member,
                    role=ProjectMember.Role.MEMBER,
                )

    def test_project_archive_restore_and_delete_safeguards(self):
        premature_delete = self.request(
            self.owner_client,
            "DELETE",
            self.project_url(),
        )
        manager_archive = self.request(
            self.manager_client,
            "POST",
            self.project_url(suffix="archive/"),
        )
        self.assertEqual(premature_delete.status_code, 409)
        self.assertEqual(manager_archive.status_code, 200)
        self.project.refresh_from_db()
        self.assertIsNotNone(self.project.archived_at)

        restored = self.request(
            self.manager_client,
            "POST",
            self.project_url(suffix="restore/"),
        )
        self.assertEqual(restored.status_code, 200)
        self.project.refresh_from_db()
        self.assertIsNone(self.project.archived_at)

        self.request(self.manager_client, "POST", self.project_url(suffix="archive/"))
        member_delete = self.request(
            self.member_client,
            "DELETE",
            self.project_url(),
        )
        owner_delete = self.request(
            self.owner_client,
            "DELETE",
            self.project_url(),
        )
        self.assertEqual(member_delete.status_code, 403)
        self.assertEqual(owner_delete.status_code, 204)
        self.assertFalse(Project.objects.filter(pk=self.project.pk).exists())

    def test_project_member_add_duplicate_and_cross_workspace_validation(self):
        added = self.request(
            self.manager_client,
            "POST",
            self.project_url(suffix="members/"),
            {"user_id": str(self.admin.pk), "role": ProjectMember.Role.MEMBER},
        )
        duplicate = self.request(
            self.manager_client,
            "POST",
            self.project_url(suffix="members/"),
            {"user_id": str(self.admin.pk), "role": ProjectMember.Role.MEMBER},
        )
        other_workspace = create_workspace(
            owner=self.outsider,
            name="Separate",
            description="",
        )
        nonmember = self.create_user("external", "external@example.com")
        WorkspaceMember.objects.create(
            workspace=other_workspace,
            user=nonmember,
            role=WorkspaceMember.Role.MEMBER,
        )
        invalid_workspace_member = self.request(
            self.manager_client,
            "POST",
            self.project_url(suffix="members/"),
            {"user_id": str(nonmember.pk), "role": ProjectMember.Role.VIEWER},
        )

        self.assertEqual(added.status_code, 201, added.content)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(invalid_workspace_member.status_code, 400)
        self.assertTrue(Workspace.objects.filter(pk=other_workspace.pk).exists())

    def test_project_member_role_changes_removal_and_self_promotion(self):
        promote_self = self.request(
            self.member_client,
            "PATCH",
            self.project_url(suffix=f"members/{self.member_project_membership.pk}/"),
            {"role": ProjectMember.Role.MANAGER},
        )
        manager_changes_role = self.request(
            self.manager_client,
            "PATCH",
            self.project_url(suffix=f"members/{self.member_project_membership.pk}/"),
            {"role": ProjectMember.Role.VIEWER},
        )
        manager_removes_member = self.request(
            self.manager_client,
            "DELETE",
            self.project_url(suffix=f"members/{self.member_project_membership.pk}/"),
        )
        admin_self_promotion = self.request(
            self.admin_client,
            "POST",
            self.project_url(suffix="members/"),
            {"user_id": str(self.admin.pk), "role": ProjectMember.Role.MANAGER},
        )
        self.assertEqual(promote_self.status_code, 403)
        self.assertEqual(admin_self_promotion.status_code, 400)
        self.assertEqual(manager_changes_role.status_code, 200)
        self.assertEqual(manager_removes_member.status_code, 204)
        self.assertFalse(
            ProjectMember.objects.filter(pk=self.member_project_membership.pk).exists()
        )

    def test_last_project_manager_cannot_be_removed_or_demoted(self):
        self.owner_project_membership.delete()
        remove_last = self.request(
            self.admin_client,
            "DELETE",
            self.project_url(
                suffix=f"members/{self.manager_project_membership.pk}/"
            ),
        )
        self.assertEqual(remove_last.status_code, 409)

    def test_workspace_member_removal_revokes_project_access(self):
        self.owner_project_membership.role = ProjectMember.Role.MEMBER
        self.owner_project_membership.save(update_fields=("role",))
        self.manager_project_membership.delete()
        self.member_project_membership.role = ProjectMember.Role.MANAGER
        self.member_project_membership.save(update_fields=("role",))
        response = self.request(
            self.owner_client,
            "DELETE",
            f"/api/workspaces/{self.workspace.pk}/members/{self.member_workspace_membership.pk}/",
        )

        self.assertEqual(response.status_code, 409)
        self.assertTrue(
            WorkspaceMember.objects.filter(pk=self.member_workspace_membership.pk).exists()
        )

        self.owner_project_membership.role = ProjectMember.Role.MANAGER
        self.owner_project_membership.save(update_fields=("role",))
        response = self.request(
            self.owner_client,
            "DELETE",
            f"/api/workspaces/{self.workspace.pk}/members/{self.member_workspace_membership.pk}/",
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            ProjectMember.objects.filter(
                project=self.project,
                user=self.member,
            ).exists()
        )
        self.assertEqual(
            self.request(
                self.member_client,
                "GET",
                self.project_url(),
            ).status_code,
            404,
        )

    def test_project_member_list_requires_project_access(self):
        response = self.request(
            self.outsider_client,
            "GET",
            self.project_url(suffix="members/"),
        )
        manager_response = self.request(
            self.manager_client,
            "GET",
            self.project_url(suffix="members/"),
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(manager_response.status_code, 200)
        self.assertEqual(manager_response.json()["count"], 4)
        self.assertIn("avatar_url", manager_response.json()["results"][0])

    def test_project_manager_can_manage_roles_but_workspace_viewer_cannot(self):
        add_manager = self.request(
            self.manager_client,
            "POST",
            self.project_url(suffix="members/"),
            {"user_id": str(self.admin.pk), "role": ProjectMember.Role.MANAGER},
        )
        viewer_manage = self.request(
            self.viewer_client,
            "POST",
            self.project_url(suffix="members/"),
            {"user_id": str(self.admin.pk), "role": ProjectMember.Role.MEMBER},
        )
        self.assertEqual(add_manager.status_code, 201)
        self.assertEqual(viewer_manage.status_code, 403)

    @patch("apps.projects.services.ProjectMember.objects.create")
    def test_project_and_initial_manager_creation_roll_back_together(self, create_member):
        create_member.side_effect = IntegrityError("constraint failure")
        before = Project.objects.count()
        with self.assertRaises(IntegrityError):
            create_project(
                workspace=self.workspace,
                creator=self.admin,
                values={"name": "Must roll back"},
            )
        self.assertEqual(Project.objects.count(), before)
