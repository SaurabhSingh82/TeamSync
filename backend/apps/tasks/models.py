import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Task(models.Model):
    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    class Status(models.TextChoices):
        TODO = "todo", "To Do"
        IN_PROGRESS = "in_progress", "In Progress"
        REVIEW = "review", "Review"
        COMPLETED = "completed", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.PROTECT,
        related_name="tasks",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_tasks",
    )
    assignees = models.ManyToManyField(
        "projects.ProjectMember",
        through="TaskAssignee",
        related_name="assigned_tasks",
        blank=True,
    )
    collaborators = models.ManyToManyField(
        "projects.ProjectMember",
        through="TaskCollaborator",
        related_name="collaborating_tasks",
        blank=True,
    )
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.TODO,
    )
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    labels = models.ManyToManyField(
        "Label",
        through="TaskLabel",
        related_name="tasks",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(title=""),
                name="task_title_not_empty",
            ),
            models.CheckConstraint(
                condition=Q(start_date__isnull=True)
                | Q(due_date__isnull=True)
                | Q(due_date__gte=F("start_date")),
                name="task_due_date_after_start",
            ),
            models.CheckConstraint(
                condition=Q(priority__in=("low", "medium", "high", "urgent")),
                name="valid_task_priority",
            ),
            models.CheckConstraint(
                condition=Q(status__in=("todo", "in_progress", "review", "completed")),
                name="valid_task_status",
            ),
        ]
        indexes = [
            models.Index(
                fields=("project", "archived_at", "status", "updated_at"),
                name="task_project_list_idx",
            ),
            models.Index(
                fields=("project", "priority", "updated_at"),
                name="task_project_priority_idx",
            ),
            models.Index(fields=("project", "due_date"), name="task_project_due_idx"),
        ]

    def __str__(self):
        return self.title


class TaskAssignee(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="assignee_links")
    project_member = models.ForeignKey(
        "projects.ProjectMember",
        on_delete=models.CASCADE,
        related_name="task_assignee_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("task", "project_member"),
                name="uniq_task_assignee",
            ),
        ]
        indexes = [
            models.Index(
                fields=("project_member", "task"),
                name="task_assignee_member_idx",
            ),
        ]


class TaskCollaborator(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="collaborator_links")
    project_member = models.ForeignKey(
        "projects.ProjectMember",
        on_delete=models.CASCADE,
        related_name="task_collaborator_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("task", "project_member"),
                name="uniq_task_collaborator",
            ),
        ]
        indexes = [
            models.Index(
                fields=("project_member", "task"),
                name="task_collab_member_idx",
            ),
        ]


class Subtask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="subtasks")
    title = models.CharField(max_length=255)
    is_completed = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_subtasks",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(title=""),
                name="subtask_title_not_empty",
            ),
        ]
        indexes = [
            models.Index(fields=("task", "is_completed"), name="subtask_progress_idx"),
        ]


class TaskComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="task_comments",
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(body=""),
                name="task_comment_not_empty",
            ),
        ]
        indexes = [
            models.Index(fields=("task", "created_at"), name="task_comment_order_idx"),
        ]


class Label(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="task_labels",
    )
    name = models.CharField(max_length=40)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_task_labels",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("project", "name"),
                name="uniq_project_task_label",
            ),
            models.CheckConstraint(
                condition=~Q(name=""),
                name="task_label_name_not_empty",
            ),
        ]
        indexes = [
            models.Index(fields=("project", "name"), name="task_label_project_idx"),
        ]


class TaskLabel(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="label_links")
    label = models.ForeignKey(Label, on_delete=models.CASCADE, related_name="task_links")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("task", "label"), name="uniq_task_label"),
        ]
        indexes = [
            models.Index(fields=("label", "task"), name="task_label_lookup_idx"),
        ]
