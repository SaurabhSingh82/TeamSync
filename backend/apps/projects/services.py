from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.projects.models import Project, ProjectMember
from apps.projects.permissions import (
    WORKSPACE_ADMIN_ROLES,
    require_project_manager,
)
from apps.workspaces.models import Workspace, WorkspaceMember
from apps.workspaces.services import Conflict


def create_project(*, workspace, creator, values):
    with transaction.atomic():
        locked_workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
        creator_membership = WorkspaceMember.objects.select_for_update().filter(
            workspace=locked_workspace,
            user=creator,
        ).first()
        if (
            creator_membership is None
        ):
            raise NotFound("Workspace not found.")
        if creator_membership.role not in WORKSPACE_ADMIN_ROLES:
            raise PermissionDenied(
                "Only workspace Owners and Admins can create projects."
            )

        project = Project.objects.create(
            workspace=locked_workspace,
            created_by=creator,
            **values,
        )
        ProjectMember.objects.create(
            project=project,
            user=creator,
            role=ProjectMember.Role.MANAGER,
        )
    return project


def add_project_member(*, access, actor, user_id, role):
    require_project_manager(access)
    if user_id == actor.pk and role == ProjectMember.Role.MANAGER:
        raise ValidationError(
            {"user_id": "You cannot promote yourself to Project Manager."}
        )
    workspace_member = WorkspaceMember.objects.filter(
        workspace=access.project.workspace,
        user_id=user_id,
    ).first()
    if workspace_member is None:
        raise ValidationError(
            {"user_id": "Only existing workspace members can join a project."}
        )
    try:
        with transaction.atomic():
            return ProjectMember.objects.create(
                project=access.project,
                user_id=user_id,
                role=role,
            )
    except IntegrityError as exc:
        raise Conflict("This user is already a project member.") from exc


def update_project_member(*, access, actor, member_id, role):
    require_project_manager(access)
    member = (
        ProjectMember.objects.select_for_update()
        .filter(project=access.project, pk=member_id)
        .first()
    )
    if member is None:
        raise NotFound("Project member not found.")
    if member.user_id == actor.pk and role == ProjectMember.Role.MANAGER:
        if member.role != ProjectMember.Role.MANAGER:
            raise ValidationError(
                {"role": "You cannot promote yourself to Project Manager."}
            )
    if (
        member.role == ProjectMember.Role.MANAGER
        and role != ProjectMember.Role.MANAGER
        and not ProjectMember.objects.filter(
            project=access.project,
            role=ProjectMember.Role.MANAGER,
        )
        .exclude(pk=member.pk)
        .exists()
    ):
        raise Conflict("Assign another Project Manager before changing this role.")

    member.role = role
    member.save(update_fields=("role", "updated_at"))
    return member


def remove_project_member(*, access, member_id):
    require_project_manager(access)
    member = (
        ProjectMember.objects.select_for_update()
        .filter(project=access.project, pk=member_id)
        .first()
    )
    if member is None:
        raise NotFound("Project member not found.")
    if (
        member.role == ProjectMember.Role.MANAGER
        and not ProjectMember.objects.filter(
            project=access.project,
            role=ProjectMember.Role.MANAGER,
        )
        .exclude(pk=member.pk)
        .exists()
    ):
        raise Conflict("Assign another Project Manager before removing this member.")
    member.delete()


def remove_workspace_member_from_projects(*, workspace, user_id):
    with transaction.atomic():
        manager_memberships = list(
            ProjectMember.objects.select_for_update()
            .filter(
                project__workspace=workspace,
                user_id=user_id,
                role=ProjectMember.Role.MANAGER,
            )
            .values_list("project_id", flat=True)
        )
        for project_id in manager_memberships:
            if not ProjectMember.objects.filter(
                project_id=project_id,
                role=ProjectMember.Role.MANAGER,
            ).exclude(user_id=user_id).exists():
                raise Conflict(
                    "Assign another Project Manager before removing this workspace member."
                )
        ProjectMember.objects.filter(
            project__workspace=workspace,
            user_id=user_id,
        ).delete()


def list_project_members(project):
    return (
        ProjectMember.objects.filter(
            project=project,
            user__workspace_memberships__workspace=project.workspace,
        )
        .select_related("user")
        .order_by("joined_at", "id")
    )


def queryset_for_workspace_projects(*, user, workspace, workspace_role):
    from django.db.models import OuterRef, Subquery

    project_role_query = ProjectMember.objects.filter(
        project_id=OuterRef("pk"),
        user=user,
    ).values("role")[:1]
    workspace_role_query = WorkspaceMember.objects.filter(
        workspace_id=OuterRef("workspace_id"),
        user=user,
    ).values("role")[:1]
    projects = Project.objects.filter(workspace=workspace).annotate(
        current_user_project_role=Subquery(project_role_query),
        current_user_workspace_role=Subquery(workspace_role_query),
    )
    if workspace_role not in WORKSPACE_ADMIN_ROLES:
        projects = projects.filter(members__user=user)
    return projects.distinct()


def filter_projects(queryset, params):
    status_value = params.get("status", "").strip()
    if status_value:
        if status_value not in Project.Status.values:
            raise ValidationError(
                {"status": "Choose a valid project status."}
            )
        queryset = queryset.filter(status=status_value)

    archived = params.get("archived", "false").strip().lower()
    if archived == "true":
        queryset = queryset.filter(archived_at__isnull=False)
    elif archived == "false":
        queryset = queryset.filter(archived_at__isnull=True)
    elif archived != "all":
        raise ValidationError(
            {"archived": "Use true, false, or all."}
        )

    search = params.get("search", "").strip()
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search) | Q(description__icontains=search)
        )
    return queryset.order_by("-updated_at", "id")


def set_project_archived(*, access, archived):
    require_project_manager(access)
    project = access.project
    project.archived_at = timezone.now() if archived else None
    project.save(update_fields=("archived_at", "updated_at"))
    return project


def delete_project(*, access):
    if not access.can_delete:
        raise PermissionDenied(
            "Only workspace Owners and Admins can permanently delete projects."
        )
    if access.project.archived_at is None:
        raise Conflict("Archive this project before permanently deleting it.")
    access.project.delete()
