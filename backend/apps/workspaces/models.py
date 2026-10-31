import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Workspace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_workspaces",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class WorkspaceMember(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"
        VIEWER = "viewer", "Viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="members",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_memberships",
    )
    role = models.CharField(max_length=10, choices=Role.choices)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("workspace", "user"),
                name="uniq_workspace_member_user",
            ),
            models.UniqueConstraint(
                fields=("workspace",),
                condition=Q(role="owner"),
                name="uniq_workspace_owner_role",
            ),
            models.CheckConstraint(
                condition=Q(role__in=("owner", "admin", "member", "viewer")),
                name="valid_workspace_member_role",
            ),
        ]
        indexes = [
            models.Index(fields=("workspace", "role"), name="ws_member_role_idx"),
            models.Index(fields=("user", "role"), name="user_ws_role_idx"),
        ]

    def __str__(self):
        return f"{self.user_id} in {self.workspace_id} ({self.role})"


class WorkspaceInvitation(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"

    INVITABLE_ROLES = (
        (WorkspaceMember.Role.ADMIN, "Admin"),
        (WorkspaceMember.Role.MEMBER, "Member"),
        (WorkspaceMember.Role.VIEWER, "Viewer"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_workspace_invitations",
    )
    email = models.EmailField()
    role = models.CharField(max_length=10, choices=INVITABLE_ROLES)
    token_hash = models.CharField(max_length=64, unique=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("workspace", "email"),
                condition=Q(status="pending"),
                name="uniq_pending_workspace_invite",
            ),
            models.CheckConstraint(
                condition=Q(role__in=("admin", "member", "viewer")),
                name="valid_workspace_invite_role",
            ),
            models.CheckConstraint(
                condition=Q(status__in=("pending", "accepted", "revoked", "expired")),
                name="valid_workspace_invite_status",
            ),
        ]
        indexes = [
            models.Index(
                fields=("workspace", "status", "created_at"),
                name="ws_invite_status_idx",
            ),
            models.Index(fields=("email", "status"), name="email_invite_status_idx"),
        ]

    def __str__(self):
        return f"Invitation to {self.workspace_id} for {self.email}"


class WorkspaceInvitationEmail(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    invitation = models.OneToOneField(
        WorkspaceInvitation,
        on_delete=models.CASCADE,
        related_name="email_delivery",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.CharField(max_length=255, blank=True)
    claim_id = models.UUIDField(null=True, blank=True)
    claimed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(
                fields=("status", "created_at"),
                name="invite_email_status_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=("pending", "sending", "sent", "failed")),
                name="valid_invite_email_status",
            ),
        ]
