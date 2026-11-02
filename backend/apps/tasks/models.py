import uuid
from pathlib import Path

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.tasks.attachment_storage import private_attachment_storage


def task_attachment_upload_path(instance, filename):
    extension = Path(instance.original_filename).suffix.lower()
    return (
        f"task-attachments/{instance.task.project_id}/"
        f"{instance.task_id}/{instance.pk}{extension}"
    )


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
    board_column = models.ForeignKey(
        "BoardColumn",
        on_delete=models.PROTECT,
        related_name="tasks",
    )
    position = models.PositiveBigIntegerField(default=0)
    version = models.PositiveIntegerField(default=1)
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
    completed_at = models.DateTimeField(null=True, blank=True)

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
                fields=("board_column", "position", "id"),
                name="task_column_order_idx",
            ),
            models.Index(
                fields=("project", "priority", "updated_at"),
                name="task_project_priority_idx",
            ),
            models.Index(fields=("project", "due_date"), name="task_project_due_idx"),
        ]

    def __str__(self):
        return self.title


class ProjectBoard(models.Model):
    project = models.OneToOneField(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="board",
    )
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Board for {self.project}"


class BoardColumn(models.Model):
    class Status(models.TextChoices):
        TODO = Task.Status.TODO, "To Do"
        IN_PROGRESS = Task.Status.IN_PROGRESS, "In Progress"
        REVIEW = Task.Status.REVIEW, "Review"
        COMPLETED = Task.Status.COMPLETED, "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(
        ProjectBoard,
        on_delete=models.CASCADE,
        related_name="columns",
    )
    name = models.CharField(max_length=80)
    status = models.CharField(max_length=12, choices=Status.choices)
    position = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("board", "name"),
                name="uniq_board_column_name",
            ),
            models.UniqueConstraint(
                fields=("board", "status"),
                condition=Q(is_default=True),
                name="uniq_board_default_status",
            ),
            models.CheckConstraint(
                condition=~Q(name=""),
                name="board_column_name_not_empty",
            ),
            models.CheckConstraint(
                condition=Q(status__in=("todo", "in_progress", "review", "completed")),
                name="valid_board_column_status",
            ),
        ]
        indexes = [
            models.Index(
                fields=("board", "archived_at", "position"),
                name="board_column_order_idx",
            ),
        ]

    def __str__(self):
        return self.name


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
    parent_comment = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replies",
    )
    mentioned_members = models.ManyToManyField(
        "projects.ProjectMember",
        through="TaskCommentMention",
        related_name="task_comments_mentioned_in",
        blank=True,
    )
    edited_at = models.DateTimeField(null=True, blank=True)
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
            models.Index(
                fields=("parent_comment", "created_at"),
                name="task_comment_reply_order_idx",
            ),
        ]


class TaskCommentMention(models.Model):
    comment = models.ForeignKey(
        TaskComment,
        on_delete=models.CASCADE,
        related_name="mention_links",
    )
    project_member = models.ForeignKey(
        "projects.ProjectMember",
        on_delete=models.CASCADE,
        related_name="task_comment_mentions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("comment", "project_member"),
                name="uniq_task_comment_mention",
            ),
        ]
        indexes = [
            models.Index(
                fields=("project_member", "comment"),
                name="comment_mention_member_idx",
            ),
        ]


class TaskAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    comment = models.ForeignKey(
        TaskComment,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="task_attachments",
    )
    file = models.FileField(
        storage=private_attachment_storage,
        upload_to=task_attachment_upload_path,
        max_length=500,
    )
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=127)
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(original_filename=""),
                name="task_attachment_filename_not_empty",
            ),
            models.CheckConstraint(
                condition=Q(size__gt=0),
                name="task_attachment_size_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=("task", "created_at"),
                name="task_attachment_order_idx",
            ),
            models.Index(
                fields=("comment", "created_at"),
                name="comment_attachment_order_idx",
            ),
        ]


class TaskActivity(models.Model):
    class Action(models.TextChoices):
        CREATED = "created", "Created"
        UPDATED = "updated", "Updated"
        MOVED = "moved", "Moved"
        COMMENTED = "commented", "Commented"
        REPLIED = "replied", "Replied"
        COMMENT_UPDATED = "comment_updated", "Comment updated"
        COMMENT_DELETED = "comment_deleted", "Comment deleted"
        MENTIONED = "mentioned", "Mentioned"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="activity")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="task_activity",
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=("task", "created_at"), name="task_activity_order_idx"),
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
