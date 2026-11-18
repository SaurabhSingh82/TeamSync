from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def workspace_group(workspace_id):
    return f"workspace.{workspace_id}"


def project_group(project_id):
    return f"project.{project_id}"


def user_group(user_id):
    return f"user.{user_id}"


def broadcast_event(*, group, event_type, payload):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        group,
        {
            "type": "teamsync.event",
            "event_type": event_type,
            "payload": payload,
        },
    )


def schedule_event(*, group, event_type, payload):
    from django.db import transaction

    transaction.on_commit(
        lambda: broadcast_event(
            group=group,
            event_type=event_type,
            payload=payload,
        )
    )


def schedule_workspace_event(*, workspace_id, event_type, payload=None):
    schedule_event(
        group=workspace_group(workspace_id),
        event_type=event_type,
        payload=payload or {"workspace_id": str(workspace_id)},
    )


def schedule_project_event(*, project_id, event_type, payload=None):
    schedule_event(
        group=project_group(project_id),
        event_type=event_type,
        payload=payload or {"project_id": str(project_id)},
    )


def schedule_user_event(*, user_id, event_type, payload):
    schedule_event(
        group=user_group(user_id),
        event_type=event_type,
        payload=payload,
    )
