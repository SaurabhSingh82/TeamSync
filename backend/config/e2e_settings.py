from config.settings import *


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / ".test-e2e.sqlite3",
    }
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "anon": "1000/minute",
        "user": "1000/minute",
        "workspace_invitation": "1000/minute",
        "invitation_accept": "1000/minute",
        "invitation_accept_v2": "1000/minute",
        "auth_email_v2": "1000/minute",
    },
}
