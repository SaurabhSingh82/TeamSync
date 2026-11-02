from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.notifications.models import ActivityEvent, Notification
from apps.projects.models import ProjectMember
from apps.tasks.models import Task, TaskAssignee, TaskCollaborator
from apps.workspaces.models import WorkspaceMember


def create_notification(
    *,
    recipient,
    workspace,
    kind,
    title,
    event_key,
    actor=None,
    task=None,
    message="",
    target_url="",
    metadata=None,
):
    notification, _ = Notification.objects.get_or_create(
        event_key=event_key,
        defaults={
            "recipient": recipient,
            "actor": actor,
            "workspace": workspace,
            "task": task,
            "kind": kind,
            "title": title,
            "message": message,
            "target_url": target_url,
            "metadata": metadata or {},
        },
    )
    return notification


def create_activity_event(
    *,
    workspace,
    event_type,
    object_type,
    object_id,
    event_key,
    actor=None,
    project=None,
    task=None,
    metadata=None,
):
    event, _ = ActivityEvent.objects.get_or_create(
        event_key=event_key,
        defaults={
            "workspace": workspace,
            "project": project,
            "task": task,
            "actor": actor,
            "event_type": event_type,
            "object_type": object_type,
            "object_id": str(object_id),
            "metadata": metadata or {},
        },
    )
    return event


def notify_task_assigned(*, task, actor, recipient, assignment_id, collaborator=False):
    if recipient.pk == getattr(actor, "pk", None):
        return
    create_notification(
        recipient=recipient,
        workspace=task.project.workspace,
        task=task,
        actor=actor,
        kind=Notification.Kind.TASK_ASSIGNED,
        title="You were added to a task",
        message=task.title,
        target_url=f"/workspaces/{task.project.workspace_id}/projects/{task.project_id}/tasks/{task.pk}",
        event_key=f"task-assigned:{assignment_id}",
        metadata={
            "task_id": str(task.pk),
            "project_id": str(task.project_id),
            "collaborator": collaborator,
        },
    )


def notify_task_unassigned(*, task, actor, recipient, assignment_id, collaborator=False):
    if recipient.pk == getattr(actor, "pk", None):
        return
    create_notification(
        recipient=recipient,
        workspace=task.project.workspace,
        task=task,
        actor=actor,
        kind=Notification.Kind.TASK_UNASSIGNED,
        title="You were removed from a task",
        message=task.title,
        target_url=f"/workspaces/{task.project.workspace_id}/projects/{task.project_id}/tasks/{task.pk}",
        event_key=f"task-unassigned:{assignment_id}",
        metadata={
            "task_id": str(task.pk),
            "project_id": str(task.project_id),
            "collaborator": collaborator,
        },
    )


def notify_task_comment(*, task, actor, comment, mentioned_user_ids=()):
    participant_ids = set(
        TaskAssignee.objects.filter(task=task).values_list(
            "project_member__user_id",
            flat=True,
        )
    )
    participant_ids.update(
        TaskCollaborator.objects.filter(task=task).values_list(
            "project_member__user_id",
            flat=True,
        )
    )
    if task.creator_id:
        participant_ids.add(task.creator_id)
    participant_ids.difference_update(mentioned_user_ids)
    participant_ids.discard(actor.pk)
    for recipient in get_user_model().objects.filter(pk__in=participant_ids):
        create_notification(
            recipient=recipient,
            workspace=task.project.workspace,
            task=task,
            actor=actor,
            kind=Notification.Kind.TASK_COMMENT,
            title="New comment on a task",
            message=task.title,
            target_url=f"/workspaces/{task.project.workspace_id}/projects/{task.project_id}/tasks/{task.pk}",
            event_key=f"task-comment:{comment.pk}:{recipient.pk}",
            metadata={"task_id": str(task.pk), "comment_id": str(comment.pk)},
        )


def notify_task_mentions(*, task, actor, comment, recipient_ids):
    for recipient in get_user_model().objects.filter(pk__in=set(recipient_ids)):
        if recipient.pk == actor.pk:
            continue
        create_notification(
            recipient=recipient,
            workspace=task.project.workspace,
            task=task,
            actor=actor,
            kind=Notification.Kind.TASK_MENTION,
            title="You were mentioned in a task comment",
            message=task.title,
            target_url=f"/workspaces/{task.project.workspace_id}/projects/{task.project_id}/tasks/{task.pk}",
            event_key=f"task-mention:{comment.pk}:{recipient.pk}",
            metadata={"task_id": str(task.pk), "comment_id": str(comment.pk)},
        )


def notify_workspace_invitation(*, invitation):
    user_model = get_user_model()
    recipient = user_model.objects.filter(
        email__iexact=invitation.email,
    ).first()
    create_activity_event(
        workspace=invitation.workspace,
        actor=invitation.invited_by,
        event_type="invitation_created",
        object_type="workspace_invitation",
        object_id=invitation.pk,
        event_key=f"workspace-invitation-created:{invitation.pk}",
        metadata={"role": invitation.role},
    )
    if recipient is None:
        return None
    return create_notification(
        recipient=recipient,
        workspace=invitation.workspace,
        actor=invitation.invited_by,
        kind=Notification.Kind.WORKSPACE_INVITATION,
        title="You were invited to a workspace",
        message=f"{invitation.workspace.name} - check your email to accept.",
        target_url="",
        event_key=f"workspace-invitation:{invitation.pk}:{recipient.pk}",
        metadata={
            "invitation_id": str(invitation.pk),
            "workspace_id": str(invitation.workspace_id),
        },
    )


def notify_invitation_accepted(*, invitation, user):
    create_activity_event(
        workspace=invitation.workspace,
        actor=user,
        event_type="invitation_accepted",
        object_type="workspace_invitation",
        object_id=invitation.pk,
        event_key=f"workspace-invitation-accepted:{invitation.pk}",
        metadata={"role": invitation.role},
    )
    if invitation.invited_by_id and invitation.invited_by_id != user.pk:
        create_notification(
            recipient=invitation.invited_by,
            workspace=invitation.workspace,
            actor=user,
            kind=Notification.Kind.INVITATION_ACCEPTED,
            title="Your workspace invitation was accepted",
            message=invitation.workspace.name,
            event_key=f"invitation-accepted:{invitation.pk}:{invitation.invited_by_id}",
            metadata={
                "invitation_id": str(invitation.pk),
                "workspace_id": str(invitation.workspace_id),
            },
        )


def dispatch_deadline_reminders(*, as_of=None):
    today = as_of or timezone.localdate()
    tasks = (
        Task.objects.filter(
            archived_at__isnull=True,
            project__archived_at__isnull=True,
            due_date__isnull=False,
            status__in=(Task.Status.TODO, Task.Status.IN_PROGRESS, Task.Status.REVIEW),
        )
        .filter(due_date__lte=today)
        .select_related("project__workspace")
        .prefetch_related("assignees__user")
        .order_by("due_date", "pk")
    )
    created = 0
    for task in tasks.iterator(chunk_size=100):
        kind = (
            Notification.Kind.DEADLINE_TODAY
            if task.due_date == today
            else Notification.Kind.DEADLINE_OVERDUE
        )
        recipients = {member.user for member in task.assignees.all()}
        if task.creator_id:
            recipients.add(task.creator)
        valid_user_ids = set(
            WorkspaceMember.objects.filter(
                workspace_id=task.project.workspace_id,
                user_id__in=[recipient.pk for recipient in recipients],
            ).exclude(role=WorkspaceMember.Role.VIEWER).values_list("user_id", flat=True)
        )
        valid_user_ids.intersection_update(
            ProjectMember.objects.filter(
                project_id=task.project_id,
                user_id__in=valid_user_ids,
            ).values_list("user_id", flat=True)
        )
        for recipient in recipients:
            if recipient.pk not in valid_user_ids:
                continue
            event_key = (
                f"deadline:{task.pk}:{task.due_date.isoformat()}:"
                f"{kind}:{recipient.pk}"
            )
            _, was_created = Notification.objects.get_or_create(
                event_key=event_key,
                defaults={
                    "recipient": recipient,
                    "workspace_id": task.project.workspace_id,
                    "task": task,
                    "kind": kind,
                    "title": (
                        "Task is due today"
                        if kind == Notification.Kind.DEADLINE_TODAY
                        else "Task is overdue"
                    ),
                    "message": task.title,
                    "target_url": (
                        f"/workspaces/{task.project.workspace_id}/projects/"
                        f"{task.project_id}/tasks/{task.pk}"
                    ),
                    "metadata": {
                        "task_id": str(task.pk),
                        "due_date": task.due_date.isoformat(),
                    },
                },
            )
            created += int(was_created)
            if was_created:
                create_activity_event(
                    workspace=task.project.workspace,
                    project=task.project,
                    task=task,
                    event_type=kind,
                    object_type="task",
                    object_id=task.pk,
                    event_key=f"activity:{event_key}",
                    metadata={"due_date": task.due_date.isoformat()},
                )
    return created
