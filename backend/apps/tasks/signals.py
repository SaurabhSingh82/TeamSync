from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from apps.tasks.models import TaskAttachment


@receiver(post_delete, sender=TaskAttachment)
def remove_attachment_file_after_delete(sender, instance, **kwargs):
    file_name = instance.file.name
    storage = instance.file.storage
    if file_name:
        transaction.on_commit(lambda: storage.delete(file_name))
