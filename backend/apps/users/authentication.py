from django.conf import settings
from rest_framework.authentication import BaseAuthentication, CSRFCheck
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication


def enforce_csrf(request):
    def dummy_view(_request):
        return None

    check = CSRFCheck(dummy_view)
    check.process_request(request)
    reason = check.process_view(request, dummy_view, (), {})
    if reason:
        raise PermissionDenied("CSRF verification failed.")


class CookieAuthChallenge(BaseAuthentication):
    def authenticate(self, request):
        return None

    def authenticate_header(self, request):
        return "Cookie"


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw_token = request.COOKIES.get(settings.AUTH_ACCESS_COOKIE)
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            enforce_csrf(request._request)

        return self.get_user(validated_token), validated_token
