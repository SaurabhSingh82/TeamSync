from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from rest_framework import serializers

from apps.users.models import User

MAX_AVATAR_SIZE = 5 * 1024 * 1024
MAX_AVATAR_DIMENSION = 4096
MAX_AVATAR_PIXELS = 16_000_000
ALLOWED_AVATAR_FORMATS = {"JPEG", "PNG", "WEBP"}


class AvatarImageField(serializers.ImageField):
    def to_internal_value(self, data):
        if getattr(data, "size", 0) > MAX_AVATAR_SIZE:
            raise serializers.ValidationError("Avatar files must be 5 MB or smaller.")
        return super().to_internal_value(data)


class RegistrationSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_password(self, value):
        validate_password(
            value,
            user=User(
                username=self.initial_data.get("username", ""),
                email=self.initial_data.get("email", ""),
                first_name=self.initial_data.get("first_name", ""),
                last_name=self.initial_data.get("last_name", ""),
            ),
        )
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class UserProfileSerializer(serializers.ModelSerializer):
    avatar = AvatarImageField(required=False)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "email_verified",
            "first_name",
            "last_name",
            "bio",
            "timezone",
            "avatar",
            "date_joined",
        )
        read_only_fields = ("id", "email_verified", "date_joined")

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(~Q(pk=self.instance.pk), email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_timezone(self, value):
        value = value.strip()
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise serializers.ValidationError("Enter a valid IANA time zone.") from exc
        return value

    def validate_avatar(self, image):
        if image is None:
            return image

        opened_image = image.image
        image_format = getattr(opened_image, "format", None)
        width, height = opened_image.size
        if image_format not in ALLOWED_AVATAR_FORMATS:
            raise serializers.ValidationError("Use a JPEG, PNG, or WebP image.")
        if (
            width > MAX_AVATAR_DIMENSION
            or height > MAX_AVATAR_DIMENSION
            or width * height > MAX_AVATAR_PIXELS
        ):
            raise serializers.ValidationError("Avatar dimensions must not exceed 4096 by 4096.")
        image.name = {
            "JPEG": "avatar.jpg",
            "PNG": "avatar.png",
            "WEBP": "avatar.webp",
        }[image_format]
        return image

class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
