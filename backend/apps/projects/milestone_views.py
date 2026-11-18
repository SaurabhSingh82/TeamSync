from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.models import Milestone
from apps.projects.milestone_serializers import (
    MilestoneReadSerializer,
    MilestoneWriteSerializer,
)
from apps.projects.permissions import get_project_access, require_project_manager


class ProjectMilestoneListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        access = get_project_access(request.user, project_id)
        milestones = Milestone.objects.filter(project=access.project)
        return Response(MilestoneReadSerializer(milestones, many=True).data)

    def post(self, request, project_id):
        serializer = MilestoneWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_project_access(request.user, project_id, lock=True)
            require_project_manager(access)
            milestone = Milestone.objects.create(
                project=access.project,
                created_by=request.user,
                **serializer.validated_data,
            )
            from apps.realtime.events import schedule_project_event

            schedule_project_event(
                project_id=access.project.pk,
                event_type="milestone.created",
                payload={"milestone_id": str(milestone.pk)},
            )
        return Response(
            MilestoneReadSerializer(milestone).data,
            status=status.HTTP_201_CREATED,
        )


class ProjectMilestoneDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, milestone_id):
        serializer = MilestoneWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            milestone = get_object_or_404(
                Milestone.objects.select_for_update().select_related("project"),
                pk=milestone_id,
            )
            access = get_project_access(request.user, milestone.project_id, lock=True)
            require_project_manager(access)
            for key, value in serializer.validated_data.items():
                setattr(milestone, key, value)
            milestone.save()
            from apps.realtime.events import schedule_project_event

            schedule_project_event(
                project_id=milestone.project_id,
                event_type="milestone.updated",
                payload={"milestone_id": str(milestone.pk)},
            )
        return Response(MilestoneReadSerializer(milestone).data)

    def delete(self, request, milestone_id):
        with transaction.atomic():
            milestone = get_object_or_404(
                Milestone.objects.select_for_update().select_related("project"),
                pk=milestone_id,
            )
            access = get_project_access(request.user, milestone.project_id, lock=True)
            require_project_manager(access)
            project_id = milestone.project_id
            milestone_id = milestone.pk
            milestone.delete()
            from apps.realtime.events import schedule_project_event

            schedule_project_event(
                project_id=project_id,
                event_type="milestone.deleted",
                payload={"milestone_id": str(milestone_id)},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
