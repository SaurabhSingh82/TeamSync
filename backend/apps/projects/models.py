import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Project(models.Model):
    class Status(models.TextChoices):
        PLANNING = "planning", "Planning"
        ACTIVE = "active", "Active"
        ON_HOLD = "on_hold", "On Hold"
        COMPLETED = "completed", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="projects",
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PLANNING,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_projects",
    )
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(name=""),
                name="project_name_not_empty",
            ),
            models.CheckConstraint(
                condition=Q(start_date__isnull=True)
                | Q(due_date__isnull=True)
                | Q(due_date__gte=F("start_date")),
                name="project_due_date_after_start",
            ),
            models.CheckConstraint(
                condition=Q(status__in=("planning", "active", "on_hold", "completed")),
                name="valid_project_status",
            ),
        ]
        indexes = [
            models.Index(
                fields=("workspace", "archived_at", "status", "updated_at"),
                name="project_list_idx",
            ),
            models.Index(
                fields=("workspace", "due_date"),
                name="project_due_idx",
            ),
        ]

    def __str__(self):
        return self.name


class ProjectMember(models.Model):
    class Role(models.TextChoices):
        MANAGER = "manager", "Project Manager"
        MEMBER = "member", "Project Member"
        VIEWER = "viewer", "Project Viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="members",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_memberships",
    )
    role = models.CharField(max_length=10, choices=Role.choices)
    joined_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("project", "user"),
                name="uniq_project_member_user",
            ),
            models.CheckConstraint(
                condition=Q(role__in=("manager", "member", "viewer")),
                name="valid_project_member_role",
            ),
        ]
        indexes = [
            models.Index(fields=("project", "role"), name="proj_member_role_idx"),
            models.Index(fields=("user", "project"), name="user_project_idx"),
        ]

    def __str__(self):
        return f"{self.user_id} in {self.project_id} ({self.role})"
