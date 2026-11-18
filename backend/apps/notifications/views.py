from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import ActivityEvent, Notification, NotificationPreference
from apps.notifications.preference_serializers import NotificationPreferenceSerializer
from apps.notifications.serializers import (
    ActivityEventReadSerializer,
    NotificationReadSerializer,
)
from apps.projects.models import ProjectMember
from apps.workspaces.models import WorkspaceMember
from apps.projects.permissions import get_workspace_membership


class NotificationPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def visible_notifications(user):
    return (
        Notification.objects.filter(recipient=user)
        .filter(
            Q(task__isnull=True)
            | Q(
                task__project__workspace__members__user=user,
                task__project__members__user=user,
            )
            | Q(
                task__project__workspace__members__user=user,
                task__project__workspace__members__role__in=(
                    WorkspaceMember.Role.OWNER,
                    WorkspaceMember.Role.ADMIN,
                ),
            )
        )
        .select_related("actor", "workspace", "task", "task__project")
        .distinct()
    )


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = visible_notifications(request.user)
        unread_only = request.query_params.get("unread_only", "").lower()
        if unread_only not in ("", "true", "false"):
            raise ValidationError({"unread_only": "Use true or false."})
        if unread_only == "true":
            notifications = notifications.filter(read_at__isnull=True)
        elif unread_only == "false":
            notifications = notifications.filter(read_at__isnull=False)
        notifications = notifications.order_by("-created_at", "-pk")
        paginator = NotificationPagination()
        page = paginator.paginate_queryset(notifications, request, view=self)
        return paginator.get_paginated_response(
            NotificationReadSerializer(page, many=True).data
        )


class NotificationPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preference, _created = NotificationPreference.objects.get_or_create(
            user=request.user
        )
        return Response({"categories": preference.categories})

    def patch(self, request):
        serializer = NotificationPreferenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        preference, _created = NotificationPreference.objects.get_or_create(
            user=request.user
        )
        preference.categories = {
            **preference.categories,
            **serializer.validated_data.get("categories", {}),
        }
        preference.save(update_fields=("categories", "updated_at"))
        return Response({"categories": preference.categories})


class NotificationReadStateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id, read_state):
        if read_state not in ("read", "unread"):
            raise NotFound("Notification action not found.")
        notification = visible_notifications(request.user).filter(pk=notification_id).first()
        if notification is None:
            raise NotFound("Notification not found.")
        notification.read_at = timezone.now() if read_state == "read" else None
        notification.save(update_fields=("read_at",))
        from apps.realtime.events import schedule_user_event

        schedule_user_event(
            user_id=request.user.pk,
            event_type="notification.read_state",
            payload={
                "notification_id": str(notification.pk),
                "read": notification.read_at is not None,
            },
        )
        return Response(NotificationReadSerializer(notification).data)


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = visible_notifications(request.user).filter(read_at__isnull=True).update(
            read_at=timezone.now()
        )
        from apps.realtime.events import schedule_user_event

        schedule_user_event(
            user_id=request.user.pk,
            event_type="notifications.read_all",
            payload={"updated": updated},
        )
        return Response({"updated": updated}, status=status.HTTP_200_OK)


class WorkspaceActivityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):
        workspace, membership = get_workspace_membership(request.user, workspace_id)
        events = ActivityEvent.objects.filter(workspace=workspace)
        if membership.role not in (
            WorkspaceMember.Role.OWNER,
            WorkspaceMember.Role.ADMIN,
        ):
            project_ids = ProjectMember.objects.filter(
                project__workspace=workspace,
                user=request.user,
            ).values_list("project_id", flat=True)
            events = events.filter(Q(project__isnull=True) | Q(project_id__in=project_ids))
        events = events.select_related("actor", "project", "task").order_by(
            "-created_at",
            "-pk",
        )
        paginator = NotificationPagination()
        page = paginator.paginate_queryset(events, request, view=self)
        return paginator.get_paginated_response(
            ActivityEventReadSerializer(page, many=True).data
        )
