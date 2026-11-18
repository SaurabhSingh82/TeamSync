from config.settings import *


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
INVITATION_SEND_IMMEDIATELY = False

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "anon": "10000/minute",
        "user": "10000/minute",
        "workspace_invitation": "10000/minute",
        "workspace_invitation_send": "10000/minute",
        "invitation_accept": "10000/minute",
        "invitation_accept_v2": "10000/minute",
        "auth_email_v2": "10000/minute",
    },
}
