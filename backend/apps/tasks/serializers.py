from rest_framework import serializers

from apps.projects.serializers import ProjectMemberReadSerializer
from apps.tasks.models import (
    BoardColumn,
    Label,
    ProjectBoard,
    Subtask,
    Task,
    TaskActivity,
    TaskComment,
    TaskCommentMention,
)


class BoardColumnReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardColumn
        fields = (
            "id",
            "board_id",
            "name",
            "status",
            "position",
            "is_default",
            "archived_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ProjectBoardReadSerializer(serializers.ModelSerializer):
    project_id = serializers.UUIDField(read_only=True)
    columns = BoardColumnReadSerializer(many=True, read_only=True)

    class Meta:
        model = ProjectBoard
        fields = ("id", "project_id", "version", "columns", "created_at", "updated_at")
        read_only_fields = fields


class BoardColumnWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardColumn
        fields = ("name", "status", "position")
        extra_kwargs = {
            "position": {"required": False},
        }

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Column name cannot be blank.")
        return value


class BoardVersionSerializer(serializers.Serializer):
    expected_board_version = serializers.IntegerField(min_value=1)


class BoardReorderSerializer(BoardVersionSerializer):
    column_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
    )


class BoardColumnMutationSerializer(BoardVersionSerializer):
    destination_column_id = serializers.UUIDField(required=False, allow_null=True)


class TaskMoveSerializer(serializers.Serializer):
    column_id = serializers.UUIDField()
    position = serializers.IntegerField(min_value=0)
    expected_task_version = serializers.IntegerField(min_value=1)
    expected_board_version = serializers.IntegerField(min_value=1)


class TaskWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = (
            "title",
            "description",
            "priority",
            "status",
            "start_date",
            "due_date",
        )

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Task title cannot be blank.")
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


class TaskCreateSerializer(TaskWriteSerializer):
    project_id = serializers.UUIDField()
    board_column_id = serializers.UUIDField(required=False)
    assignee_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )
    collaborator_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )
    label_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )

    class Meta(TaskWriteSerializer.Meta):
        fields = (
            "project_id",
            "board_column_id",
            *TaskWriteSerializer.Meta.fields,
            "assignee_ids",
            "collaborator_ids",
            "label_ids",
        )


class TaskUpdateSerializer(TaskWriteSerializer):
    expected_version = serializers.IntegerField(min_value=1, write_only=True)

    class Meta(TaskWriteSerializer.Meta):
        fields = (*TaskWriteSerializer.Meta.fields, "expected_version")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if "expected_version" not in attrs:
            raise serializers.ValidationError(
                {"expected_version": "This field is required for task updates."}
            )
        return attrs


class LabelReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = ("id", "project_id", "name", "created_at")
        read_only_fields = fields


class TaskReadSerializer(serializers.ModelSerializer):
    project_id = serializers.UUIDField(read_only=True)
    board_column_id = serializers.UUIDField(read_only=True)
    creator_id = serializers.UUIDField(read_only=True, allow_null=True)
    creator_username = serializers.CharField(
        source="creator.username",
        read_only=True,
        allow_null=True,
    )
    assignees = ProjectMemberReadSerializer(many=True, read_only=True)
    collaborators = ProjectMemberReadSerializer(many=True, read_only=True)
    labels = LabelReadSerializer(many=True, read_only=True)
    subtask_count = serializers.SerializerMethodField()
    completed_subtask_count = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = (
            "id",
            "project_id",
            "board_column_id",
            "position",
            "version",
            "title",
            "description",
            "creator_id",
            "creator_username",
            "assignees",
            "collaborators",
            "priority",
            "status",
            "start_date",
            "due_date",
            "labels",
            "subtask_count",
            "completed_subtask_count",
            "created_at",
            "updated_at",
            "archived_at",
            "completed_at",
        )
        read_only_fields = fields

    @staticmethod
    def get_subtask_count(task):
        if hasattr(task, "_subtask_count"):
            return task._subtask_count
        return task.subtasks.count()

    @staticmethod
    def get_completed_subtask_count(task):
        if hasattr(task, "_completed_subtask_count"):
            return task._completed_subtask_count
        return task.subtasks.filter(is_completed=True).count()


class SubtaskWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subtask
        fields = ("title", "is_completed")
        extra_kwargs = {
            "is_completed": {"required": False},
        }

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Subtask title cannot be blank.")
        return value


class SubtaskReadSerializer(serializers.ModelSerializer):
    created_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    created_by_username = serializers.CharField(
        source="created_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Subtask
        fields = (
            "id",
            "task_id",
            "title",
            "is_completed",
            "created_by_id",
            "created_by_username",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class TaskCommentWriteSerializer(serializers.ModelSerializer):
    parent_comment_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        write_only=True,
    )
    mention_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
    )

    class Meta:
        model = TaskComment
        fields = ("body", "parent_comment_id", "mention_ids")

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Comment cannot be blank.")
        return value


class TaskCommentMentionReadSerializer(serializers.ModelSerializer):
    project_member_id = serializers.UUIDField(read_only=True)
    user_id = serializers.UUIDField(source="project_member.user_id", read_only=True)
    username = serializers.CharField(
        source="project_member.user.username",
        read_only=True,
    )
    first_name = serializers.CharField(
        source="project_member.user.first_name",
        read_only=True,
    )
    last_name = serializers.CharField(
        source="project_member.user.last_name",
        read_only=True,
    )

    class Meta:
        model = TaskCommentMention
        fields = (
            "project_member_id",
            "user_id",
            "username",
            "first_name",
            "last_name",
        )
        read_only_fields = fields


class TaskCommentReadSerializer(serializers.ModelSerializer):
    author_id = serializers.UUIDField(read_only=True, allow_null=True)
    author_username = serializers.CharField(
        source="author.username",
        read_only=True,
        allow_null=True,
    )
    author_first_name = serializers.CharField(
        source="author.first_name",
        read_only=True,
        allow_null=True,
    )
    author_last_name = serializers.CharField(
        source="author.last_name",
        read_only=True,
        allow_null=True,
    )
    parent_comment_id = serializers.UUIDField(read_only=True, allow_null=True)
    is_edited = serializers.SerializerMethodField()
    mentions = TaskCommentMentionReadSerializer(
        source="mention_links",
        many=True,
        read_only=True,
    )

    @staticmethod
    def get_is_edited(comment):
        return comment.edited_at is not None

    class Meta:
        model = TaskComment
        fields = (
            "id",
            "task_id",
            "author_id",
            "author_username",
            "author_first_name",
            "author_last_name",
            "body",
            "parent_comment_id",
            "mentions",
            "is_edited",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class TaskActivityReadSerializer(serializers.ModelSerializer):
    actor_id = serializers.UUIDField(read_only=True, allow_null=True)
    actor_username = serializers.CharField(
        source="actor.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = TaskActivity
        fields = ("id", "task_id", "actor_id", "actor_username", "action", "metadata", "created_at")
        read_only_fields = fields


class TaskAssignmentSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()


class TaskLabelSerializer(serializers.Serializer):
    label_id = serializers.UUIDField()


class LabelWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = ("name",)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Label name cannot be blank.")
        return value
