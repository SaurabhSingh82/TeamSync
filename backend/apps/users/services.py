from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

EMAIL_VERIFICATION_SALT = "teamsync.email-verification"
EMAIL_VERIFICATION_MAX_AGE = 60 * 60 * 24


def send_email_verification(user):
    token = signing.dumps(
        {"user_id": str(user.pk), "email": user.email},
        salt=EMAIL_VERIFICATION_SALT,
    )
    link = f"{settings.FRONTEND_BASE_URL}/verify-email?{urlencode({'token': token})}"
    send_mail(
        subject="Verify your TeamSync email",
        message=f"Verify your email address using this link:\n\n{link}",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )


def send_password_reset(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = (
        f"{settings.FRONTEND_BASE_URL}/reset-password?"
        f"{urlencode({'uid': uid, 'token': token})}"
    )
    send_mail(
        subject="Reset your TeamSync password",
        message=f"Reset your password using this link:\n\n{link}",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )
