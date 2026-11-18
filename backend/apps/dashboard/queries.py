from django.db.models import Exists, OuterRef, Q

from apps.notifications.models import ActivityEvent
from apps.projects.models import Project, ProjectMember
from apps.projects.permissions import WORKSPACE_ADMIN_ROLES
from apps.tasks.models import Task
from apps.workspaces.models import WorkspaceMember


def accessible_projects(user):
    workspace_membership = WorkspaceMember.objects.filter(
        workspace_id=OuterRef("workspace_id"),
        user=user,
    )
    workspace_admin_membership = workspace_membership.filter(
        role__in=WORKSPACE_ADMIN_ROLES,
    )
    project_membership = ProjectMember.objects.filter(
        project_id=OuterRef("pk"),
        user=user,
    )
    return (
        Project.objects.annotate(
            _has_workspace_membership=Exists(workspace_membership),
            _is_workspace_admin=Exists(workspace_admin_membership),
            _is_project_member=Exists(project_membership),
        )
        .filter(_has_workspace_membership=True)
        .filter(Q(_is_workspace_admin=True) | Q(_is_project_member=True))
    )


def accessible_tasks(user):
    return Task.objects.filter(
        project_id__in=accessible_projects(user).values("pk"),
    )


def accessible_activity_events(user):
    projects = accessible_projects(user)
    workspace_member_ids = WorkspaceMember.objects.filter(user=user).values_list(
        "workspace_id",
        flat=True,
    )
    return (
        ActivityEvent.objects.filter(
            Q(project__in=projects)
            | Q(project__isnull=True, workspace_id__in=workspace_member_ids)
        )
        .distinct()
    )
