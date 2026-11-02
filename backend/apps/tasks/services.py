from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.projects.models import Project, ProjectMember
from apps.tasks.models import (
    Label,
    Subtask,
    Task,
    TaskAssignee,
    TaskCollaborator,
    TaskComment,
    TaskLabel,
)
from apps.tasks.permissions import (
    TaskAccess,
    is_task_participant,
    require_task_creator,
    require_task_manager,
    require_task_participant,
)
from apps.workspaces.models import WorkspaceMember
from apps.workspaces.services import Conflict


def _project_members(project, user_ids):
    memberships = list(
        ProjectMember.objects.select_related("user")
        .filter(
            project=project,
            user_id__in=user_ids,
            user__workspace_memberships__workspace=project.workspace,
        )
        .distinct()
    )
    by_user_id = {member.user_id: member for member in memberships}
    missing = set(user_ids) - set(by_user_id)
    if missing:
        raise ValidationError(
            {"members": "Assignees and collaborators must be active project members."}
        )
    return by_user_id


def _validate_dates(start_date, due_date):
    if start_date is not None and due_date is not None and due_date < start_date:
        raise ValidationError(
            {"due_date": "Due date cannot be earlier than the start date."}
        )


def create_task(*, access, creator, values):
    require_task_creator(access)
    project = access.project
    assignee_ids = values.pop("assignee_ids", [])
    collaborator_ids = values.pop("collaborator_ids", [])
    label_ids = values.pop("label_ids", [])
    _validate_dates(values.get("start_date"), values.get("due_date"))

    if not values.get("title", "").strip():
        raise ValidationError({"title": "Task title cannot be blank."})
    values["title"] = values["title"].strip()
    if len(assignee_ids) != len(set(assignee_ids)):
        raise ValidationError({"assignee_ids": "Do not repeat an assignee."})
    if len(collaborator_ids) != len(set(collaborator_ids)):
        raise ValidationError({"collaborator_ids": "Do not repeat a collaborator."})
    if len(label_ids) != len(set(label_ids)):
        raise ValidationError({"label_ids": "Do not repeat a label."})
    if not access.can_manage and (
        set(assignee_ids) - {creator.pk}
        or set(collaborator_ids) - {creator.pk}
    ):
        raise PermissionDenied(
            "Project Members may only assign or add themselves as collaborators."
        )
    with transaction.atomic():
        locked_project = Project.objects.select_for_update().get(pk=project.pk)
        if locked_project.archived_at is not None:
            raise Conflict("Tasks cannot be created in an archived project.")
        member_map = _project_members(
            locked_project,
            set(assignee_ids) | set(collaborator_ids),
        )
        labels = list(Label.objects.filter(project=locked_project, pk__in=label_ids))
        if len(labels) != len(set(label_ids)):
            raise ValidationError({"label_ids": "Labels must belong to this project."})
        task = Task.objects.create(
            project=locked_project,
            creator=creator,
            **values,
        )
        TaskAssignee.objects.bulk_create(
            [
                TaskAssignee(task=task, project_member=member_map[user_id])
                for user_id in assignee_ids
            ]
        )
        TaskCollaborator.objects.bulk_create(
            [
                TaskCollaborator(task=task, project_member=member_map[user_id])
                for user_id in collaborator_ids
            ]
        )
        TaskLabel.objects.bulk_create(
            [TaskLabel(task=task, label=label) for label in labels]
        )
    return task


def update_task(*, access, actor, values):
    require_task_participant(access, actor)
    values = dict(values)
    if "title" in values:
        title = values["title"].strip()
        if not title:
            raise ValidationError({"title": "Task title cannot be blank."})
        values["title"] = title
    start_date = values.get("start_date", access.task.start_date)
    due_date = values.get("due_date", access.task.due_date)
    _validate_dates(start_date, due_date)
    for field, value in values.items():
        setattr(access.task, field, value)
    if values:
        access.task.save(update_fields=(*values.keys(), "updated_at"))
    return access.task


def delete_task(*, access):
    require_task_manager(access)
    access.task.delete()


def set_task_archived(*, access, archived):
    require_task_manager(access)
    access.task.archived_at = timezone.now() if archived else None
    access.task.save(update_fields=("archived_at", "updated_at"))
    return access.task


def duplicate_task(*, access, actor):
    require_task_participant(access, actor)
    original = access.task
    with transaction.atomic():
        duplicate = Task.objects.create(
            project=original.project,
            creator=actor,
            title=f"{original.title} (copy)"[:255],
            description=original.description,
            priority=original.priority,
            status=Task.Status.TODO,
            start_date=original.start_date,
            due_date=original.due_date,
        )
        TaskLabel.objects.bulk_create(
            [
                TaskLabel(task=duplicate, label=label)
                for label in original.labels.all()
            ]
        )
    return duplicate


def add_task_assignment(*, access, actor, user_id, collaborator=False):
    membership = access.project_access.project_membership
    assignment_model = TaskCollaborator if collaborator else TaskAssignee

    if access.can_manage:
        target_membership = (
            ProjectMember.objects.select_for_update().filter(
                project=access.project,
                user_id=user_id,
                user__workspace_memberships__workspace=access.project.workspace,
            )
            .first()
        )
        if target_membership is None:
            raise ValidationError(
                {"user_id": "Assignees and collaborators must be active project members."}
            )
    else:
        require_task_member_assignment(access, actor, user_id)
        target_membership = membership

    try:
        with transaction.atomic():
            return assignment_model.objects.create(
                task=access.task,
                project_member=target_membership,
            )
    except IntegrityError as exc:
        raise Conflict("This project member is already assigned to the task.") from exc


def require_task_member_assignment(access, actor, user_id):
    if access.project_access.workspace_membership.role == WorkspaceMember.Role.VIEWER:
        raise PermissionDenied("Workspace Viewers cannot change task assignments.")
    membership = access.project_access.project_membership
    if membership is None or membership.role != ProjectMember.Role.MEMBER:
        raise PermissionDenied("You do not have permission to change task assignments.")
    if user_id != actor.pk:
        raise PermissionDenied("Project Members may only add themselves to task assignments.")


def remove_task_assignment(*, access, actor, user_id, collaborator=False):
    model = TaskCollaborator if collaborator else TaskAssignee
    if access.can_manage:
        deleted, _details = model.objects.filter(
            task=access.task,
            project_member__user_id=user_id,
        ).delete()
    else:
        require_task_member_assignment(access, actor, user_id)
        deleted, _details = model.objects.filter(
            task=access.task,
            project_member=access.project_access.project_membership,
        ).delete()
    if not deleted:
        raise NotFound("Task assignment not found.")


def list_tasks(queryset, params):
    status_value = params.get("status", "").strip()
    if status_value:
        if status_value not in Task.Status.values:
            raise ValidationError({"status": "Choose a valid task status."})
        queryset = queryset.filter(status=status_value)

    priority_value = params.get("priority", "").strip()
    if priority_value:
        if priority_value not in Task.Priority.values:
            raise ValidationError({"priority": "Choose a valid task priority."})
        queryset = queryset.filter(priority=priority_value)

    assignee_id = params.get("assignee", "").strip()
    if assignee_id:
        try:
            assignee_id = UUID(assignee_id)
        except ValueError as exc:
            raise ValidationError(
                {"assignee": "Enter a valid user UUID."}
            ) from exc
        queryset = queryset.filter(assignees__user_id=assignee_id)

    due_before = params.get("due_before", "").strip()
    due_after = params.get("due_after", "").strip()
    if due_before:
        queryset = queryset.filter(due_date__lte=_parse_filter_date(due_before, "due_before"))
    if due_after:
        queryset = queryset.filter(due_date__gte=_parse_filter_date(due_after, "due_after"))
    if due_before and due_after and due_after > due_before:
        raise ValidationError({"due_after": "Must not be later than due_before."})
    due_date = params.get("due_date", "").strip().lower()
    if due_date == "none":
        queryset = queryset.filter(due_date__isnull=True)
    elif due_date:
        queryset = queryset.filter(due_date=_parse_filter_date(due_date, "due_date"))

    archived = params.get("archived", "false").strip().lower()
    if archived == "true":
        queryset = queryset.filter(archived_at__isnull=False)
    elif archived == "false":
        queryset = queryset.filter(archived_at__isnull=True)
    elif archived != "all":
        raise ValidationError({"archived": "Use true, false, or all."})

    search = params.get("search", "").strip()
    if search:
        queryset = queryset.filter(
            Q(title__icontains=search)
            | Q(description__icontains=search)
            | Q(labels__name__icontains=search)
        )
    return queryset.distinct().order_by("-updated_at", "id")


def _parse_filter_date(value, field):
    from django.utils.dateparse import parse_date

    parsed = parse_date(value)
    if parsed is None:
        raise ValidationError({field: "Enter a valid date in YYYY-MM-DD format."})
    return parsed


def set_subtask_completed(*, access, actor, subtask, completed):
    require_task_participant(access, actor)
    if subtask.task_id != access.task.pk:
        raise NotFound("Subtask not found.")
    subtask.is_completed = completed
    subtask.save(update_fields=("is_completed", "updated_at"))
    return subtask


def create_subtask(*, access, actor, title):
    require_task_participant(access, actor)
    title = title.strip()
    if not title:
        raise ValidationError({"title": "Subtask title cannot be blank."})
    return Subtask.objects.create(
        task=access.task,
        created_by=actor,
        title=title,
    )


def update_subtask(*, access, actor, subtask_id, values):
    require_task_participant(access, actor)
    subtask = Subtask.objects.filter(task=access.task, pk=subtask_id).first()
    if subtask is None:
        raise NotFound("Subtask not found.")
    if "title" in values:
        values["title"] = values["title"].strip()
        if not values["title"]:
            raise ValidationError({"title": "Subtask title cannot be blank."})
    for field, value in values.items():
        setattr(subtask, field, value)
    if values:
        subtask.save(update_fields=(*values.keys(), "updated_at"))
    return subtask


def delete_subtask(*, access, actor, subtask_id):
    require_task_participant(access, actor)
    subtask = Subtask.objects.filter(task=access.task, pk=subtask_id).first()
    if subtask is None:
        raise NotFound("Subtask not found.")
    subtask.delete()


def create_task_comment(*, access, actor, body):
    require_task_participant(access, actor)
    body = body.strip()
    if not body:
        raise ValidationError({"body": "Comment cannot be blank."})
    return TaskComment.objects.create(task=access.task, author=actor, body=body)


def update_task_comment(*, access, actor, comment_id, body):
    require_task_participant(access, actor)
    comment = TaskComment.objects.filter(task=access.task, pk=comment_id).first()
    if comment is None:
        raise NotFound("Task comment not found.")
    if comment.author_id != actor.pk:
        raise PermissionDenied("You can only edit your own comments.")
    body = body.strip()
    if not body:
        raise ValidationError({"body": "Comment cannot be blank."})
    comment.body = body
    comment.save(update_fields=("body", "updated_at"))
    return comment


def delete_task_comment(*, access, actor, comment_id):
    require_task_participant(access, actor)
    comment = TaskComment.objects.filter(task=access.task, pk=comment_id).first()
    if comment is None:
        raise NotFound("Task comment not found.")
    if not access.can_manage and comment.author_id != actor.pk:
        raise PermissionDenied("You can only delete your own comments.")
    comment.delete()


def create_label(*, project, actor, name):
    name = name.strip()
    if not name:
        raise ValidationError({"name": "Label name cannot be blank."})
    try:
        with transaction.atomic():
            return Label.objects.create(project=project, created_by=actor, name=name)
    except IntegrityError as exc:
        raise Conflict("A label with this name already exists in this project.") from exc


def add_task_label(*, access, actor, label_id):
    require_task_participant(access, actor)
    label = Label.objects.filter(project=access.project, pk=label_id).first()
    if label is None:
        raise NotFound("Project label not found.")
    try:
        with transaction.atomic():
            return TaskLabel.objects.create(task=access.task, label=label)
    except IntegrityError as exc:
        raise Conflict("This label is already attached to the task.") from exc


def remove_task_label(*, access, actor, label_id):
    require_task_participant(access, actor)
    deleted, _details = TaskLabel.objects.filter(
        task=access.task,
        label_id=label_id,
        label__project=access.project,
    ).delete()
    if not deleted:
        raise NotFound("Task label not found.")
