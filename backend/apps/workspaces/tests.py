import json
import re
import smtplib
from contextlib import redirect_stderr, redirect_stdout
from datetime import timedelta
from io import StringIO
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.core import mail
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User
from apps.workspaces.models import (
    Workspace,
    WorkspaceInvitation,
    WorkspaceInvitationEmail,
    WorkspaceMember,
)
from apps.workspaces.services import (
    create_workspace,
    dispatch_pending_invitation_emails,
    hash_invitation_token,
)


class NonClosingStringIO(StringIO):
    def close(self):
        self.flush()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class WorkspaceApiTests(TestCase):
    def setUp(self):
        self.owner = self.create_user("owner", "owner@example.com")
        self.admin = self.create_user("admin", "admin@example.com")
        self.member = self.create_user("member", "member@example.com")
        self.viewer = self.create_user("viewer", "viewer@example.com")
        self.outsider = self.create_user("outsider", "outsider@example.com")
        self.workspace = create_workspace(
            owner=self.owner,
            name="Engineering",
            description="Team workspace",
        )
        self.owner_membership = WorkspaceMember.objects.get(
            workspace=self.workspace,
            user=self.owner,
        )
        self.admin_membership = self.add_member(self.admin, WorkspaceMember.Role.ADMIN)
        self.member_membership = self.add_member(self.member, WorkspaceMember.Role.MEMBER)
        self.viewer_membership = self.add_member(self.viewer, WorkspaceMember.Role.VIEWER)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_response = csrf_client.get("/api/auth/csrf/")
        self.csrf = csrf_response.json()["csrfToken"]
        csrf_cookie = csrf_client.cookies["csrftoken"].value
        self.owner_client = self.authenticated_client(self.owner, csrf_cookie)
        self.admin_client = self.authenticated_client(self.admin, csrf_cookie)
        self.member_client = self.authenticated_client(self.member, csrf_cookie)
        self.viewer_client = self.authenticated_client(self.viewer, csrf_cookie)
        self.outsider_client = self.authenticated_client(self.outsider, csrf_cookie)
        self.owner_csrf = self.admin_csrf = self.member_csrf = self.viewer_csrf = self.csrf
        self.outsider_csrf = self.csrf

    @staticmethod
    def create_user(username, email):
        return User.objects.create_user(
            username=username,
            email=email,
            password=None,
        )

    def add_member(self, user, role):
        return WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=user,
            role=role,
        )

    def authenticated_client(self, user, csrf_cookie):
        client = Client(enforce_csrf_checks=True)
        client.cookies["csrftoken"] = csrf_cookie
        client.cookies["teamsync_access"] = str(RefreshToken.for_user(user).access_token)
        return client

    @staticmethod
    def json_request(client, csrf, method, path, data=None):
        body = json.dumps(data) if data is not None else ""
        return client.generic(
            method,
            path,
            body,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        )

    def workspace_url(self, suffix=""):
        return f"/api/workspaces/{self.workspace.pk}/{suffix}"

    def test_create_and_list_workspaces_include_current_role(self):
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            "/api/workspaces/",
            {"name": "  Product  ", "description": "Planning"},
        )

        self.assertEqual(response.status_code, 201, response.content)
        created = Workspace.objects.get(pk=response.json()["id"])
        self.assertEqual(created.name, "Product")
        self.assertEqual(created.owner_id, self.owner.pk)
        self.assertTrue(
            WorkspaceMember.objects.filter(
                workspace=created,
                user=self.owner,
                role=WorkspaceMember.Role.OWNER,
            ).exists()
        )

        listed = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "GET",
            "/api/workspaces/",
        )
        self.assertEqual(listed.status_code, 200)
        items = listed.json()["results"]
        self.assertEqual(len(items), 2)
        self.assertEqual(
            {item["current_user_role"] for item in items},
            {WorkspaceMember.Role.OWNER},
        )

    def test_workspace_access_is_scoped_to_membership(self):
        response = self.json_request(
            self.outsider_client,
            self.outsider_csrf,
            "GET",
            self.workspace_url(),
        )
        self.assertEqual(response.status_code, 404)

        listed = self.json_request(
            self.outsider_client,
            self.outsider_csrf,
            "GET",
            "/api/workspaces/",
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["count"], 0)

    def test_workspace_member_cannot_access_another_workspace(self):
        other_workspace = create_workspace(
            owner=self.outsider,
            name="Private",
            description="Separate workspace",
        )
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "GET",
            f"/api/workspaces/{other_workspace.pk}/",
        )
        listed = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "GET",
            "/api/workspaces/",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            [item["id"] for item in listed.json()["results"]],
            [str(self.workspace.pk)],
        )

    def test_all_roles_can_read_workspace_and_members(self):
        for client, csrf in (
            (self.owner_client, self.owner_csrf),
            (self.admin_client, self.admin_csrf),
            (self.member_client, self.member_csrf),
            (self.viewer_client, self.viewer_csrf),
        ):
            with self.subTest(client=client):
                detail = self.json_request(client, csrf, "GET", self.workspace_url())
                members = self.json_request(
                    client,
                    csrf,
                    "GET",
                    self.workspace_url("members/"),
                )
                self.assertEqual(detail.status_code, 200)
                self.assertEqual(members.status_code, 200)
                self.assertGreaterEqual(members.json()["count"], 4)
                self.assertIn("avatar_url", members.json()["results"][0])

    def test_only_owner_and_admin_can_update_workspace(self):
        for client, csrf in (
            (self.owner_client, self.owner_csrf),
            (self.admin_client, self.admin_csrf),
        ):
            response = self.json_request(
                client,
                csrf,
                "PATCH",
                self.workspace_url(),
                {"name": "Updated"},
            )
            self.assertEqual(response.status_code, 200)

        for client, csrf in (
            (self.member_client, self.member_csrf),
            (self.viewer_client, self.viewer_csrf),
        ):
            response = self.json_request(
                client,
                csrf,
                "PATCH",
                self.workspace_url(),
                {"name": "Not allowed"},
            )
            self.assertEqual(response.status_code, 403)

    def test_only_owner_can_delete_workspace(self):
        response = self.json_request(
            self.admin_client,
            self.admin_csrf,
            "DELETE",
            self.workspace_url(),
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Workspace.objects.filter(pk=self.workspace.pk).exists())

        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "DELETE",
            self.workspace_url(),
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Workspace.objects.filter(pk=self.workspace.pk).exists())
        self.assertFalse(WorkspaceMember.objects.filter(workspace=self.workspace).exists())

    def test_admin_can_manage_members_and_viewers_but_not_admins_or_owner(self):
        response = self.json_request(
            self.admin_client,
            self.admin_csrf,
            "PATCH",
            self.workspace_url(f"members/{self.member_membership.pk}/"),
            {"role": WorkspaceMember.Role.VIEWER},
        )
        self.assertEqual(response.status_code, 200)
        self.member_membership.refresh_from_db()
        self.assertEqual(self.member_membership.role, WorkspaceMember.Role.VIEWER)

        for membership in (self.admin_membership, self.owner_membership):
            denied = self.json_request(
                self.admin_client,
                self.admin_csrf,
                "DELETE",
                self.workspace_url(f"members/{membership.pk}/"),
            )
            self.assertEqual(denied.status_code, 403)

        owner_target = WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.create_user("other", "other@example.com"),
            role=WorkspaceMember.Role.MEMBER,
        )
        denied = self.json_request(
            self.admin_client,
            self.admin_csrf,
            "PATCH",
            self.workspace_url(f"members/{owner_target.pk}/"),
            {"role": WorkspaceMember.Role.ADMIN},
        )
        self.assertEqual(denied.status_code, 403)

    def test_owner_can_assign_admin_and_remove_non_owner(self):
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "PATCH",
            self.workspace_url(f"members/{self.member_membership.pk}/"),
            {"role": WorkspaceMember.Role.ADMIN},
        )
        self.assertEqual(response.status_code, 200)
        self.member_membership.refresh_from_db()
        self.assertEqual(self.member_membership.role, WorkspaceMember.Role.ADMIN)

        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "DELETE",
            self.workspace_url(f"members/{self.member_membership.pk}/"),
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            WorkspaceMember.objects.filter(pk=self.member_membership.pk).exists()
        )
        access = self.json_request(
            self.member_client,
            self.member_csrf,
            "GET",
            self.workspace_url(),
        )
        self.assertEqual(access.status_code, 404)

    def test_member_and_viewer_cannot_manage_members(self):
        for client, csrf in (
            (self.member_client, self.member_csrf),
            (self.viewer_client, self.viewer_csrf),
        ):
            response = self.json_request(
                client,
                csrf,
                "PATCH",
                self.workspace_url(f"members/{self.member_membership.pk}/"),
                {"role": WorkspaceMember.Role.VIEWER},
            )
            self.assertEqual(response.status_code, 403)

    def test_ownership_transfer_is_atomic_and_promotes_former_owner_to_admin(self):
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url("ownership/transfer/"),
            {"member_id": str(self.member_membership.pk)},
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.workspace.refresh_from_db()
        self.owner_membership.refresh_from_db()
        self.member_membership.refresh_from_db()
        self.assertEqual(self.workspace.owner_id, self.member.pk)
        self.assertEqual(self.owner_membership.role, WorkspaceMember.Role.ADMIN)
        self.assertEqual(self.member_membership.role, WorkspaceMember.Role.OWNER)
        self.assertEqual(
            WorkspaceMember.objects.filter(
                workspace=self.workspace,
                role=WorkspaceMember.Role.OWNER,
            ).count(),
            1,
        )

    def test_admin_cannot_transfer_ownership_or_delete_workspace(self):
        transfer = self.json_request(
            self.admin_client,
            self.admin_csrf,
            "POST",
            self.workspace_url("ownership/transfer/"),
            {"member_id": str(self.member_membership.pk)},
        )
        delete = self.json_request(
            self.admin_client,
            self.admin_csrf,
            "DELETE",
            self.workspace_url(),
        )
        self.assertEqual(transfer.status_code, 403)
        self.assertEqual(delete.status_code, 403)

    def test_invitation_stores_only_token_hash_and_accepts_matching_email(self):
        invited_email = "new-member@example.com"
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url("invitations/"),
            {"email": invited_email, "role": WorkspaceMember.Role.MEMBER},
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertNotIn("token", response.json())
        self.assertEqual(response.json()["email_delivery"]["status"], "pending")
        self.assertEqual(len(mail.outbox), 0)
        invitation = WorkspaceInvitation.objects.get(pk=response.json()["id"])
        self.assertEqual(invitation.email, invited_email)
        delivery = WorkspaceInvitationEmail.objects.get(invitation=invitation)

        result = dispatch_pending_invitation_emails()
        invitation.refresh_from_db()
        delivery.refresh_from_db()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(result["sent"], 1)
        self.assertEqual(delivery.status, WorkspaceInvitationEmail.Status.SENT)

        raw_token = self.token_from_message(mail.outbox[-1].body)
        self.assertEqual(invitation.token_hash, hash_invitation_token(raw_token))
        self.assertNotEqual(invitation.token_hash, raw_token)

        invited_user = self.create_user("new-member", invited_email)
        invited_client = self.authenticated_client(
            invited_user,
            self.owner_client.cookies["csrftoken"].value,
        )
        accepted = self.json_request(
            invited_client,
            self.csrf,
            "POST",
            "/api/invitations/accept/",
            {"token": raw_token},
        )
        self.assertEqual(accepted.status_code, 201, accepted.content)
        self.assertEqual(accepted.json()["membership"]["role"], WorkspaceMember.Role.MEMBER)
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, WorkspaceInvitation.Status.ACCEPTED)

        repeated = self.json_request(
            invited_client,
            self.csrf,
            "POST",
            "/api/invitations/accept/",
            {"token": raw_token},
        )
        self.assertEqual(repeated.status_code, 400)
        self.assertEqual(
            WorkspaceMember.objects.filter(
                workspace=self.workspace,
                user=invited_user,
            ).count(),
            1,
        )

    @staticmethod
    def token_from_message(message):
        link = re.search(r"https?://\S+", message).group(0)
        fragment = urlparse(link).fragment
        return parse_qs(fragment)["token"][0]

    def issue_invitation(self, email="invited@example.com", role=WorkspaceMember.Role.MEMBER):
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url("invitations/"),
            {"email": email, "role": role},
        )
        self.assertEqual(response.status_code, 201, response.content)
        result = dispatch_pending_invitation_emails()
        self.assertEqual(result["sent"], 1)
        invitation = WorkspaceInvitation.objects.get(pk=response.json()["id"])
        return invitation, self.token_from_message(mail.outbox[-1].body)

    def test_invitation_rejects_mismatched_email_and_invalid_token(self):
        invitation, raw_token = self.issue_invitation()
        wrong_user = self.create_user("wrong-email", "wrong@example.com")
        wrong_client = self.authenticated_client(
            wrong_user,
            self.owner_client.cookies["csrftoken"].value,
        )
        wrong_csrf = self.csrf

        mismatch = self.json_request(
            wrong_client,
            wrong_csrf,
            "POST",
            "/api/invitations/accept/",
            {"token": raw_token},
        )
        invalid = self.json_request(
            wrong_client,
            wrong_csrf,
            "POST",
            "/api/invitations/accept/",
            {"token": "x" * 43},
        )
        self.assertEqual(mismatch.status_code, 403)
        self.assertEqual(invalid.status_code, 400)
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, WorkspaceInvitation.Status.PENDING)

    def test_expired_invitation_cannot_be_accepted(self):
        invitation, raw_token = self.issue_invitation()
        invitation.expires_at = timezone.now() - timedelta(seconds=1)
        invitation.save(update_fields=["expires_at"])
        invited_user = self.create_user("expired", invitation.email)
        client = self.authenticated_client(
            invited_user,
            self.owner_client.cookies["csrftoken"].value,
        )
        csrf = self.csrf

        response = self.json_request(
            client,
            csrf,
            "POST",
            "/api/invitations/accept/",
            {"token": raw_token},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            WorkspaceMember.objects.filter(
                workspace=self.workspace,
                user=invited_user,
            ).exists()
        )

    def test_invitation_can_be_revoked_and_revoked_token_is_rejected(self):
        invitation, raw_token = self.issue_invitation()
        revoked = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url(f"invitations/{invitation.pk}/revoke/"),
        )
        invited_user = self.create_user("revoked", invitation.email)
        client = self.authenticated_client(
            invited_user,
            self.owner_client.cookies["csrftoken"].value,
        )
        csrf = self.csrf
        accepted = self.json_request(
            client,
            csrf,
            "POST",
            "/api/invitations/accept/",
            {"token": raw_token},
        )
        invitation.refresh_from_db()
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(invitation.status, WorkspaceInvitation.Status.REVOKED)
        self.assertEqual(accepted.status_code, 400)

    def test_resend_rotates_token_and_refreshes_expired_invitation(self):
        invitation, old_token = self.issue_invitation()
        old_hash = invitation.token_hash
        invitation.expires_at = timezone.now() - timedelta(seconds=1)
        invitation.status = WorkspaceInvitation.Status.EXPIRED
        invitation.save(update_fields=["expires_at", "status"])
        resent = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url(f"invitations/{invitation.pk}/resend/"),
        )
        self.assertEqual(resent.status_code, 200)
        self.assertEqual(resent.json()["email_delivery"]["status"], "pending")
        dispatch_pending_invitation_emails()
        invitation.refresh_from_db()
        new_token = self.token_from_message(mail.outbox[-1].body)
        self.assertEqual(resent.status_code, 200)
        self.assertEqual(invitation.status, WorkspaceInvitation.Status.PENDING)
        self.assertGreater(invitation.expires_at, timezone.now())
        self.assertNotEqual(invitation.token_hash, old_hash)
        self.assertEqual(invitation.token_hash, hash_invitation_token(new_token))
        self.assertNotEqual(new_token, old_token)

    def test_resending_pending_invitation_invalidates_its_previous_token(self):
        invitation, old_token = self.issue_invitation()
        old_hash = invitation.token_hash
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url(f"invitations/{invitation.pk}/resend/"),
        )
        dispatch_pending_invitation_emails()
        invitation.refresh_from_db()
        new_token = self.token_from_message(mail.outbox[-1].body)
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(invitation.token_hash, old_hash)
        self.assertEqual(invitation.token_hash, hash_invitation_token(new_token))
        self.assertNotEqual(new_token, old_token)

    def test_failed_email_delivery_is_tracked_and_can_be_retried(self):
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url("invitations/"),
            {"email": "retry@example.com", "role": WorkspaceMember.Role.MEMBER},
        )
        self.assertEqual(response.status_code, 201)
        invitation = WorkspaceInvitation.objects.get(pk=response.json()["id"])
        delivery = WorkspaceInvitationEmail.objects.get(invitation=invitation)

        with patch(
            "apps.workspaces.services.send_mail",
            side_effect=smtplib.SMTPException("mail server unavailable"),
        ):
            result = dispatch_pending_invitation_emails()

        invitation.refresh_from_db()
        delivery.refresh_from_db()
        self.assertEqual(result["failed"], 1)
        self.assertEqual(invitation.status, WorkspaceInvitation.Status.PENDING)
        self.assertEqual(delivery.status, WorkspaceInvitationEmail.Status.FAILED)
        self.assertEqual(delivery.attempts, 1)
        self.assertEqual(delivery.last_error, "Invitation email delivery failed.")
        invitations = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "GET",
            self.workspace_url("invitations/"),
        )
        failed_delivery = next(
            item
            for item in invitations.json()["results"]
            if item["id"] == str(invitation.pk)
        )
        self.assertEqual(failed_delivery["status"], "pending")
        self.assertEqual(failed_delivery["email_delivery"]["status"], "failed")

        retried = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url(f"invitations/{invitation.pk}/resend/"),
        )
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(retried.json()["email_delivery"]["status"], "pending")
        result = dispatch_pending_invitation_emails()
        delivery.refresh_from_db()
        self.assertEqual(result["sent"], 1)
        self.assertEqual(delivery.status, WorkspaceInvitationEmail.Status.SENT)
        self.assertEqual(delivery.attempts, 2)

    def test_outbox_management_command_reports_counts_without_logging_tokens(self):
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url("invitations/"),
            {"email": "command@example.com", "role": WorkspaceMember.Role.MEMBER},
        )
        self.assertEqual(response.status_code, 201)
        output = StringIO()

        call_command("send_workspace_invitation_emails", stdout=output)

        raw_token = self.token_from_message(mail.outbox[-1].body)
        self.assertIn("1 sent, 0 failed", output.getvalue())
        self.assertNotIn(raw_token, output.getvalue())

    def test_console_email_is_delivered_only_to_the_interactive_console(self):
        console_stream = NonClosingStringIO()
        captured_stdout = StringIO()
        captured_stderr = StringIO()
        invitation_response = None

        with override_settings(
            EMAIL_BACKEND="apps.core.email_backends.InteractiveConsoleEmailBackend"
        ):
            with patch(
                "apps.core.email_backends.open_interactive_console",
                return_value=console_stream,
            ):
                with redirect_stdout(captured_stdout), redirect_stderr(
                    captured_stderr
                ), self.assertNoLogs(level="DEBUG"):
                    invitation_response = self.json_request(
                        self.owner_client,
                        self.owner_csrf,
                        "POST",
                        self.workspace_url("invitations/"),
                        {
                            "email": "console@example.com",
                            "role": WorkspaceMember.Role.MEMBER,
                        },
                    )
                    self.assertEqual(invitation_response.status_code, 201)
                    result = dispatch_pending_invitation_emails()

        self.assertEqual(result["sent"], 1)
        raw_token = self.token_from_message(console_stream.getvalue())
        invitation = WorkspaceInvitation.objects.get(
            pk=invitation_response.json()["id"]
        )
        self.assertEqual(invitation.token_hash, hash_invitation_token(raw_token))
        self.assertIn(
            f"#token={raw_token}",
            console_stream.getvalue(),
        )
        self.assertNotIn(raw_token, captured_stdout.getvalue())
        self.assertNotIn(raw_token, captured_stderr.getvalue())

    def test_backend_exception_token_is_not_logged_or_persisted(self):
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url("invitations/"),
            {"email": "error@example.com", "role": WorkspaceMember.Role.MEMBER},
        )
        self.assertEqual(response.status_code, 201)
        invitation = WorkspaceInvitation.objects.get(pk=response.json()["id"])
        delivery = WorkspaceInvitationEmail.objects.get(invitation=invitation)
        captured_stdout = StringIO()
        captured_stderr = StringIO()
        raw_tokens = []

        def fail_with_token_in_exception(*args, **kwargs):
            token = self.token_from_message(kwargs["message"])
            raw_tokens.append(token)
            raise RuntimeError(f"diagnostic contained {token}")

        with patch(
            "apps.workspaces.services.send_mail",
            side_effect=fail_with_token_in_exception,
        ):
            with redirect_stdout(captured_stdout), redirect_stderr(
                captured_stderr
            ), self.assertNoLogs(level="DEBUG"):
                result = dispatch_pending_invitation_emails()

        token = raw_tokens[0]
        invitation.refresh_from_db()
        delivery.refresh_from_db()
        persisted_text = repr(
            {
                "token_hash": invitation.token_hash,
                "delivery_status": delivery.status,
                "attempts": delivery.attempts,
                "last_error": delivery.last_error,
                "claim_id": delivery.claim_id,
                "claimed_at": delivery.claimed_at,
            }
        )
        self.assertEqual(result["failed"], 1)
        self.assertEqual(delivery.last_error, "Invitation email delivery failed.")
        self.assertEqual(invitation.token_hash, hash_invitation_token(token))
        self.assertNotIn(token, captured_stdout.getvalue())
        self.assertNotIn(token, captured_stderr.getvalue())
        self.assertNotIn(token, persisted_text)

    def test_database_constraints_prevent_duplicate_members_and_owner_roles(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                WorkspaceMember.objects.create(
                    workspace=self.workspace,
                    user=self.member,
                    role=WorkspaceMember.Role.MEMBER,
                )

        another_user = self.create_user("second-owner", "second-owner@example.com")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                WorkspaceMember.objects.create(
                    workspace=self.workspace,
                    user=another_user,
                    role=WorkspaceMember.Role.OWNER,
                )

    def test_duplicate_invitation_and_self_invitation_are_rejected(self):
        self.issue_invitation("duplicate@example.com")
        duplicate = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url("invitations/"),
            {"email": "DUPLICATE@example.com", "role": WorkspaceMember.Role.MEMBER},
        )
        self_invite = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            self.workspace_url("invitations/"),
            {"email": self.owner.email.upper(), "role": WorkspaceMember.Role.VIEWER},
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(self_invite.status_code, 400)

    def test_admin_cannot_invite_or_manage_admin_invitations(self):
        denied_invite = self.json_request(
            self.admin_client,
            self.admin_csrf,
            "POST",
            self.workspace_url("invitations/"),
            {"email": "another-admin@example.com", "role": WorkspaceMember.Role.ADMIN},
        )
        self.assertEqual(denied_invite.status_code, 403)

        invitation, _token = self.issue_invitation(
            "admin-role@example.com",
            WorkspaceMember.Role.ADMIN,
        )
        denied_list = self.json_request(
            self.admin_client,
            self.admin_csrf,
            "POST",
            self.workspace_url(f"invitations/{invitation.pk}/revoke/"),
        )
        self.assertEqual(denied_list.status_code, 403)

    def test_member_list_and_invitations_are_paginated_and_role_scoped(self):
        invitations = self.json_request(
            self.member_client,
            self.member_csrf,
            "GET",
            self.workspace_url("invitations/"),
        )
        self.assertEqual(invitations.status_code, 403)

        invitation_list = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "GET",
            self.workspace_url("invitations/?page_size=5"),
        )
        self.assertEqual(invitation_list.status_code, 200)
        self.assertIn("results", invitation_list.json())

    def test_invalid_workspace_payload_is_rejected(self):
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            "/api/workspaces/",
            {"name": "  ", "description": ""},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.json())

    def test_workspace_description_is_optional(self):
        response = self.json_request(
            self.owner_client,
            self.owner_csrf,
            "POST",
            "/api/workspaces/",
            {"name": "No description"},
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["description"], "")
