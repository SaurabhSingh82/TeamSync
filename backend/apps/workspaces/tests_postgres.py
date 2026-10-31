from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch

from django.db import (
    IntegrityError,
    close_old_connections,
    connection,
    connections,
    transaction,
)
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied

from apps.users.models import User
from apps.workspaces.models import (
    Workspace,
    WorkspaceInvitation,
    WorkspaceInvitationEmail,
    WorkspaceMember,
)
from apps.workspaces.services import (
    accept_invitation,
    create_workspace,
    dispatch_pending_invitation_emails,
    get_workspace_membership,
    hash_invitation_token,
    new_invitation_token,
    require_role,
    transfer_ownership,
)


@skipUnless(
    connection.vendor == "postgresql",
    "PostgreSQL row-lock and constraint-trigger tests require PostgreSQL.",
)
class WorkspacePostgreSQLConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = self.create_user("owner", "owner@example.com")
        self.first_target = self.create_user("first-target", "first@example.com")
        self.second_target = self.create_user("second-target", "second@example.com")
        self.workspace = create_workspace(
            owner=self.owner,
            name="Concurrency",
            description="PostgreSQL test workspace",
        )
        self.first_membership = self.add_member(
            self.first_target,
            WorkspaceMember.Role.MEMBER,
        )
        self.second_membership = self.add_member(
            self.second_target,
            WorkspaceMember.Role.MEMBER,
        )

    @staticmethod
    def create_user(username, email):
        return User.objects.create_user(username=username, email=email, password="unused")

    def add_member(self, user, role):
        return WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=user,
            role=role,
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

    def test_simultaneous_acceptance_of_one_invitation_creates_one_membership(self):
        invitee = self.create_user("invitee", "invitee@example.com")
        token = new_invitation_token()
        invitation = WorkspaceInvitation.objects.create(
            workspace=self.workspace,
            invited_by=self.owner,
            email=invitee.email,
            role=WorkspaceMember.Role.MEMBER,
            token_hash=hash_invitation_token(token),
            expires_at=timezone.now() + timedelta(days=7),
        )

        def accept():
            try:
                membership = accept_invitation(
                    user=User.objects.get(pk=invitee.pk),
                    token=token,
                )
                return ("accepted", membership.pk)
            except APIException as exc:
                return ("rejected", exc.status_code)

        results = self.run_concurrently(accept, accept)
        invitation.refresh_from_db()
        self.assertEqual(sum(result[0] == "accepted" for result in results), 1)
        self.assertEqual(sum(result[0] == "rejected" for result in results), 1)
        self.assertEqual(invitation.status, WorkspaceInvitation.Status.ACCEPTED)
        self.assertEqual(
            WorkspaceMember.objects.filter(
                workspace=self.workspace,
                user=invitee,
            ).count(),
            1,
        )

    def test_simultaneous_ownership_transfers_leave_one_matching_owner(self):
        def transfer(target_id):
            try:
                with transaction.atomic():
                    workspace, actor_membership = get_workspace_membership(
                        User.objects.get(pk=self.owner.pk),
                        self.workspace.pk,
                        lock=True,
                    )
                    require_role(actor_membership, (WorkspaceMember.Role.OWNER,))
                    transfer_ownership(
                        workspace=workspace,
                        current_owner=actor_membership,
                        target_member_id=target_id,
                    )
                return "transferred"
            except PermissionDenied:
                return "no-longer-owner"

        results = self.run_concurrently(
            lambda: transfer(self.first_membership.pk),
            lambda: transfer(self.second_membership.pk),
        )
        self.workspace.refresh_from_db()
        owners = WorkspaceMember.objects.filter(
            workspace=self.workspace,
            role=WorkspaceMember.Role.OWNER,
        )
        self.assertEqual(results.count("transferred"), 1)
        self.assertEqual(results.count("no-longer-owner"), 1)
        self.assertEqual(owners.count(), 1)
        self.assertEqual(owners.get().user_id, self.workspace.owner_id)

    def test_concurrent_member_removal_and_invitation_acceptance_are_serialized(self):
        token = new_invitation_token()
        invitation = WorkspaceInvitation.objects.create(
            workspace=self.workspace,
            invited_by=self.owner,
            email=self.first_target.email,
            role=WorkspaceMember.Role.VIEWER,
            token_hash=hash_invitation_token(token),
            expires_at=timezone.now() + timedelta(days=7),
        )

        def remove_member():
            with transaction.atomic():
                workspace, _owner_membership = get_workspace_membership(
                    User.objects.get(pk=self.owner.pk),
                    self.workspace.pk,
                    lock=True,
                )
                member = WorkspaceMember.objects.select_for_update().get(
                    workspace=workspace,
                    pk=self.first_membership.pk,
                )
                member.delete()
            return "removed"

        def accept():
            try:
                accept_invitation(
                    user=User.objects.get(pk=self.first_target.pk),
                    token=token,
                )
                return "accepted"
            except APIException as exc:
                self.assertEqual(exc.status_code, status.HTTP_409_CONFLICT)
                return "already-member"

        remove_result, accept_result = self.run_concurrently(remove_member, accept)
        invitation.refresh_from_db()
        membership_exists = WorkspaceMember.objects.filter(
            workspace=self.workspace,
            user=self.first_target,
        ).exists()
        self.assertEqual(remove_result, "removed")
        if accept_result == "accepted":
            self.assertEqual(invitation.status, WorkspaceInvitation.Status.ACCEPTED)
            self.assertTrue(membership_exists)
            self.assertEqual(
                WorkspaceMember.objects.get(
                    workspace=self.workspace,
                    user=self.first_target,
                ).role,
                WorkspaceMember.Role.VIEWER,
            )
        else:
            self.assertEqual(accept_result, "already-member")
            self.assertEqual(invitation.status, WorkspaceInvitation.Status.PENDING)
            self.assertFalse(membership_exists)

    def test_database_rejects_workspace_without_an_owner_membership(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                WorkspaceMember.objects.filter(
                    workspace=self.workspace,
                    role=WorkspaceMember.Role.OWNER,
                ).delete()

    def test_database_rejects_owner_fk_that_does_not_match_owner_membership(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Workspace.objects.filter(pk=self.workspace.pk).update(
                    owner_id=self.first_target.pk,
                )

    def test_email_delivery_runs_outside_database_transactions(self):
        WorkspaceInvitation.objects.create(
            workspace=self.workspace,
            invited_by=self.owner,
            email="outside-transaction@example.com",
            role=WorkspaceMember.Role.MEMBER,
            token_hash=hash_invitation_token(new_invitation_token()),
            expires_at=timezone.now() + timedelta(days=7),
        )
        invitation = WorkspaceInvitation.objects.get(
            email="outside-transaction@example.com"
        )
        WorkspaceInvitationEmail.objects.create(invitation=invitation)
        def assert_no_transaction(*args, **kwargs):
            self.assertFalse(connection.in_atomic_block)
            return 1

        with patch(
            "apps.workspaces.services.send_mail",
            side_effect=assert_no_transaction,
        ):
            result = dispatch_pending_invitation_emails()
        self.assertEqual(result["sent"], 1)
