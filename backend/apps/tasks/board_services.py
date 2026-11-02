from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.projects.permissions import get_project_access, require_project_manager
from apps.tasks.models import BoardColumn, ProjectBoard, Task, TaskActivity
from apps.tasks.permissions import TaskAccess, require_task_participant
from apps.tasks.services import list_tasks
from apps.workspaces.services import Conflict


DEFAULT_COLUMNS = (
    ("To Do", Task.Status.TODO),
    ("In Progress", Task.Status.IN_PROGRESS),
    ("Review", Task.Status.REVIEW),
    ("Completed", Task.Status.COMPLETED),
)


def create_project_board(project):
    board, created = ProjectBoard.objects.get_or_create(project=project)
    if created:
        BoardColumn.objects.bulk_create(
            [
                BoardColumn(
                    board=board,
                    name=name,
                    status=status,
                    position=position,
                    is_default=True,
                )
                for position, (name, status) in enumerate(DEFAULT_COLUMNS)
            ]
        )
    return board


def lock_project_board_access(user, project_id):
    project_access = get_project_access(user, project_id, lock=True)
    board = ProjectBoard.objects.select_for_update().get(
        project_id=project_access.project.pk,
    )
    return project_access, board


def board_task_queryset(project):
    return (
        Task.objects.filter(project=project)
        .select_related("project", "creator", "board_column")
        .prefetch_related(
            "assignees__user",
            "collaborators__user",
            "labels",
            "subtasks",
        )
        .annotate(
            _subtask_count=Count("subtasks", distinct=True),
            _completed_subtask_count=Count(
                "subtasks",
                filter=Q(subtasks__is_completed=True),
                distinct=True,
            ),
        )
    )


def get_board_columns(board, *, include_archived=False):
    columns = board.columns.all()
    if not include_archived:
        columns = columns.filter(archived_at__isnull=True)
    return columns.order_by("position", "id")


def get_board_tasks(project, column, filters):
    tasks = board_task_queryset(project).filter(
        board_column=column,
        archived_at__isnull=True,
    )
    return list_tasks(tasks, filters).order_by("position", "id")


def _check_board_version(board, expected_version):
    if board.version != expected_version:
        raise Conflict(
            "The board changed since it was loaded. Refresh and retry your change."
        )


def _bump_board(board):
    board.version += 1
    board.save(update_fields=("version", "updated_at"))


def _record_activity(*, task, actor, action, metadata):
    TaskActivity.objects.create(
        task=task,
        actor=actor,
        action=action,
        metadata=metadata,
    )


def _change_task_status(task, status, *, actor, action, metadata=None):
    previous_status = task.status
    task.status = status
    task.completed_at = (
        timezone.now()
        if status == Task.Status.COMPLETED
        and previous_status != Task.Status.COMPLETED
        else task.completed_at
        if status == Task.Status.COMPLETED
        else None
    )
    task.version += 1
    task.save(
        update_fields=(
            "status",
            "completed_at",
            "version",
            "updated_at",
        )
    )
    if action:
        _record_activity(
            task=task,
            actor=actor,
            action=action,
            metadata=metadata
            or {"from_status": previous_status, "to_status": status},
        )


def _position_tasks(tasks, *, bumped_ids=()):
    bumped_ids = set(bumped_ids)
    for position, task in enumerate(tasks):
        if task.position != position:
            task.position = position
            fields = ["position", "updated_at"]
            if task.pk not in bumped_ids:
                task.version += 1
                fields.append("version")
            task.save(update_fields=fields)


def create_board_column(
    *,
    project_access,
    actor,
    name,
    status,
    position,
    expected_board_version,
):
    require_project_manager(project_access)
    board = ProjectBoard.objects.select_for_update().get(
        project_id=project_access.project.pk,
    )
    _check_board_version(board, expected_board_version)
    columns = list(get_board_columns(board))
    if position < 0 or position > len(columns):
        raise ValidationError({"position": "Choose a position within the board."})
    try:
        with transaction.atomic():
            column = BoardColumn.objects.create(
                board=board,
                name=name.strip(),
                status=status,
                position=position,
            )
    except IntegrityError as exc:
        raise Conflict("A column with this name already exists on the board.") from exc
    columns.insert(position, column)
    _position_columns(columns)
    _bump_board(board)
    return column


def _position_columns(columns):
    for position, column in enumerate(columns):
        if column.position != position:
            column.position = position
            column.save(update_fields=("position", "updated_at"))


def update_board_column(
    *,
    project_access,
    actor,
    column_id,
    values,
    expected_board_version,
):
    require_project_manager(project_access)
    board = ProjectBoard.objects.select_for_update().get(
        project_id=project_access.project.pk,
    )
    _check_board_version(board, expected_board_version)
    column = BoardColumn.objects.select_for_update().filter(
        board=board,
        pk=column_id,
        archived_at__isnull=True,
    ).first()
    if column is None:
        raise ValidationError({"column_id": "Active board column not found."})

    next_status = values.get("status", column.status)
    if column.is_default and next_status != column.status:
        raise Conflict("The canonical status columns cannot change their status.")
    if next_status != column.status and not BoardColumn.objects.filter(
        board=board,
        status=column.status,
        is_default=True,
        archived_at__isnull=True,
    ).exclude(pk=column.pk).exists():
        raise Conflict("Add a replacement canonical column before changing this status.")
    if "position" in values:
        columns = list(get_board_columns(board).exclude(pk=column.pk))
        position = values["position"]
        if position < 0 or position > len(columns):
            raise ValidationError({"position": "Choose a position within the board."})
        columns.insert(position, column)
        _position_columns(columns)

    old_status = column.status
    column.name = values.get("name", column.name).strip()
    column.status = next_status
    column.save(update_fields=("name", "status", "updated_at"))
    if next_status != old_status:
        for task in Task.objects.select_for_update().filter(
            board_column=column,
        ).order_by("position", "id"):
            _change_task_status(
                task,
                next_status,
                actor=actor,
                action=TaskActivity.Action.UPDATED,
                metadata={"from_status": old_status, "to_status": next_status},
            )
    _bump_board(board)
    return column


def reorder_board_columns(
    *,
    project_access,
    column_ids,
    expected_board_version,
):
    require_project_manager(project_access)
    board = ProjectBoard.objects.select_for_update().get(
        project_id=project_access.project.pk,
    )
    _check_board_version(board, expected_board_version)
    columns = list(get_board_columns(board))
    by_id = {column.pk: column for column in columns}
    if len(column_ids) != len(set(column_ids)) or set(column_ids) != set(by_id):
        raise ValidationError(
            {"column_ids": "Provide every active board column exactly once."}
        )
    ordered = [by_id[column_id] for column_id in column_ids]
    _position_columns(ordered)
    _bump_board(board)
    return ordered


def _migrate_tasks(*, source, destination, actor):
    tasks = list(
        Task.objects.select_for_update()
        .filter(board_column=source)
        .order_by("position", "id")
    )
    destination_position = Task.objects.filter(
        board_column=destination,
    ).count()
    for offset, task in enumerate(tasks):
        old_status = task.status
        task.board_column = destination
        task.position = destination_position + offset
        task.status = destination.status
        task.completed_at = (
            timezone.now()
            if destination.status == Task.Status.COMPLETED
            and old_status != Task.Status.COMPLETED
            else task.completed_at
            if destination.status == Task.Status.COMPLETED
            else None
        )
        task.version += 1
        task.save(
            update_fields=(
                "board_column",
                "position",
                "status",
                "completed_at",
                "version",
                "updated_at",
            )
        )
        _record_activity(
            task=task,
            actor=actor,
            action=TaskActivity.Action.MOVED,
            metadata={
                "from_column_id": str(source.pk),
                "to_column_id": str(destination.pk),
                "from_status": old_status,
                "to_status": destination.status,
            },
        )


def _promote_default_column(column):
    if not column.is_default:
        return
    replacement = (
        BoardColumn.objects.filter(
            board=column.board,
            status=column.status,
            is_default=False,
            archived_at__isnull=True,
        )
        .exclude(pk=column.pk)
        .order_by("position", "id")
        .first()
    )
    if replacement is None:
        raise Conflict(
            "Create another active column for this status before removing its canonical column."
        )
    replacement.is_default = True
    replacement.save(update_fields=("is_default", "updated_at"))
    column.is_default = False
    column.save(update_fields=("is_default", "updated_at"))


def archive_board_column(
    *,
    project_access,
    actor,
    column_id,
    destination_column_id,
    expected_board_version,
):
    require_project_manager(project_access)
    board = ProjectBoard.objects.select_for_update().get(
        project_id=project_access.project.pk,
    )
    _check_board_version(board, expected_board_version)
    column = BoardColumn.objects.select_for_update().filter(
        board=board,
        pk=column_id,
        archived_at__isnull=True,
    ).first()
    if column is None:
        raise ValidationError({"column_id": "Active board column not found."})
    destination = _get_migration_destination(
        board=board,
        source=column,
        destination_column_id=destination_column_id,
    )
    if Task.objects.filter(board_column=column).exists() and destination is None:
        raise ValidationError(
            {"destination_column_id": "Choose a destination for tasks in this column."}
        )
    if destination:
        _migrate_tasks(source=column, destination=destination, actor=actor)
    _promote_default_column(column)
    column.archived_at = timezone.now()
    column.save(update_fields=("archived_at", "updated_at"))
    _position_columns(list(get_board_columns(board)))
    _bump_board(board)
    return column


def restore_board_column(*, project_access, column_id, expected_board_version):
    require_project_manager(project_access)
    board = ProjectBoard.objects.select_for_update().get(
        project_id=project_access.project.pk,
    )
    _check_board_version(board, expected_board_version)
    column = BoardColumn.objects.select_for_update().filter(
        board=board,
        pk=column_id,
        archived_at__isnull=False,
    ).first()
    if column is None:
        raise ValidationError({"column_id": "Archived board column not found."})
    position = get_board_columns(board).count()
    column.archived_at = None
    column.position = position
    column.save(update_fields=("archived_at", "position", "updated_at"))
    _bump_board(board)
    return column


def delete_board_column(
    *,
    project_access,
    actor,
    column_id,
    destination_column_id,
    expected_board_version,
):
    require_project_manager(project_access)
    board = ProjectBoard.objects.select_for_update().get(
        project_id=project_access.project.pk,
    )
    _check_board_version(board, expected_board_version)
    column = BoardColumn.objects.select_for_update().filter(
        board=board,
        pk=column_id,
        archived_at__isnull=True,
    ).first()
    if column is None:
        raise ValidationError({"column_id": "Active board column not found."})
    destination = _get_migration_destination(
        board=board,
        source=column,
        destination_column_id=destination_column_id,
    )
    if Task.objects.filter(board_column=column).exists() and destination is None:
        raise ValidationError(
            {"destination_column_id": "Choose a destination for tasks in this column."}
        )
    if destination:
        _migrate_tasks(source=column, destination=destination, actor=actor)
    _promote_default_column(column)
    column.delete()
    _position_columns(list(get_board_columns(board)))
    _bump_board(board)


def _get_migration_destination(*, board, source, destination_column_id):
    if destination_column_id is None:
        return None
    if destination_column_id == source.pk:
        raise ValidationError(
            {"destination_column_id": "Choose a different destination column."}
        )
    destination = BoardColumn.objects.select_for_update().filter(
        board=board,
        pk=destination_column_id,
        archived_at__isnull=True,
    ).first()
    if destination is None:
        raise ValidationError(
            {"destination_column_id": "Choose an active column on this project board."}
        )
    return destination


def move_task(
    *,
    access: TaskAccess,
    actor,
    column_id,
    position,
    expected_task_version,
    expected_board_version,
):
    require_task_participant(access, actor)
    board = access.board
    _check_board_version(board, expected_board_version)
    task = access.task
    if task.version != expected_task_version:
        raise Conflict("This task changed since it was loaded. Refresh and retry.")
    destination = BoardColumn.objects.filter(
        board=board,
        pk=column_id,
        archived_at__isnull=True,
    ).first()
    if destination is None:
        raise ValidationError({"column_id": "Choose an active column on this board."})

    source = task.board_column
    source_tasks = list(
        Task.objects.select_for_update()
        .filter(board_column=source)
        .exclude(pk=task.pk)
        .order_by("position", "id")
    )
    if source.pk == destination.pk:
        ordered = source_tasks
        if position > len(ordered):
            raise ValidationError({"position": "Choose a position within the column."})
        ordered.insert(position, task)
        task.version += 1
        task.save(update_fields=("version", "updated_at"))
        _position_tasks(ordered, bumped_ids=(task.pk,))
    else:
        target_tasks = list(
            Task.objects.select_for_update()
            .filter(board_column=destination)
            .order_by("position", "id")
        )
        if position > len(target_tasks):
            raise ValidationError({"position": "Choose a position within the column."})
        old_column_id = source.pk
        old_status = task.status
        task.position = position
        task.board_column = destination
        task.status = destination.status
        task.completed_at = (
            timezone.now()
            if destination.status == Task.Status.COMPLETED
            and old_status != Task.Status.COMPLETED
            else task.completed_at
            if destination.status == Task.Status.COMPLETED
            else None
        )
        task.version += 1
        task.save(
            update_fields=(
                "board_column",
                "position",
                "status",
                "completed_at",
                "version",
                "updated_at",
            )
        )
        target_tasks.insert(position, task)
        _position_tasks(source_tasks)
        _position_tasks(target_tasks, bumped_ids=(task.pk,))
        _record_activity(
            task=task,
            actor=actor,
            action=TaskActivity.Action.MOVED,
            metadata={
                "from_column_id": str(old_column_id),
                "to_column_id": str(destination.pk),
                "from_status": old_status,
                "to_status": destination.status,
            },
        )
    _bump_board(board)
    return task
