from django.utils import timezone
from rest_framework import serializers

from apps.workspaces.models import (
    Workspace,
    WorkspaceInvitation,
    WorkspaceInvitationEmail,
    WorkspaceMember,
)


class WorkspaceWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ("name", "description")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Workspace name cannot be blank.")
        return value

    def validate_description(self, value):
        if len(value) > 5000:
            raise serializers.ValidationError("Description must be 5000 characters or fewer.")
        return value.strip()


class WorkspaceReadSerializer(serializers.ModelSerializer):
    current_user_role = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = (
            "id",
            "name",
            "description",
            "owner_id",
            "current_user_role",
            "archived_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_current_user_role(self, workspace):
        role = getattr(workspace, "current_user_role", None)
        if role is not None:
            return role

        membership = self.context.get("membership")
        if membership is not None:
            return membership.role

        request = self.context["request"]
        return WorkspaceMember.objects.filter(
            workspace=workspace,
            user=request.user,
        ).values_list("role", flat=True).first()


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    avatar_url = serializers.ImageField(
        source="user.avatar",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = WorkspaceMember
        fields = (
            "id",
            "user_id",
            "username",
            "first_name",
            "last_name",
            "avatar_url",
            "role",
            "joined_at",
        )
        read_only_fields = fields


class WorkspaceMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=(
            WorkspaceMember.Role.ADMIN,
            WorkspaceMember.Role.MEMBER,
            WorkspaceMember.Role.VIEWER,
        )
    )


class WorkspaceInvitationCreateSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    message = serializers.CharField(max_length=500, required=False, allow_blank=True)
    role = serializers.ChoiceField(
        choices=(
            WorkspaceMember.Role.ADMIN,
            WorkspaceMember.Role.MEMBER,
            WorkspaceMember.Role.VIEWER,
        )
    )

    def validate_email(self, value):
        return value.strip().casefold()

    def validate_message(self, value):
        return value.strip()


class WorkspaceInvitationSerializer(serializers.ModelSerializer):
    invited_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    invited_by_name = serializers.SerializerMethodField()
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    workspace_id = serializers.UUIDField(read_only=True)
    status = serializers.SerializerMethodField()
    email_delivery = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceInvitation
        fields = (
            "id",
            "email",
            "role",
            "message",
            "workspace_id",
            "workspace_name",
            "status",
            "invited_by_id",
            "invited_by_name",
            "created_at",
            "expires_at",
            "accepted_at",
            "revoked_at",
            "email_delivery",
        )
        read_only_fields = fields

    def get_invited_by_name(self, invitation):
        if invitation.invited_by is None:
            return ""
        return invitation.invited_by.get_full_name() or invitation.invited_by.username

    def get_status(self, invitation):
        if (
            invitation.status == WorkspaceInvitation.Status.PENDING
            and invitation.expires_at <= timezone.now()
        ):
            return WorkspaceInvitation.Status.EXPIRED
        return invitation.status

    def get_email_delivery(self, invitation):
        try:
            delivery = invitation.email_delivery
        except WorkspaceInvitationEmail.DoesNotExist:
            return {"status": "unknown", "attempts": 0, "last_error": ""}
        return {
            "status": delivery.status,
            "attempts": delivery.attempts,
            "last_error": (
                delivery.last_error
                if delivery.status == WorkspaceInvitationEmail.Status.FAILED
                else ""
            ),
        }


class OwnershipTransferSerializer(serializers.Serializer):
    member_id = serializers.UUIDField()


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField(
        min_length=32,
        max_length=128,
        trim_whitespace=False,
        write_only=True,
    )
