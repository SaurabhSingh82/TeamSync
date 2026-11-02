import hashlib
import os
import unicodedata
import warnings
from pathlib import PurePosixPath

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.uploadedfile import UploadedFile
from django.utils.text import get_valid_filename
from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import ValidationError


ATTACHMENT_TYPES = {
    ".pdf": ("application/pdf",),
    ".png": ("image/png",),
    ".jpg": ("image/jpeg",),
    ".jpeg": ("image/jpeg",),
    ".gif": ("image/gif",),
    ".webp": ("image/webp",),
    ".txt": ("text/plain",),
    ".csv": ("text/csv", "application/vnd.ms-excel"),
}
IMAGE_FORMATS = {
    ".png": "PNG",
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".gif": "GIF",
    ".webp": "WEBP",
}
MAX_ATTACHMENT_FILENAME_LENGTH = 255
MAX_ATTACHMENT_IMAGE_PIXELS = 40_000_000


def _validate_configured_extensions():
    extensions = {
        extension.lower() if extension.startswith(".") else f".{extension.lower()}"
        for extension in settings.ATTACHMENT_ALLOWED_EXTENSIONS
    }
    unsupported = extensions - ATTACHMENT_TYPES.keys()
    if unsupported:
        raise ImproperlyConfigured(
            "ATTACHMENT_ALLOWED_EXTENSIONS contains unsupported extensions."
        )
    return extensions


def _safe_original_filename(filename):
    normalized = unicodedata.normalize("NFC", filename.replace("\\", "/"))
    basename = PurePosixPath(normalized).name
    if not basename or basename in {".", ".."}:
        raise ValidationError({"file": "Provide a valid filename."})
    if any(ord(character) < 32 or ord(character) == 127 for character in basename):
        raise ValidationError({"file": "Filenames cannot contain control characters."})
    safe_name = get_valid_filename(basename).strip()
    if not safe_name or safe_name in {".", ".."}:
        raise ValidationError({"file": "Provide a valid filename."})
    if len(safe_name) > MAX_ATTACHMENT_FILENAME_LENGTH:
        raise ValidationError(
            {"file": "Filenames must be 255 characters or fewer."}
        )
    return safe_name


def _validate_image(upload, extension):
    expected_format = IMAGE_FORMATS[extension]
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(upload)
            if image.format != expected_format:
                raise ValidationError(
                    {"file": "The file content does not match its extension."}
                )
            if image.width * image.height > MAX_ATTACHMENT_IMAGE_PIXELS:
                raise ValidationError(
                    {"file": "Image dimensions exceed the allowed limit."}
                )
            image.verify()
    except ValidationError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValidationError(
            {"file": "Image dimensions exceed the allowed limit."}
        ) from exc
    except (OSError, UnidentifiedImageError) as exc:
        raise ValidationError({"file": "The image file is invalid."}) from exc
    finally:
        upload.seek(0)


def _validate_text(upload):
    decoder = None
    from codecs import getincrementaldecoder

    decoder = getincrementaldecoder("utf-8-sig")("strict")
    try:
        while chunk := upload.read(8192):
            if b"\x00" in chunk:
                raise UnicodeDecodeError("utf-8", chunk, 0, 1, "NUL byte")
            decoder.decode(chunk)
        decoder.decode(b"", final=True)
    except UnicodeDecodeError as exc:
        raise ValidationError({"file": "Text files must contain valid UTF-8."}) from exc
    finally:
        upload.seek(0)


def validate_attachment_upload(upload):
    if not isinstance(upload, UploadedFile):
        raise ValidationError({"file": "Choose a file to upload."})
    maximum_size = settings.ATTACHMENT_MAX_SIZE_BYTES
    if maximum_size <= 0:
        raise ImproperlyConfigured("ATTACHMENT_MAX_SIZE_BYTES must be positive.")
    if upload.size <= 0:
        raise ValidationError({"file": "Empty files cannot be uploaded."})
    if upload.size > maximum_size:
        raise ValidationError(
            {"file": f"Files must be {maximum_size} bytes or smaller."}
        )

    filename = _safe_original_filename(upload.name)
    extension = os.path.splitext(filename)[1].lower()
    allowed_extensions = _validate_configured_extensions()
    if extension not in allowed_extensions:
        raise ValidationError({"file": "This file extension is not allowed."})

    content_type = upload.content_type or ""
    allowed_content_types = ATTACHMENT_TYPES[extension]
    if content_type not in allowed_content_types:
        raise ValidationError(
            {"file": "The declared file type does not match an allowed type."}
        )

    if extension == ".pdf":
        if not upload.read(8).startswith(b"%PDF-"):
            upload.seek(0)
            raise ValidationError({"file": "The PDF file content is invalid."})
        upload.seek(0)
    elif extension in IMAGE_FORMATS:
        _validate_image(upload, extension)
    else:
        _validate_text(upload)

    digest = hashlib.sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    return {
        "original_filename": filename,
        "content_type": content_type,
        "size": upload.size,
        "sha256": digest.hexdigest(),
    }
