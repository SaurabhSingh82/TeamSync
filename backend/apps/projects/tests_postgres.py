from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless

from django.db import (
    IntegrityError,
    close_old_connections,
    connection,
    connections,
    transaction,
)
from django.test import TransactionTestCase
from rest_framework.exceptions import APIException

from apps.projects.models import Project, ProjectMember
from apps.projects.permissions import get_project_access
from apps.projects.services import (
    add_project_member,
    create_project,
    remove_project_member,
)
from apps.users.models import User
from apps.workspaces.models import WorkspaceMember
from apps.workspaces.services import create_workspace


@skipUnless(
    connection.vendor == "postgresql",
    "PostgreSQL project concurrency tests require PostgreSQL.",
)
class ProjectPostgreSQLConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = self.create_user("owner", "owner@example.com")
        self.member = self.create_user("member", "member@example.com")
        self.first_manager = self.create_user("first-manager", "first@example.com")
        self.second_manager = self.create_user("second-manager", "second@example.com")
        self.workspace = create_workspace(
            owner=self.owner,
            name="Project concurrency",
            description="PostgreSQL project tests",
        )
        for user in (self.member, self.first_manager, self.second_manager):
            WorkspaceMember.objects.create(
                workspace=self.workspace,
                user=user,
                role=WorkspaceMember.Role.MEMBER,
            )
        self.project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={"name": "Concurrency"},
        )

    @staticmethod
    def create_user(username, email):
        return User.objects.create_user(
            username=username,
            email=email,
            password="SecurePass!83520",
        )

    @staticmethod
    def run_concurrently(*operations):
        barrier = Barrier(len(operations))

        def run(operation):
            close_old_connections()
            try:
                barrier.wait(timeout=15)
                return operation()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=len(operations)) as executor:
            futures = [executor.submit(run, operation) for operation in operations]
            return [future.result(timeout=30) for future in futures]

    def test_concurrent_duplicate_project_membership_has_one_winner(self):
        def add_member():
            try:
                with transaction.atomic():
                    access = get_project_access(
                        User.objects.get(pk=self.owner.pk),
                        self.project.pk,
                        lock=True,
                    )
                    member = add_project_member(
                        access=access,
                        actor=User.objects.get(pk=self.owner.pk),
                        user_id=self.member.pk,
                        role=ProjectMember.Role.MEMBER,
                    )
                return ("added", member.pk)
            except APIException as exc:
                return ("rejected", exc.status_code)

        results = self.run_concurrently(add_member, add_member)
        self.assertEqual(sum(result[0] == "added" for result in results), 1)
        self.assertEqual(sum(result[0] == "rejected" for result in results), 1)
        self.assertEqual(
            ProjectMember.objects.filter(
                project=self.project,
                user=self.member,
            ).count(),
            1,
        )

    def test_concurrent_manager_removals_never_leave_zero_managers(self):
        creator_membership = ProjectMember.objects.get(
            project=self.project,
            user=self.owner,
        )
        creator_membership.role = ProjectMember.Role.MEMBER
        creator_membership.save(update_fields=("role",))
        first = ProjectMember.objects.create(
            project=self.project,
            user=self.first_manager,
            role=ProjectMember.Role.MANAGER,
        )
        second = ProjectMember.objects.create(
            project=self.project,
            user=self.second_manager,
            role=ProjectMember.Role.MANAGER,
        )

        def remove(member_id):
            try:
                with transaction.atomic():
                    actor = User.objects.get(pk=self.owner.pk)
                    access = get_project_access(actor, self.project.pk, lock=True)
                    remove_project_member(access=access, member_id=member_id)
                return "removed"
            except APIException as exc:
                return ("rejected", exc.status_code)

        results = self.run_concurrently(
            lambda: remove(first.pk),
            lambda: remove(second.pk),
        )
        self.assertEqual(results.count("removed"), 1)
        self.assertEqual(sum(isinstance(item, tuple) for item in results), 1)
        rejection = next(item for item in results if isinstance(item, tuple))
        self.assertEqual(rejection, ("rejected", 409))
        self.assertEqual(
            ProjectMember.objects.filter(
                project=self.project,
                role=ProjectMember.Role.MANAGER,
            ).count(),
            1,
        )

    def test_postgresql_enforces_project_membership_and_date_constraints(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProjectMember.objects.create(
                    project=self.project,
                    user=self.owner,
                    role=ProjectMember.Role.MEMBER,
                )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Project.objects.filter(pk=self.project.pk).update(
                    start_date="2026-11-20",
                    due_date="2026-11-19",
                )
