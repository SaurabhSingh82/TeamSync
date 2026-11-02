import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Kind(models.TextChoices):
        TASK_ASSIGNED = "task_assigned", "Task assigned"
        TASK_UNASSIGNED = "task_unassigned", "Task unassigned"
        TASK_COMMENT = "task_comment", "Task comment"
        TASK_MENTION = "task_mention", "Task mention"
        WORKSPACE_INVITATION = "workspace_invitation", "Workspace invitation"
        INVITATION_ACCEPTED = "invitation_accepted", "Invitation accepted"
        DEADLINE_TODAY = "deadline_today", "Deadline today"
        DEADLINE_OVERDUE = "deadline_overdue", "Deadline overdue"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_notifications",
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    title = models.CharField(max_length=180)
    message = models.CharField(max_length=255, blank=True)
    target_url = models.CharField(max_length=500, blank=True)
    metadata = models.JSONField(default=dict)
    event_key = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(
                fields=("recipient", "read_at", "-created_at"),
                name="notif_recipient_read_idx",
            ),
            models.Index(
                fields=("workspace", "-created_at"),
                name="notif_workspace_order_idx",
            ),
        ]


class ActivityEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="activity_events",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="activity_events",
    )
    task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="activity_events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activity_events",
    )
    event_type = models.CharField(max_length=48)
    object_type = models.CharField(max_length=48)
    object_id = models.CharField(max_length=64)
    metadata = models.JSONField(default=dict)
    event_key = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(
                fields=("workspace", "-created_at"),
                name="activity_workspace_order_idx",
            ),
            models.Index(
                fields=("project", "-created_at"),
                name="activity_project_order_idx",
            ),
        ]
