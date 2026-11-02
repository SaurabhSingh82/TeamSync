from pathlib import Path

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils.functional import cached_property


class PrivateAttachmentStorage(FileSystemStorage):
    def __init__(self):
        super().__init__(
            location=None,
            base_url=None,
            file_permissions_mode=0o600,
            directory_permissions_mode=0o700,
        )

    @cached_property
    def location(self):
        return str(Path(settings.PRIVATE_ATTACHMENT_ROOT).resolve())

    def url(self, name):
        raise ValueError(
            "Private attachments must be retrieved through the authorized API."
        )


private_attachment_storage = PrivateAttachmentStorage()
