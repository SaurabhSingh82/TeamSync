from datetime import timedelta
from pathlib import Path
import os

import environ
from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
ENV_FILE = Path(os.environ.get("TEAMSYNC_ENV_FILE", ROOT_DIR / ".env"))

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DJANGO_ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, []),
    CSRF_TRUSTED_ORIGINS=(list, []),
)
env.read_env(ENV_FILE)

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")
if not DEBUG:
    missing_production_settings = [
        name
        for name in ("DJANGO_ALLOWED_HOSTS", "DATABASE_URL")
        if not os.environ.get(name, "").strip()
    ]
    if missing_production_settings:
        raise ImproperlyConfigured(
            "Production configuration is missing required settings: "
            + ", ".join(missing_production_settings)
        )
SECURE_PROXY_SSL_HEADER = None
proxy_ssl_header = env("SECURE_PROXY_SSL_HEADER", default="").strip()
if proxy_ssl_header:
    header_parts = proxy_ssl_header.split(",", maxsplit=1)
    if len(header_parts) != 2 or not header_parts[0].startswith("HTTP_"):
        raise ImproperlyConfigured(
            "SECURE_PROXY_SSL_HEADER must contain an HTTP header name and value."
        )
    SECURE_PROXY_SSL_HEADER = (header_parts[0], header_parts[1])

SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=not DEBUG)
SECURE_HSTS_SECONDS = env.int(
    "SECURE_HSTS_SECONDS",
    default=0 if DEBUG else 31_536_000,
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=not DEBUG,
)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=not DEBUG)
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=not DEBUG)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "channels",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.core",
    "apps.users",
    "apps.workspaces",
    "apps.projects",
    "apps.tasks",
    "apps.notifications",
    "apps.dashboard",
    "apps.search",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "apps.core.middleware.RequestContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

if env("REDIS_URL", default=""):
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [env("REDIS_URL")]},
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    }

DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://teamsync:replace-this-password@127.0.0.1:5432/teamsync",
    )
}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DATABASE_CONN_MAX_AGE", default=60)

AUTH_USER_MODEL = "users.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS")

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.users.authentication.CookieJWTAuthentication",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/minute",
        "user": "120/minute",
        "auth_login": "10/minute",
        "auth_register": env("AUTH_REGISTER_RATE", default="10/hour"),
        "auth_email": "5/hour",
        "auth_email_v2": env(
            "AUTH_EMAIL_RATE",
            default="1000/hour" if DEBUG else "5/hour",
        ),
        "workspace_invitation": "10/hour",
        "workspace_invitation_send": env(
            "WORKSPACE_INVITATION_SEND_RATE",
            default="1000/hour" if DEBUG else "10/hour",
        ),
        "invitation_accept": env(
            "INVITATION_ACCEPT_RATE",
            default="1000/hour" if DEBUG else "10/hour",
        ),
        "invitation_accept_v2": env(
            "INVITATION_ACCEPT_RATE",
            default="1000/hour" if DEBUG else "10/hour",
        ),
    },
}

AUTH_COOKIE_DOMAIN = env("AUTH_COOKIE_DOMAIN", default=None)
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=not DEBUG)
AUTH_COOKIE_SAMESITE = env("AUTH_COOKIE_SAMESITE", default="Lax")
AUTH_ACCESS_COOKIE = "teamsync_access"
AUTH_REFRESH_COOKIE = "teamsync_refresh"
AUTH_ACCESS_COOKIE_PATH = "/"
AUTH_REFRESH_COOKIE_PATH = "/api/auth/"

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=5),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
}

EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default=env(
        "DJANGO_EMAIL_BACKEND",
        default=(
            "apps.core.email_backends.InteractiveConsoleEmailBackend"
            if DEBUG
            else "django.core.mail.backends.smtp.EmailBackend"
        ),
    ),
)
if EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend":
    EMAIL_BACKEND = "apps.core.email_backends.InteractiveConsoleEmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=False)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="TeamSync <noreply@localhost>")
if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise ImproperlyConfigured(
        "EMAIL_USE_TLS and EMAIL_USE_SSL cannot both be enabled."
    )
if not DEBUG:
    if EMAIL_BACKEND != "django.core.mail.backends.smtp.EmailBackend":
        raise ImproperlyConfigured(
            "Production email requires the authenticated SMTP backend."
        )
    required_email_settings = {
        "EMAIL_HOST": EMAIL_HOST,
        "EMAIL_HOST_USER": EMAIL_HOST_USER,
        "EMAIL_HOST_PASSWORD": EMAIL_HOST_PASSWORD,
        "DEFAULT_FROM_EMAIL": os.environ.get("DEFAULT_FROM_EMAIL", "").strip(),
    }
    missing_email_settings = [
        name for name, value in required_email_settings.items() if not value.strip()
    ]
    if missing_email_settings:
        raise ImproperlyConfigured(
            "Production SMTP is missing required settings: "
            + ", ".join(missing_email_settings)
        )
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:5173").rstrip("/")
INVITATION_SEND_IMMEDIATELY = env.bool(
    "INVITATION_SEND_IMMEDIATELY",
    default=DEBUG,
)
if not DEBUG and not FRONTEND_BASE_URL.startswith("https://"):
    raise ImproperlyConfigured(
        "Production FRONTEND_BASE_URL must be an HTTPS URL."
    )

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
PRIVATE_ATTACHMENT_ROOT = Path(
    env("PRIVATE_ATTACHMENT_ROOT", default=BASE_DIR / "private_attachments")
)
if not PRIVATE_ATTACHMENT_ROOT.is_absolute():
    PRIVATE_ATTACHMENT_ROOT = BASE_DIR / PRIVATE_ATTACHMENT_ROOT
PRIVATE_ATTACHMENT_ROOT = PRIVATE_ATTACHMENT_ROOT.resolve()
ATTACHMENT_MAX_SIZE_BYTES = env.int(
    "ATTACHMENT_MAX_SIZE_BYTES",
    default=10 * 1024 * 1024,
)
ATTACHMENT_ALLOWED_EXTENSIONS = env.list(
    "ATTACHMENT_ALLOWED_EXTENSIONS",
    default=[".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".txt", ".csv"],
)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {"()": "apps.core.logging.JsonLogFormatter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "loggers": {
        "teamsync.request": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}
