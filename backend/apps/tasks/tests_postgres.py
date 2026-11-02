from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless

from django.db import close_old_connections, connection, connections, transaction
from django.test import TransactionTestCase
from rest_framework.exceptions import APIException

from apps.projects.models import ProjectMember
from apps.projects.permissions import get_project_access
from apps.projects.services import create_project, remove_project_member
from apps.tasks.models import Task, TaskAssignee
from apps.tasks.permissions import get_task_access
from apps.tasks.services import add_task_assignment
from apps.users.models import User
from apps.workspaces.models import WorkspaceMember
from apps.workspaces.services import create_workspace


@skipUnless(
    connection.vendor == "postgresql",
    "PostgreSQL task concurrency tests require PostgreSQL.",
)
class TaskPostgreSQLConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = self.create_user("task-owner", "task-owner@example.com")
        self.member = self.create_user("task-member", "task-member@example.com")
        self.workspace = create_workspace(
            owner=self.owner,
            name="Task concurrency",
            description="PostgreSQL task tests",
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.member,
            role=WorkspaceMember.Role.MEMBER,
        )
        self.project = create_project(
            workspace=self.workspace,
            creator=self.owner,
            values={"name": "Concurrency"},
        )
        self.member_project_membership = ProjectMember.objects.create(
            project=self.project,
            user=self.member,
            role=ProjectMember.Role.MEMBER,
        )
        self.task = Task.objects.create(
            project=self.project,
            creator=self.owner,
            title="Concurrent assignment",
        )

    @staticmethod
    def create_user(username, email):
        return User.objects.create_user(username=username, email=email)

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

    def test_simultaneous_assignment_attempts_create_one_link(self):
        def assign():
            try:
                with transaction.atomic():
                    actor = User.objects.get(pk=self.owner.pk)
                    access = get_task_access(actor, self.task.pk, lock=True)
                    add_task_assignment(
                        access=access,
                        actor=actor,
                        user_id=self.member.pk,
                    )
                return "assigned"
            except APIException as exc:
                return ("rejected", exc.status_code)

        results = self.run_concurrently(assign, assign)

        self.assertEqual(results.count("assigned"), 1)
        self.assertEqual(sum(isinstance(result, tuple) for result in results), 1)
        self.assertEqual(
            TaskAssignee.objects.filter(
                task=self.task,
                project_member=self.member_project_membership,
            ).count(),
            1,
        )

    def test_concurrent_assignment_and_member_removal_leave_no_orphan_link(self):
        def assign():
            try:
                with transaction.atomic():
                    actor = User.objects.get(pk=self.owner.pk)
                    access = get_task_access(actor, self.task.pk, lock=True)
                    add_task_assignment(
                        access=access,
                        actor=actor,
                        user_id=self.member.pk,
                    )
                return "assigned"
            except APIException as exc:
                return ("rejected", exc.status_code)

        def remove_member():
            with transaction.atomic():
                actor = User.objects.get(pk=self.owner.pk)
                access = get_project_access(actor, self.project.pk, lock=True)
                remove_project_member(
                    access=access,
                    member_id=self.member_project_membership.pk,
                )
            return "removed"

        assignment_result, removal_result = self.run_concurrently(
            assign,
            remove_member,
        )

        self.assertEqual(removal_result, "removed")
        self.assertIn(assignment_result, ("assigned", ("rejected", 400)))
        self.assertFalse(
            ProjectMember.objects.filter(
                pk=self.member_project_membership.pk,
            ).exists()
        )
        self.assertFalse(
            TaskAssignee.objects.filter(
                task=self.task,
                project_member_id=self.member_project_membership.pk,
            ).exists()
        )
