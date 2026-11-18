from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.projects.models import Project, ProjectMember
from apps.tasks.models import (
    BoardColumn,
    Label,
    ProjectBoard,
    Subtask,
    Task,
    TaskAssignee,
    TaskCollaborator,
    TaskComment,
    TaskCommentMention,
    TaskActivity,
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


def _schedule_task_event(*, project_id, task_id, event_type, payload=None):
    from apps.realtime.events import schedule_project_event

    schedule_project_event(
        project_id=project_id,
        event_type=event_type,
        payload={
            "project_id": str(project_id),
            "task_id": str(task_id),
            **(payload or {}),
        },
    )


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
    requested_column_id = values.pop("board_column_id", None)
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
        board = ProjectBoard.objects.select_for_update().get(
            project=locked_project,
        )
        requested_status = values.pop("status", Task.Status.TODO)
        if requested_column_id is None:
            column = BoardColumn.objects.get(
                board=board,
                status=requested_status,
                is_default=True,
                archived_at__isnull=True,
            )
        else:
            column = BoardColumn.objects.filter(
                board=board,
                pk=requested_column_id,
                archived_at__isnull=True,
            ).first()
            if column is None:
                raise ValidationError(
                    {"board_column_id": "Choose an active column on this project board."}
                )
            if requested_status != column.status:
                raise ValidationError(
                    {"status": "Task status must match the selected board column."}
                )
        position = Task.objects.filter(board_column=column).count()
        member_map = _project_members(
            locked_project,
            set(assignee_ids) | set(collaborator_ids),
        )
        labels = list(Label.objects.filter(project=locked_project, pk__in=label_ids))
        if len(labels) != len(set(label_ids)):
            raise ValidationError({"label_ids": "Labels must belong to this project."})
        task = Task.objects.create(
            project=locked_project,
            board_column=column,
            position=position,
            status=column.status,
            completed_at=timezone.now()
            if column.status == Task.Status.COMPLETED
            else None,
            creator=creator,
            **values,
        )
        TaskActivity.objects.create(
            task=task,
            actor=creator,
            action=TaskActivity.Action.CREATED,
            metadata={"title": task.title},
        )
        board.version += 1
        board.save(update_fields=("version", "updated_at"))
        assignments = TaskAssignee.objects.bulk_create(
            [
                TaskAssignee(task=task, project_member=member_map[user_id])
                for user_id in assignee_ids
            ]
        )
        from apps.notifications.services import notify_task_assigned

        for user_id, assignment in zip(assignee_ids, assignments):
            member = member_map[user_id]
            TaskActivity.objects.create(
                task=task,
                actor=creator,
                action=TaskActivity.Action.ASSIGNMENT_ADDED,
                metadata={"user_id": str(user_id), "collaborator": False},
            )
            notify_task_assigned(
                task=task,
                actor=creator,
                recipient=member.user,
                assignment_id=assignment.pk,
            )
        collaborator_links = TaskCollaborator.objects.bulk_create(
            [
                TaskCollaborator(task=task, project_member=member_map[user_id])
                for user_id in collaborator_ids
            ]
        )
        for user_id, assignment in zip(collaborator_ids, collaborator_links):
            member = member_map[user_id]
            TaskActivity.objects.create(
                task=task,
                actor=creator,
                action=TaskActivity.Action.ASSIGNMENT_ADDED,
                metadata={"user_id": str(user_id), "collaborator": True},
            )
            notify_task_assigned(
                task=task,
                actor=creator,
                recipient=member.user,
                assignment_id=assignment.pk,
                collaborator=True,
            )
        TaskLabel.objects.bulk_create(
            [TaskLabel(task=task, label=label) for label in labels]
        )
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=task.pk,
        event_type="task.created",
    )
    return task


def update_task(*, access, actor, values, expected_version):
    require_task_participant(access, actor)
    if access.task.version != expected_version:
        raise Conflict("This task changed since it was loaded. Refresh and retry.")
    values = dict(values)
    if "title" in values:
        title = values["title"].strip()
        if not title:
            raise ValidationError({"title": "Task title cannot be blank."})
        values["title"] = title
    start_date = values.get("start_date", access.task.start_date)
    due_date = values.get("due_date", access.task.due_date)
    _validate_dates(start_date, due_date)
    old_column = access.task.board_column
    requested_status = values.pop("status", access.task.status)
    if requested_status != access.task.status:
        column = BoardColumn.objects.get(
            board=access.board,
            status=requested_status,
            is_default=True,
            archived_at__isnull=True,
        )
        access.task.board_column = column
        access.task.position = Task.objects.filter(board_column=column).count()
        access.task.status = column.status
        access.task.completed_at = (
            timezone.now()
            if column.status == Task.Status.COMPLETED
            else None
        )
    changed_fields = dict(values)
    for field, value in values.items():
        setattr(access.task, field, value)
    if values or old_column != access.task.board_column:
        access.task.version += 1
        access.task.save(
            update_fields=(
                *values.keys(),
                "board_column",
                "position",
                "status",
                "completed_at",
                "version",
                "updated_at",
            )
        )
        _reindex_task_column(old_column)
        if requested_status != old_column.status:
            TaskActivity.objects.create(
                task=access.task,
                actor=actor,
                action=TaskActivity.Action.MOVED,
                metadata={
                    "from_column_id": str(old_column.pk),
                    "to_column_id": str(access.task.board_column_id),
                    "from_status": old_column.status,
                    "to_status": access.task.status,
                },
            )
        else:
            TaskActivity.objects.create(
                task=access.task,
                actor=actor,
                action=TaskActivity.Action.UPDATED,
                metadata={"fields": list(changed_fields)},
            )
        access.board.version += 1
        access.board.save(update_fields=("version", "updated_at"))
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="task.updated",
        payload={
            "fields": list(changed_fields),
            "status": access.task.status,
            "version": access.task.version,
        },
    )
    return access.task


def _reindex_task_column(column):
    tasks = Task.objects.filter(board_column=column).order_by("position", "id")
    for position, task in enumerate(tasks):
        if task.position != position:
            Task.objects.filter(pk=task.pk).update(
                position=position,
                version=F("version") + 1,
                updated_at=timezone.now(),
            )


def delete_task(*, access):
    require_task_manager(access)
    access.task.delete()
    access.board.version += 1
    access.board.save(update_fields=("version", "updated_at"))
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="task.deleted",
    )


def set_task_archived(*, access, archived):
    require_task_manager(access)
    access.task.archived_at = timezone.now() if archived else None
    access.task.save(update_fields=("archived_at", "updated_at"))
    access.board.version += 1
    access.board.save(update_fields=("version", "updated_at"))
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="task.updated",
        payload={"fields": ["archived_at"]},
    )
    return access.task


def duplicate_task(*, access, actor):
    require_task_participant(access, actor)
    original = access.task
    with transaction.atomic():
        column = BoardColumn.objects.get(
            board=access.board,
            status=Task.Status.TODO,
            is_default=True,
            archived_at__isnull=True,
        )
        position = Task.objects.filter(board_column=column).count()
        duplicate = Task.objects.create(
            project=original.project,
            board_column=column,
            position=position,
            creator=actor,
            title=f"{original.title} (copy)"[:255],
            description=original.description,
            priority=original.priority,
            status=Task.Status.TODO,
            start_date=original.start_date,
            due_date=original.due_date,
        )
        TaskActivity.objects.create(
            task=duplicate,
            actor=actor,
            action=TaskActivity.Action.CREATED,
            metadata={"title": duplicate.title, "duplicated_from": str(original.pk)},
        )
        access.board.version += 1
        access.board.save(update_fields=("version", "updated_at"))
        TaskLabel.objects.bulk_create(
            [
                TaskLabel(task=duplicate, label=label)
                for label in original.labels.all()
            ]
        )
    _schedule_task_event(
        project_id=original.project.pk,
        task_id=duplicate.pk,
        event_type="task.created",
        payload={"duplicated_from": str(original.pk)},
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
            assignment = assignment_model.objects.create(
                task=access.task,
                project_member=target_membership,
            )
    except IntegrityError as exc:
        raise Conflict("This project member is already assigned to the task.") from exc
    TaskActivity.objects.create(
        task=access.task,
        actor=actor,
        action=TaskActivity.Action.ASSIGNMENT_ADDED,
        metadata={"user_id": str(target_membership.user_id), "collaborator": collaborator},
    )
    from apps.notifications.services import notify_task_assigned

    notify_task_assigned(
        task=access.task,
        actor=actor,
        recipient=target_membership.user,
        assignment_id=assignment.pk,
        collaborator=collaborator,
    )
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="task.assignment_changed",
        payload={"user_id": str(target_membership.user_id), "added": True},
    )
    return assignment


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
        assignment = model.objects.filter(
            task=access.task,
            project_member__user_id=user_id,
        ).select_related("project_member__user").first()
    else:
        require_task_member_assignment(access, actor, user_id)
        assignment = model.objects.filter(
            task=access.task,
            project_member=access.project_access.project_membership,
        ).select_related("project_member__user").first()
    if assignment is None:
        raise NotFound("Task assignment not found.")
    assignment_id = assignment.pk
    recipient = assignment.project_member.user
    assignment.delete()
    TaskActivity.objects.create(
        task=access.task,
        actor=actor,
        action=TaskActivity.Action.ASSIGNMENT_REMOVED,
        metadata={"user_id": str(recipient.pk), "collaborator": collaborator},
    )
    from apps.notifications.services import notify_task_unassigned

    notify_task_unassigned(
        task=access.task,
        actor=actor,
        recipient=recipient,
        assignment_id=assignment_id,
        collaborator=collaborator,
    )
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="task.assignment_changed",
        payload={"user_id": str(recipient.pk), "added": False},
    )


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

    creator_id = params.get("creator", "").strip()
    if creator_id:
        try:
            creator_id = UUID(creator_id)
        except ValueError:
            queryset = queryset.filter(
                Q(creator__username__icontains=creator_id)
                | Q(creator__first_name__icontains=creator_id)
                | Q(creator__last_name__icontains=creator_id)
            )
        else:
            queryset = queryset.filter(creator_id=creator_id)

    label_id = params.get("label", "").strip()
    if label_id:
        try:
            label_id = UUID(label_id)
        except ValueError as exc:
            raise ValidationError({"label": "Enter a valid label UUID."}) from exc
        queryset = queryset.filter(labels__pk=label_id)

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
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="subtask.updated",
        payload={"subtask_id": str(subtask.pk)},
    )
    return subtask


def create_subtask(*, access, actor, title):
    require_task_participant(access, actor)
    title = title.strip()
    if not title:
        raise ValidationError({"title": "Subtask title cannot be blank."})
    subtask = Subtask.objects.create(
        task=access.task,
        created_by=actor,
        title=title,
    )
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="subtask.created",
        payload={"subtask_id": str(subtask.pk)},
    )
    return subtask


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
        _schedule_task_event(
            project_id=access.project.pk,
            task_id=access.task.pk,
            event_type="subtask.updated",
            payload={"subtask_id": str(subtask.pk)},
        )
    return subtask


def delete_subtask(*, access, actor, subtask_id):
    require_task_participant(access, actor)
    subtask = Subtask.objects.filter(task=access.task, pk=subtask_id).first()
    if subtask is None:
        raise NotFound("Subtask not found.")
    subtask.delete()
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="subtask.deleted",
        payload={"subtask_id": str(subtask_id)},
    )


def _set_comment_mentions(*, comment, project, mention_ids):
    if len(mention_ids) != len(set(mention_ids)):
        raise ValidationError({"mention_ids": "Do not repeat a mentioned member."})
    members = list(
        ProjectMember.objects.select_related("user")
        .filter(
            project=project,
            user_id__in=mention_ids,
            user__workspace_memberships__workspace=project.workspace,
        )
        .distinct()
    )
    by_user_id = {member.user_id: member for member in members}
    if set(mention_ids) != set(by_user_id):
        raise ValidationError(
            {"mention_ids": "Mentions must be active members of this project and workspace."}
        )
    comment.mention_links.all().delete()
    TaskCommentMention.objects.bulk_create(
        [
            TaskCommentMention(comment=comment, project_member=by_user_id[user_id])
            for user_id in mention_ids
        ]
    )


def _record_comment_activity(*, access, actor, comment, action, mention_ids=()):
    metadata = {"comment_id": str(comment.pk)}
    if comment.parent_comment_id:
        metadata["parent_comment_id"] = str(comment.parent_comment_id)
    if mention_ids:
        metadata["mentioned_user_ids"] = [str(user_id) for user_id in mention_ids]
    TaskActivity.objects.create(
        task=access.task,
        actor=actor,
        action=action,
        metadata=metadata,
    )
    _schedule_task_event(
    project_id=access.project.pk,
    task_id=access.task.pk,
    event_type="comment.created",
    payload={"comment_id": str(comment.pk)},
    )


def create_task_comment(
    *,
    access,
    actor,
    body,
    parent_comment_id=None,
    mention_ids=(),
):
    require_task_participant(access, actor)
    body = body.strip()
    if not body:
        raise ValidationError({"body": "Comment cannot be blank."})
    parent = None
    if parent_comment_id is not None:
        parent = TaskComment.objects.filter(
            task=access.task,
            pk=parent_comment_id,
            parent_comment__isnull=True,
        ).first()
        if parent is None:
            raise ValidationError(
                {"parent_comment_id": "Choose a top-level comment on this task."}
            )
    comment = TaskComment.objects.create(
        task=access.task,
        author=actor,
        body=body,
        parent_comment=parent,
    )
    _set_comment_mentions(
        comment=comment,
        project=access.project,
        mention_ids=mention_ids,
    )
    _record_comment_activity(
        access=access,
        actor=actor,
        comment=comment,
        action=(
            TaskActivity.Action.REPLIED
            if parent is not None
            else TaskActivity.Action.COMMENTED
        ),
    )
    if mention_ids:
        _record_comment_activity(
            access=access,
            actor=actor,
            comment=comment,
            action=TaskActivity.Action.MENTIONED,
            mention_ids=mention_ids,
        )
    from apps.notifications.services import notify_task_comment, notify_task_mentions

    notify_task_comment(
        task=access.task,
        actor=actor,
        comment=comment,
        mentioned_user_ids=mention_ids,
    )
    if mention_ids:
        notify_task_mentions(
            task=access.task,
            actor=actor,
            comment=comment,
            recipient_ids=mention_ids,
        )
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="comment.updated",
        payload={"comment_id": str(comment.pk)},
    )
    return comment


def update_task_comment(*, access, actor, comment_id, body, mention_ids=None):
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
    comment.edited_at = timezone.now()
    comment.save(update_fields=("body", "edited_at", "updated_at"))
    if mention_ids is not None:
        _set_comment_mentions(
            comment=comment,
            project=access.project,
            mention_ids=mention_ids,
        )
    _record_comment_activity(
        access=access,
        actor=actor,
        comment=comment,
        action=TaskActivity.Action.COMMENT_UPDATED,
    )
    if mention_ids:
        _record_comment_activity(
            access=access,
            actor=actor,
            comment=comment,
            action=TaskActivity.Action.MENTIONED,
            mention_ids=mention_ids,
        )
    return comment


def delete_task_comment(*, access, actor, comment_id):
    require_task_participant(access, actor)
    comment = TaskComment.objects.filter(task=access.task, pk=comment_id).first()
    if comment is None:
        raise NotFound("Task comment not found.")
    if not access.can_manage and comment.author_id != actor.pk:
        raise PermissionDenied("You can only delete your own comments.")
    _record_comment_activity(
        access=access,
        actor=actor,
        comment=comment,
        action=TaskActivity.Action.COMMENT_DELETED,
    )
    comment.delete()
    _schedule_task_event(
        project_id=access.project.pk,
        task_id=access.task.pk,
        event_type="comment.deleted",
        payload={"comment_id": str(comment_id)},
    )


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
