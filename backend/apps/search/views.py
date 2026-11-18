from uuid import UUID

from django.db.models import Q
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dashboard.queries import accessible_projects
from apps.tasks.models import Task, TaskComment
from apps.tasks.services import list_tasks
from apps.workspaces.models import WorkspaceMember


class GlobalSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            raise ValidationError({"q": "Enter a search term."})
        if len(query) > 100:
            raise ValidationError({"q": "Search terms must be 100 characters or fewer."})

        page = self._positive_integer(request.query_params.get("page", "1"), "page")
        page_size = min(
            self._positive_integer(
                request.query_params.get("page_size", "10"),
                "page_size",
            ),
            20,
        )
        offset = (page - 1) * page_size

        projects = accessible_projects(request.user)
        project_filter = request.query_params.get("project", "").strip()
        project_id = None
        if project_filter:
            try:
                project_id = UUID(project_filter)
            except ValueError:
                projects = projects.filter(name__icontains=project_filter)
            else:
                projects = projects.filter(pk=project_id)
        projects = projects.filter(archived_at__isnull=True)

        accessible_task_queryset = Task.objects.filter(
            project__in=projects,
            project__archived_at__isnull=True,
        ).select_related(
            "project", "project__workspace", "creator",
        )
        task_params = request.query_params.copy()
        task_params["search"] = query
        task_queryset = accessible_task_queryset
        task_assignee = request.query_params.get("assignee", "").strip()
        task_creator = request.query_params.get("creator", "").strip()
        task_label = request.query_params.get("label", "").strip()
        task_params.pop("assignee", None)
        task_params.pop("creator", None)
        task_params.pop("label", None)
        if task_assignee:
            try:
                task_assignee_id = UUID(task_assignee)
            except ValueError:
                task_queryset = task_queryset.filter(
                    Q(assignees__user__username__icontains=task_assignee)
                    | Q(assignees__user__first_name__icontains=task_assignee)
                    | Q(assignees__user__last_name__icontains=task_assignee)
                )
            else:
                task_params["assignee"] = str(task_assignee_id)
        if task_creator:
            try:
                task_creator_id = UUID(task_creator)
            except ValueError:
                task_queryset = task_queryset.filter(
                    Q(creator__username__icontains=task_creator)
                    | Q(creator__first_name__icontains=task_creator)
                    | Q(creator__last_name__icontains=task_creator)
                )
            else:
                task_params["creator"] = str(task_creator_id)
        if task_label:
            try:
                task_label_id = UUID(task_label)
            except ValueError:
                task_queryset = task_queryset.filter(
                    labels__name__icontains=task_label,
                )
            else:
                task_params["label"] = str(task_label_id)
        filtered_task_queryset = task_queryset
        tasks = list_tasks(filtered_task_queryset, task_params)
        if project_filter and project_id is None:
            tasks = tasks.filter(project__name__icontains=project_filter)

        project_results = projects.filter(
            archived_at__isnull=True,
        ).filter(
            Q(name__icontains=query) | Q(description__icontains=query)
        ).select_related("workspace").order_by("name", "pk")
        comment_params = task_params.copy()
        comment_params.pop("search", None)
        comment_tasks = list_tasks(filtered_task_queryset, comment_params)
        if project_filter and project_id is None:
            comment_tasks = comment_tasks.filter(project__name__icontains=project_filter)
        comment_results = TaskComment.objects.filter(
            task__in=comment_tasks.values("pk"),
            body__icontains=query,
        ).select_related(
            "author", "task", "task__project", "task__project__workspace",
        ).order_by("-created_at", "pk")
        member_results = (
            WorkspaceMember.objects.filter(
                workspace_id__in=projects.values("workspace_id"),
            )
            .filter(
                Q(user__username__icontains=query)
                | Q(user__first_name__icontains=query)
                | Q(user__last_name__icontains=query)
            )
            .values(
                "user_id",
                "user__username",
                "user__first_name",
                "user__last_name",
                "workspace_id",
                "workspace__name",
            )
            .distinct()
            .order_by("user__username", "workspace__name")
        )

        return Response(
            {
                "query": query,
                "page": page,
                "page_size": page_size,
                "projects": self._group(
                    project_results,
                    offset,
                    page_size,
                    lambda item: {
                        "id": str(item.pk),
                        "name": item.name,
                        "description": item.description[:200],
                        "status": item.status,
                        "workspace_id": str(item.workspace_id),
                        "workspace_name": item.workspace.name,
                    },
                ),
                "tasks": self._group(
                    tasks,
                    offset,
                    page_size,
                    lambda item: {
                        "id": str(item.pk),
                        "title": item.title,
                        "status": item.status,
                        "priority": item.priority,
                        "due_date": item.due_date.isoformat() if item.due_date else None,
                        "project_id": str(item.project_id),
                        "project_name": item.project.name,
                        "workspace_id": str(item.project.workspace_id),
                    },
                ),
                "members": self._group(
                    member_results,
                    offset,
                    page_size,
                    lambda item: {
                        "id": str(item["user_id"]),
                        "username": item["user__username"],
                        "first_name": item["user__first_name"],
                        "last_name": item["user__last_name"],
                        "workspace_id": str(item["workspace_id"]),
                        "workspace_name": item["workspace__name"],
                    },
                ),
                "comments": self._group(
                    comment_results,
                    offset,
                    page_size,
                    lambda item: {
                        "id": str(item.pk),
                        "body": item.body[:240],
                        "task_id": str(item.task_id),
                        "task_title": item.task.title,
                        "project_id": str(item.task.project_id),
                        "project_name": item.task.project.name,
                        "workspace_id": str(item.task.project.workspace_id),
                        "author_username": item.author.username if item.author else None,
                        "created_at": item.created_at.isoformat(),
                    },
                ),
            }
        )

    @staticmethod
    def _positive_integer(value, field):
        try:
            result = int(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError({field: "Enter a positive integer."}) from exc
        if result < 1:
            raise ValidationError({field: "Enter a positive integer."})
        return result

    @staticmethod
    def _group(queryset, offset, page_size, serialize):
        count = queryset.count()
        return {
            "count": count,
            "page": offset // page_size + 1,
            "page_size": page_size,
            "results": [serialize(item) for item in queryset[offset : offset + page_size]],
        }
