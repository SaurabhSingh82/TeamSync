from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import update_last_login
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from apps.users.authentication import CookieAuthChallenge, enforce_csrf
from apps.users.serializers import (
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegistrationSerializer,
    UserProfileSerializer,
)
from apps.users.services import (
    EMAIL_VERIFICATION_MAX_AGE,
    EMAIL_VERIFICATION_SALT,
    send_email_verification,
    send_password_reset,
)

User = get_user_model()


def set_auth_cookies(response, access_token, refresh_token=None):
    common = {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "domain": settings.AUTH_COOKIE_DOMAIN,
    }
    response.set_cookie(
        settings.AUTH_ACCESS_COOKIE,
        str(access_token),
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        path=settings.AUTH_ACCESS_COOKIE_PATH,
        **common,
    )
    if refresh_token is not None:
        response.set_cookie(
            settings.AUTH_REFRESH_COOKIE,
            str(refresh_token),
            max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            path=settings.AUTH_REFRESH_COOKIE_PATH,
            **common,
        )


def clear_auth_cookies(response):
    common = {
        "domain": settings.AUTH_COOKIE_DOMAIN,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
    }
    response.delete_cookie(
        settings.AUTH_ACCESS_COOKIE,
        path=settings.AUTH_ACCESS_COOKIE_PATH,
        **common,
    )
    response.delete_cookie(
        settings.AUTH_REFRESH_COOKIE,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        **common,
    )


class CsrfTokenView(APIView):
    authentication_classes = [CookieAuthChallenge]
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class RegisterView(APIView):
    authentication_classes = [CookieAuthChallenge]
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_register"

    def post(self, request):
        enforce_csrf(request._request)
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = serializer.save()
            send_email_verification(user)
        return Response(
            {"user": UserProfileSerializer(user, context={"request": request}).data},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    authentication_classes = [CookieAuthChallenge]
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        enforce_csrf(request._request)
        identifier = request.data.get("identifier")
        password = request.data.get("password")
        if not isinstance(identifier, str) or not isinstance(password, str):
            raise ValidationError({"detail": "Enter a username or email and password."})

        identifier = identifier.strip()
        if "@" in identifier:
            user_record = User.objects.filter(email__iexact=identifier).only("username").first()
            username = user_record.username if user_record else identifier
        else:
            username = identifier
        user = authenticate(request=request, username=username, password=password)
        if user is None:
            raise AuthenticationFailed("Invalid username/email or password.")

        refresh = RefreshToken.for_user(user)
        update_last_login(None, user)
        response = Response({"user": UserProfileSerializer(user, context={"request": request}).data})
        set_auth_cookies(response, refresh.access_token, refresh)
        return response


class LogoutView(APIView):
    authentication_classes = [CookieAuthChallenge]
    permission_classes = [AllowAny]

    def post(self, request):
        enforce_csrf(request._request)
        raw_refresh = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_auth_cookies(response)
        return response


class RefreshView(APIView):
    authentication_classes = [CookieAuthChallenge]
    permission_classes = [AllowAny]

    def post(self, request):
        enforce_csrf(request._request)
        raw_refresh = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE)
        if not raw_refresh:
            raise AuthenticationFailed("Authentication session has expired.")

        serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken("Authentication session has expired.") from exc
        response = Response(status=status.HTTP_204_NO_CONTENT)
        set_auth_cookies(
            response,
            serializer.validated_data["access"],
            serializer.validated_data.get("refresh", raw_refresh),
        )
        return response


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserProfileSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = UserProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        email_changed = (
            "email" in serializer.validated_data
            and serializer.validated_data["email"].casefold() != request.user.email.casefold()
        )
        old_avatar = request.user.avatar
        user = serializer.save()
        if email_changed:
            user.email_verified = False
            user.save(update_fields=["email_verified"])
            send_email_verification(user)
        if old_avatar and old_avatar.name != user.avatar.name:
            old_avatar.storage.delete(old_avatar.name)
        return Response(UserProfileSerializer(user, context={"request": request}).data)


class PasswordResetRequestView(APIView):
    authentication_classes = [CookieAuthChallenge]
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_email"

    def post(self, request):
        enforce_csrf(request._request)
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data["email"]).first()
        if user is not None and user.is_active:
            send_password_reset(user)
        return Response(
            {"detail": "If that email is registered, password-reset instructions have been sent."},
            status=status.HTTP_202_ACCEPTED,
        )


class PasswordResetConfirmView(APIView):
    authentication_classes = [CookieAuthChallenge]
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_email"

    def post(self, request):
        enforce_csrf(request._request)
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user_id = force_str(urlsafe_base64_decode(serializer.validated_data["uid"]))
            user = User.objects.get(pk=user_id, is_active=True)
        except (DjangoValidationError, TypeError, ValueError, User.DoesNotExist) as exc:
            raise ValidationError({"detail": "The password-reset link is invalid or expired."}) from exc

        if not default_token_generator.check_token(user, serializer.validated_data["token"]):
            raise ValidationError({"detail": "The password-reset link is invalid or expired."})

        try:
            validate_password(serializer.validated_data["password"], user=user)
        except DjangoValidationError as exc:
            raise ValidationError({"password": list(exc.messages)}) from exc

        with transaction.atomic():
            user.set_password(serializer.validated_data["password"])
            user.save(update_fields=["password"])
            outstanding = OutstandingToken.objects.filter(user=user).exclude(
                blacklistedtoken__isnull=False
            )
            BlacklistedToken.objects.bulk_create(
                [BlacklistedToken(token=token) for token in outstanding],
                ignore_conflicts=True,
            )
        return Response({"detail": "Your password has been updated."})


class EmailVerificationView(APIView):
    authentication_classes = [CookieAuthChallenge]
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_email"

    def post(self, request):
        enforce_csrf(request._request)
        token = request.data.get("token")
        if not isinstance(token, str):
            raise ValidationError({"detail": "The verification link is invalid or expired."})
        try:
            data = signing.loads(
                token,
                salt=EMAIL_VERIFICATION_SALT,
                max_age=EMAIL_VERIFICATION_MAX_AGE,
            )
            user = User.objects.get(
                pk=data["user_id"],
                email=data["email"],
                is_active=True,
            )
        except (signing.BadSignature, KeyError, TypeError, ValueError, User.DoesNotExist) as exc:
            raise ValidationError(
                {"detail": "The verification link is invalid or expired."}
            ) from exc

        if not user.email_verified:
            user.email_verified = True
            user.save(update_fields=["email_verified"])
        return Response({"detail": "Your email address has been verified."})
