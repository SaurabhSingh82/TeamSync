from rest_framework import serializers

from apps.notifications.models import Notification


class NotificationPreferenceSerializer(serializers.Serializer):
    categories = serializers.DictField(
        child=serializers.BooleanField(),
        required=False,
    )

    def validate_categories(self, value):
        allowed = {choice for choice, _label in Notification.Kind.choices}
        unknown = set(value) - allowed
        if unknown:
            raise serializers.ValidationError(
                f"Unknown notification categories: {', '.join(sorted(unknown))}."
            )
        return value
