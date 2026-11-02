from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.permissions import get_project_access
from apps.tasks.board_services import (
    archive_board_column,
    create_board_column,
    delete_board_column,
    get_board_columns,
    get_board_tasks,
    lock_project_board_access,
    move_task,
    reorder_board_columns,
    restore_board_column,
    update_board_column,
)
from apps.tasks.models import BoardColumn, ProjectBoard, TaskActivity
from apps.tasks.pagination import TaskPagination
from apps.tasks.permissions import get_task_access
from apps.tasks.serializers import (
    BoardColumnMutationSerializer,
    BoardColumnReadSerializer,
    BoardColumnWriteSerializer,
    BoardReorderSerializer,
    ProjectBoardReadSerializer,
    TaskActivityReadSerializer,
    TaskMoveSerializer,
    TaskReadSerializer,
)
from apps.tasks.views import task_response


class ProjectBoardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project_access = get_project_access(request.user, project_id)
        include_archived = request.query_params.get("include_archived", "false")
        if include_archived not in ("true", "false"):
            raise ValidationError({"include_archived": "Use true or false."})
        board = ProjectBoard.objects.get(project=project_access.project)
        columns = get_board_columns(
            board,
            include_archived=include_archived == "true",
        )
        column_payloads = []
        for column in columns:
            tasks = list(get_board_tasks(project_access.project, column, request.query_params))
            column_data = BoardColumnReadSerializer(column).data
            column_data["tasks"] = TaskReadSerializer(
                tasks,
                many=True,
                context={"request": request},
            ).data
            column_data["task_count"] = len(tasks)
            column_payloads.append(column_data)
        board_data = ProjectBoardReadSerializer(board).data
        board_data["columns"] = column_payloads
        return Response(board_data)


class ProjectBoardColumnListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        serializer = BoardColumnWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expected_version = _expected_board_version(request.data)
        with transaction.atomic():
            project_access, board = lock_project_board_access(
                request.user,
                project_id,
            )
            column = create_board_column(
                project_access=project_access,
                actor=request.user,
                name=serializer.validated_data["name"],
                status=serializer.validated_data["status"],
                position=serializer.validated_data.get(
                    "position",
                    get_board_columns(board).count(),
                ),
                expected_board_version=expected_version,
            )
            board.refresh_from_db()
        return Response(
            {
                **BoardColumnReadSerializer(column).data,
                "board_version": board.version,
            },
            status=status.HTTP_201_CREATED,
        )


class ProjectBoardColumnReorderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        serializer = BoardReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            project_access, _board = lock_project_board_access(
                request.user,
                project_id,
            )
            columns = reorder_board_columns(
                project_access=project_access,
                column_ids=serializer.validated_data["column_ids"],
                expected_board_version=serializer.validated_data[
                    "expected_board_version"
                ],
            )
            _board.refresh_from_db()
        return Response(
            {
                "columns": BoardColumnReadSerializer(columns, many=True).data,
                "board_version": _board.version,
            }
        )


class BoardColumnDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, column_id):
        serializer = BoardColumnWriteSerializer(
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        project_id = _column_project_id(column_id)
        expected_version = _expected_board_version(request.data)
        with transaction.atomic():
            project_access, _board = lock_project_board_access(
                request.user,
                project_id,
            )
            column = update_board_column(
                project_access=project_access,
                actor=request.user,
                column_id=column_id,
                values=serializer.validated_data,
                expected_board_version=expected_version,
            )
            _board.refresh_from_db()
        return Response(
            {
                **BoardColumnReadSerializer(column).data,
                "board_version": _board.version,
            }
        )

    def delete(self, request, column_id):
        serializer = BoardColumnMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project_id = _column_project_id(column_id)
        with transaction.atomic():
            project_access, board = lock_project_board_access(
                request.user,
                project_id,
            )
            delete_board_column(
                project_access=project_access,
                actor=request.user,
                column_id=column_id,
                destination_column_id=serializer.validated_data.get(
                    "destination_column_id"
                ),
                expected_board_version=serializer.validated_data[
                    "expected_board_version"
                ],
            )
            board.refresh_from_db()
        return Response(
            {"board_version": board.version},
            status=status.HTTP_200_OK,
        )


class BoardColumnArchiveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, column_id):
        serializer = BoardColumnMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project_id = _column_project_id(column_id)
        with transaction.atomic():
            project_access, board = lock_project_board_access(
                request.user,
                project_id,
            )
            column = archive_board_column(
                project_access=project_access,
                actor=request.user,
                column_id=column_id,
                destination_column_id=serializer.validated_data.get(
                    "destination_column_id"
                ),
                expected_board_version=serializer.validated_data[
                    "expected_board_version"
                ],
            )
            board.refresh_from_db()
        return Response(
            {
                **BoardColumnReadSerializer(column).data,
                "board_version": board.version,
            }
        )


class BoardColumnRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, column_id):
        serializer = BoardColumnMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project_id = _column_project_id(column_id)
        with transaction.atomic():
            project_access, board = lock_project_board_access(
                request.user,
                project_id,
            )
            column = restore_board_column(
                project_access=project_access,
                column_id=column_id,
                expected_board_version=serializer.validated_data[
                    "expected_board_version"
                ],
            )
            board.refresh_from_db()
        return Response(
            {
                **BoardColumnReadSerializer(column).data,
                "board_version": board.version,
            }
        )


class TaskMoveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, task_id):
        serializer = TaskMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            task = move_task(
                access=access,
                actor=request.user,
                **serializer.validated_data,
            )
        response = task_response(task, request)
        return Response(
            {**response.data, "board_version": access.board.version},
            status=response.status_code,
        )


class TaskActivityListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        access = get_task_access(request.user, task_id)
        activity = (
            TaskActivity.objects.filter(task=access.task)
            .select_related("actor")
            .order_by("-created_at", "-id")
        )
        paginator = TaskPagination()
        page = paginator.paginate_queryset(activity, request, view=self)
        serializer = TaskActivityReadSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


def _column_project_id(column_id):
    project_id = (
        BoardColumn.objects.filter(pk=column_id)
        .values_list("board__project_id", flat=True)
        .first()
    )
    if project_id is None:
        raise NotFound("Board column not found.")
    return project_id


def _expected_board_version(data):
    serializer = BoardColumnMutationSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data["expected_board_version"]
