from django.db import DatabaseError
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.tasks.attachment_validation import validate_attachment_upload
from apps.tasks.models import TaskAttachment, TaskComment
from apps.tasks.permissions import require_task_participant


def create_task_attachment(
    *,
    access,
    actor,
    upload,
    comment_id=None,
):
    require_task_participant(access, actor)
    metadata = validate_attachment_upload(upload)
    comment = None
    if comment_id is not None:
        comment = TaskComment.objects.filter(
            task=access.task,
            pk=comment_id,
        ).first()
        if comment is None:
            raise ValidationError(
                {"comment_id": "Choose a comment on this task."}
            )

    attachment = TaskAttachment(
        task=access.task,
        comment=comment,
        uploaded_by=actor,
        original_filename=metadata["original_filename"],
        content_type=metadata["content_type"],
        size=metadata["size"],
        sha256=metadata["sha256"],
    )
    attachment.file.save(metadata["original_filename"], upload, save=False)
    try:
        attachment.save()
    except DatabaseError:
        attachment.file.storage.delete(attachment.file.name)
        raise
    return attachment


def get_task_attachment(*, access, attachment_id):
    attachment = (
        TaskAttachment.objects.select_related("comment", "uploaded_by")
        .filter(task=access.task, pk=attachment_id)
        .first()
    )
    if attachment is None:
        raise NotFound("Attachment not found.")
    return attachment


def list_task_attachments(*, access):
    return (
        TaskAttachment.objects.select_related("comment", "uploaded_by")
        .filter(task=access.task)
        .order_by("created_at", "id")
    )


def delete_task_attachment(*, access, actor, attachment_id):
    require_task_participant(access, actor)
    attachment = get_task_attachment(access=access, attachment_id=attachment_id)
    can_delete = (
        access.can_manage
        or attachment.uploaded_by_id == actor.pk
        or (
            attachment.comment_id is not None
            and attachment.comment.author_id == actor.pk
        )
    )
    if not can_delete:
        raise PermissionDenied(
            "Only the uploader, comment author, or a project manager can delete this attachment."
        )
    attachment.delete()
