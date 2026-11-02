from datetime import date, timedelta

from django.db.models import (
    CharField,
    Count,
    F,
    Q,
    Value,
)
from django.db.models.functions import Cast
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dashboard.pagination import DashboardPagination
from apps.dashboard.queries import (
    accessible_activity_events,
    accessible_projects,
    accessible_tasks,
)
from apps.dashboard.serializers import (
    CalendarEventSerializer,
    ProjectProgressSerializer,
    UpcomingTaskSerializer,
)
from apps.projects.models import Project
from apps.tasks.models import Task


def _calendar_event_queryset(queryset, *, event_date, event_type, title):
    is_task_event = queryset.model is Task
    return queryset.values(
        event_date=F(event_date),
        event_type=Value(event_type, output_field=CharField()),
        event_title=F(title),
        object_id=Cast("pk", output_field=CharField()),
        event_project_id=F("project_id") if is_task_event else F("pk"),
        event_workspace_id=(
            F("project__workspace_id") if is_task_event else F("workspace_id")
        ),
        event_project_name=F("project__name") if is_task_event else F("name"),
        event_status=F("status") if is_task_event else Value("", output_field=CharField()),
        event_priority=F("priority") if is_task_event else Value("", output_field=CharField()),
    )


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        projects = accessible_projects(request.user).filter(archived_at__isnull=True)
        tasks = accessible_tasks(request.user).filter(
            archived_at__isnull=True,
            project__archived_at__isnull=True,
        )
        assigned_tasks = tasks.filter(assignees__user=request.user).distinct()
        open_tasks = tasks.exclude(status=Task.Status.COMPLETED)
        due_soon = assigned_tasks.filter(
            status__in=(Task.Status.TODO, Task.Status.IN_PROGRESS, Task.Status.REVIEW),
            due_date__gte=today,
            due_date__lte=today + timedelta(days=7),
        )
        upcoming_tasks = due_soon.select_related("project__workspace").order_by(
            "due_date",
            "pk",
        )[:8]
        overdue_tasks = assigned_tasks.filter(
            status__in=(Task.Status.TODO, Task.Status.IN_PROGRESS, Task.Status.REVIEW),
            due_date__lt=today,
        ).select_related("project__workspace").order_by("due_date", "pk")[:8]
        status_totals = {
            entry["status"]: entry["total"]
            for entry in tasks.values("status").annotate(total=Count("pk"))
        }
        recent_activity = accessible_activity_events(request.user).select_related(
            "actor",
            "project",
            "task",
        ).order_by("-created_at", "-pk")[:8]
        return Response(
            {
                "projects": {
                    "total": projects.count(),
                    "active": projects.filter(status=Project.Status.ACTIVE).count(),
                },
                "tasks": {
                    "total": sum(status_totals.values()),
                    "open": open_tasks.count(),
                    "completed": status_totals.get(Task.Status.COMPLETED, 0),
                    "by_status": status_totals,
                },
                "my_workload": {
                    "assigned_open": open_tasks.filter(
                        assignees__user=request.user,
                    ).distinct().count(),
                    "overdue": assigned_tasks.filter(
                        status__in=(
                            Task.Status.TODO,
                            Task.Status.IN_PROGRESS,
                            Task.Status.REVIEW,
                        ),
                        due_date__lt=today,
                    ).count(),
                    "due_soon": due_soon.count(),
                    "overdue_tasks": UpcomingTaskSerializer(
                        overdue_tasks,
                        many=True,
                    ).data,
                },
                "upcoming_tasks": UpcomingTaskSerializer(
                    upcoming_tasks,
                    many=True,
                ).data,
                "recent_activity": [
                    {
                        "id": str(event.pk),
                        "event_type": event.event_type,
                        "actor_name": (
                            event.actor.get_full_name().strip()
                            or event.actor.get_username()
                            if event.actor
                            else "TeamSync"
                        ),
                        "project_id": str(event.project_id) if event.project_id else None,
                        "workspace_id": str(event.workspace_id),
                        "project_name": event.project.name if event.project_id else "",
                        "task_id": str(event.task_id) if event.task_id else None,
                        "task_title": event.task.title if event.task_id else "",
                        "created_at": event.created_at,
                    }
                    for event in recent_activity
                ],
            }
        )


class AnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tasks = accessible_tasks(request.user).filter(
            archived_at__isnull=True,
            project__archived_at__isnull=True,
        )
        status_totals = {
            entry["status"]: entry["total"]
            for entry in tasks.values("status").annotate(total=Count("pk"))
        }
        projects = (
            accessible_projects(request.user)
            .filter(archived_at__isnull=True)
            .annotate(
                task_count=Count(
                    "tasks",
                    filter=Q(
                        tasks__archived_at__isnull=True,
                        tasks__project__archived_at__isnull=True,
                    ),
                    distinct=True,
                ),
                completed_task_count=Count(
                    "tasks",
                    filter=Q(
                        tasks__archived_at__isnull=True,
                        tasks__project__archived_at__isnull=True,
                        tasks__status=Task.Status.COMPLETED,
                    ),
                    distinct=True,
                ),
            )
            .order_by("name", "pk")
        )
        paginator = DashboardPagination()
        page = paginator.paginate_queryset(projects, request, view=self)
        response = paginator.get_paginated_response(
            ProjectProgressSerializer(page, many=True).data
        )
        total_tasks = sum(status_totals.values())
        response.data["totals"] = {
            "task_count": total_tasks,
            "completed_task_count": status_totals.get(Task.Status.COMPLETED, 0),
            "status_counts": status_totals,
            "progress_denominator": "All non-archived tasks in accessible, non-archived projects.",
        }
        return response


class CalendarEventsView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _parse_date(value, parameter):
        if not value:
            raise ValidationError({parameter: "This query parameter is required."})
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ValidationError({parameter: "Enter a valid ISO date (YYYY-MM-DD)."}) from exc

    def get(self, request):
        start = self._parse_date(request.query_params.get("start"), "start")
        end = self._parse_date(request.query_params.get("end"), "end")
        if end < start:
            raise ValidationError({"end": "End date cannot be before start date."})
        if (end - start).days > 41:
            raise ValidationError({"end": "Calendar ranges cannot exceed 42 days."})

        task_queryset = accessible_tasks(request.user).filter(
            archived_at__isnull=True,
            project__archived_at__isnull=True,
        ).select_related("project")
        project_queryset = accessible_projects(request.user).filter(
            archived_at__isnull=True,
        )
        event_querysets = []
        for field, event_type in (
            ("start_date", "task_start"),
            ("due_date", "task_deadline"),
        ):
            matching_tasks = task_queryset.filter(
                **{f"{field}__gte": start, f"{field}__lte": end}
            )
            event_querysets.append(
                _calendar_event_queryset(
                    matching_tasks,
                    event_date=field,
                    event_type=event_type,
                    title="title",
                )
            )
        for field, event_type in (
            ("start_date", "project_start"),
            ("due_date", "project_deadline"),
        ):
            matching_projects = project_queryset.filter(
                **{f"{field}__gte": start, f"{field}__lte": end}
            )
            event_querysets.append(
                _calendar_event_queryset(
                    matching_projects,
                    event_date=field,
                    event_type=event_type,
                    title="name",
                )
            )
        events = event_querysets[0].union(*event_querysets[1:], all=True).order_by(
            "event_date",
            "event_title",
            "event_type",
        )
        paginator = DashboardPagination()
        page = paginator.paginate_queryset(events, request, view=self)
        return paginator.get_paginated_response(
            CalendarEventSerializer(page, many=True).data
        )
