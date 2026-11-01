from rest_framework import serializers

from apps.projects.models import Project, ProjectMember


class ProjectWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = (
            "name",
            "description",
            "status",
            "start_date",
            "due_date",
        )

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Project name cannot be blank.")
        return value

    def validate(self, attrs):
        start_date = attrs.get("start_date")
        due_date = attrs.get("due_date")
        if self.instance is not None:
            start_date = attrs.get("start_date", self.instance.start_date)
            due_date = attrs.get("due_date", self.instance.due_date)
        if start_date is not None and due_date is not None and due_date < start_date:
            raise serializers.ValidationError(
                {"due_date": "Due date cannot be earlier than the start date."}
            )
        return attrs


class ProjectReadSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField(read_only=True)
    created_by_id = serializers.UUIDField(read_only=True)
    created_by_username = serializers.CharField(
        source="created_by.username",
        read_only=True,
    )
    current_user_project_role = serializers.SerializerMethodField()
    current_user_workspace_role = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            "id",
            "workspace_id",
            "name",
            "description",
            "status",
            "created_by_id",
            "created_by_username",
            "start_date",
            "due_date",
            "archived_at",
            "created_at",
            "updated_at",
            "current_user_project_role",
            "current_user_workspace_role",
        )
        read_only_fields = fields

    def get_current_user_project_role(self, project):
        if hasattr(project, "current_user_project_role"):
            return project.current_user_project_role
        access = self.context.get("access")
        if access is not None and access.project_membership is not None:
            return access.project_membership.role
        return None

    def get_current_user_workspace_role(self, project):
        if hasattr(project, "current_user_workspace_role"):
            return project.current_user_workspace_role
        access = self.context.get("access")
        if access is not None:
            return access.workspace_membership.role
        request = self.context["request"]
        from apps.workspaces.models import WorkspaceMember

        return WorkspaceMember.objects.filter(
            workspace_id=project.workspace_id,
            user=request.user,
        ).values_list("role", flat=True).first()


class ProjectMemberCreateSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    role = serializers.ChoiceField(choices=ProjectMember.Role.choices)


class ProjectMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=ProjectMember.Role.choices)


class ProjectMemberReadSerializer(serializers.ModelSerializer):
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
        model = ProjectMember
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
