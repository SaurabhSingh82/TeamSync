from django.core.exceptions import ImproperlyConfigured

from config.settings import *


if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise ImproperlyConfigured(
        "PostgreSQL-specific tests require a PostgreSQL DATABASE_URL."
    )

DATABASES["default"]["CONN_MAX_AGE"] = 0
