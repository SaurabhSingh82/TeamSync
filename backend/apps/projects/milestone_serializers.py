from rest_framework import serializers

from apps.projects.models import Milestone


class MilestoneWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = ("title", "description", "due_date", "status")

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Milestone title cannot be blank.")
        return value


class MilestoneReadSerializer(serializers.ModelSerializer):
    project_id = serializers.UUIDField(read_only=True)
    created_by_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Milestone
        fields = (
            "id", "project_id", "title", "description", "due_date", "status",
            "created_by_id", "created_at", "updated_at",
        )
        read_only_fields = fields
