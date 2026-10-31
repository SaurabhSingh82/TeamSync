from pathlib import Path
import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


def avatar_upload_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"avatars/{instance.pk}/{uuid.uuid4().hex}{extension}"


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    email_verified = models.BooleanField(default=False)
    bio = models.CharField(max_length=500, blank=True)
    timezone = models.CharField(max_length=64, default="UTC")
    avatar = models.ImageField(upload_to=avatar_upload_path, blank=True)
