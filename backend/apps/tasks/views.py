from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.permissions import get_project_access
from apps.tasks.models import Label, Subtask, Task, TaskComment
from apps.tasks.pagination import TaskPagination
from apps.tasks.permissions import (
    get_task_access,
    require_task_manager,
    require_task_participant,
)
from apps.tasks.serializers import (
    LabelReadSerializer,
    LabelWriteSerializer,
    SubtaskReadSerializer,
    SubtaskWriteSerializer,
    TaskAssignmentSerializer,
    TaskCommentReadSerializer,
    TaskCommentWriteSerializer,
    TaskCreateSerializer,
    TaskLabelSerializer,
    TaskReadSerializer,
    TaskWriteSerializer,
)
from apps.tasks.services import (
    add_task_assignment,
    add_task_label,
    create_label,
    create_subtask,
    create_task,
    create_task_comment,
    delete_subtask,
    delete_task,
    delete_task_comment,
    duplicate_task,
    list_tasks,
    remove_task_assignment,
    remove_task_label,
    set_task_archived,
    update_subtask,
    update_task,
    update_task_comment,
)
from apps.workspaces.models import WorkspaceMember


def task_queryset():
    return (
        Task.objects.select_related("project", "creator")
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


def task_response(task, request, *, status_code=status.HTTP_200_OK):
    return Response(
        TaskReadSerializer(task, context={"request": request}).data,
        status=status_code,
    )


class TaskListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        project_id = request.query_params.get("project_id")
        if not project_id:
            raise ValidationError({"project_id": "This query parameter is required."})
        access = get_project_access(request.user, project_id)
        tasks = task_queryset().filter(project=access.project)
        tasks = list_tasks(tasks, request.query_params)
        paginator = TaskPagination()
        page = paginator.paginate_queryset(tasks, request, view=self)
        serializer = TaskReadSerializer(
            page,
            many=True,
            context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = TaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        project_id = values.pop("project_id")
        with transaction.atomic():
            access = get_project_access(request.user, project_id, lock=True)
            task = create_task(
                access=access,
                creator=request.user,
                values=values,
            )
        return task_response(
            task_queryset().get(pk=task.pk),
            request,
            status_code=status.HTTP_201_CREATED,
        )


class TaskDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        access = get_task_access(request.user, task_id)
        task = task_queryset().get(pk=access.task.pk)
        return task_response(task, request)

    def patch(self, request, task_id):
        serializer = TaskWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            task = update_task(
                access=access,
                actor=request.user,
                values=serializer.validated_data,
            )
        return task_response(task_queryset().get(pk=task.pk), request)

    def delete(self, request, task_id):
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            delete_task(access=access)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, task_id, action):
        if action not in ("archive", "restore", "duplicate"):
            raise NotFound("Task action not found.")
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            if action == "duplicate":
                task = duplicate_task(access=access, actor=request.user)
                response_status = status.HTTP_201_CREATED
            else:
                task = set_task_archived(
                    access=access,
                    archived=action == "archive",
                )
                response_status = status.HTTP_200_OK
        return task_response(
            task_queryset().get(pk=task.pk),
            request,
            status_code=response_status,
        )


class TaskAssignmentView(APIView):
    permission_classes = [IsAuthenticated]
    collaborator = False

    def __init__(self, **kwargs):
        self.collaborator = kwargs.pop("collaborator", False)
        super().__init__(**kwargs)

    def post(self, request, task_id):
        serializer = TaskAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            add_task_assignment(
                access=access,
                actor=request.user,
                user_id=serializer.validated_data["user_id"],
                collaborator=self.collaborator,
            )
        return task_response(task_queryset().get(pk=task_id), request)

    def delete(self, request, task_id, user_id):
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            remove_task_assignment(
                access=access,
                actor=request.user,
                user_id=user_id,
                collaborator=self.collaborator,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskLabelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, task_id):
        serializer = TaskLabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            add_task_label(
                access=access,
                actor=request.user,
                label_id=serializer.validated_data["label_id"],
            )
        return task_response(task_queryset().get(pk=task_id), request)

    def delete(self, request, task_id, label_id):
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            remove_task_label(
                access=access,
                actor=request.user,
                label_id=label_id,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectLabelListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        access = get_project_access(request.user, project_id)
        labels = Label.objects.filter(project=access.project).order_by("name", "id")
        paginator = TaskPagination()
        page = paginator.paginate_queryset(labels, request, view=self)
        serializer = LabelReadSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, project_id):
        serializer = LabelWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_project_access(request.user, project_id, lock=True)
            require_task_manager_for_project(access)
            label = create_label(
                project=access.project,
                actor=request.user,
                name=serializer.validated_data["name"],
            )
        return Response(
            LabelReadSerializer(label).data,
            status=status.HTTP_201_CREATED,
        )


class TaskSubtaskListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        access = get_task_access(request.user, task_id)
        subtasks = Subtask.objects.filter(task=access.task).select_related("created_by")
        paginator = TaskPagination()
        page = paginator.paginate_queryset(subtasks, request, view=self)
        serializer = SubtaskReadSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, task_id):
        serializer = SubtaskWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            subtask = create_subtask(
                access=access,
                actor=request.user,
                title=serializer.validated_data["title"],
            )
        return Response(
            SubtaskReadSerializer(subtask).data,
            status=status.HTTP_201_CREATED,
        )


class TaskSubtaskDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, task_id, subtask_id):
        serializer = SubtaskWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            subtask = update_subtask(
                access=access,
                actor=request.user,
                subtask_id=subtask_id,
                values=serializer.validated_data,
            )
        return Response(SubtaskReadSerializer(subtask).data)

    def delete(self, request, task_id, subtask_id):
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            delete_subtask(
                access=access,
                actor=request.user,
                subtask_id=subtask_id,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskCommentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        access = get_task_access(request.user, task_id)
        comments = (
            TaskComment.objects.filter(task=access.task)
            .select_related("author")
            .order_by("created_at", "id")
        )
        paginator = TaskPagination()
        page = paginator.paginate_queryset(comments, request, view=self)
        serializer = TaskCommentReadSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, task_id):
        serializer = TaskCommentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            comment = create_task_comment(
                access=access,
                actor=request.user,
                body=serializer.validated_data["body"],
            )
        return Response(
            TaskCommentReadSerializer(comment).data,
            status=status.HTTP_201_CREATED,
        )


class TaskCommentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, task_id, comment_id):
        serializer = TaskCommentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            comment = update_task_comment(
                access=access,
                actor=request.user,
                comment_id=comment_id,
                body=serializer.validated_data["body"],
            )
        return Response(TaskCommentReadSerializer(comment).data)

    def delete(self, request, task_id, comment_id):
        with transaction.atomic():
            access = get_task_access(request.user, task_id, lock=True)
            delete_task_comment(
                access=access,
                actor=request.user,
                comment_id=comment_id,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


def require_task_manager_for_project(project_access):
    if not project_access.can_manage:
        raise PermissionDenied("Only project Managers and workspace admins can manage labels.")
