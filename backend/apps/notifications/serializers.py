from rest_framework import serializers

from apps.notifications.models import ActivityEvent, Notification


def user_display_name(user):
    if user is None:
        return "TeamSync"
    return user.get_full_name().strip() or user.get_username()


class NotificationReadSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = (
            "id",
            "kind",
            "title",
            "message",
            "target_url",
            "metadata",
            "actor_name",
            "created_at",
            "read_at",
        )
        read_only_fields = fields

    def get_actor_name(self, notification):
        return user_display_name(notification.actor)


class ActivityEventReadSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    project_name = serializers.CharField(source="project.name", read_only=True, default="")
    task_title = serializers.CharField(source="task.title", read_only=True, default="")

    class Meta:
        model = ActivityEvent
        fields = (
            "id",
            "event_type",
            "object_type",
            "object_id",
            "actor_name",
            "project_id",
            "project_name",
            "task_id",
            "task_title",
            "metadata",
            "created_at",
        )
        read_only_fields = fields

    def get_actor_name(self, event):
        return user_display_name(event.actor)
