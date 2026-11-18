from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.notifications.models import ActivityEvent
from apps.tasks.models import TaskActivity


SAFE_METADATA_KEYS = {
    "title",
    "duplicated_from",
    "from_column_id",
    "to_column_id",
    "from_status",
    "to_status",
    "fields",
    "comment_id",
    "parent_comment_id",
    "mentioned_user_ids",
    "user_id",
    "collaborator",
}


def safe_activity_metadata(metadata):
    return {
        key: value
        for key, value in metadata.items()
        if key in SAFE_METADATA_KEYS and isinstance(value, (str, int, float, bool, list))
    }


@receiver(post_save, sender=TaskActivity)
def publish_task_activity(sender, instance, created, **kwargs):
    if not created:
        return
    task = instance.task
    ActivityEvent.objects.get_or_create(
        event_key=f"task-activity:{instance.pk}",
        defaults={
            "workspace_id": task.project.workspace_id,
            "project_id": task.project_id,
            "task_id": task.pk,
            "actor_id": instance.actor_id,
            "event_type": instance.action,
            "object_type": "task",
            "object_id": str(task.pk),
            "metadata": safe_activity_metadata(instance.metadata),
        },
    )
