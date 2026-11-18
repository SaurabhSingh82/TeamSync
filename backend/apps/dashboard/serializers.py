from rest_framework import serializers

from apps.projects.models import Project
from apps.tasks.models import Task


class UpcomingTaskSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    workspace_id = serializers.UUIDField(
        source="project.workspace_id",
        read_only=True,
    )

    class Meta:
        model = Task
        fields = (
            "id",
            "title",
            "project_id",
            "project_name",
            "workspace_id",
            "status",
            "priority",
            "due_date",
        )
        read_only_fields = fields


class ProjectProgressSerializer(serializers.ModelSerializer):
    task_count = serializers.IntegerField(read_only=True)
    completed_task_count = serializers.IntegerField(read_only=True)
    progress_percent = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            "id",
            "workspace_id",
            "name",
            "status",
            "due_date",
            "task_count",
            "completed_task_count",
            "progress_percent",
        )
        read_only_fields = fields

    def get_progress_percent(self, project):
        if project.task_count == 0:
            return 0
        return round(project.completed_task_count * 100 / project.task_count)


class CalendarEventSerializer(serializers.Serializer):
    event_date = serializers.DateField()
    event_type = serializers.CharField()
    event_title = serializers.CharField()
    object_id = serializers.CharField()
    event_project_id = serializers.UUIDField()
    event_workspace_id = serializers.UUIDField()
    event_project_name = serializers.CharField()
    event_status = serializers.CharField()
    event_priority = serializers.CharField()
    event_description = serializers.CharField(allow_blank=True, required=False)
