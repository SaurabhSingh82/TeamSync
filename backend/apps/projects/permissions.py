from dataclasses import dataclass

from rest_framework.exceptions import NotFound, PermissionDenied

from apps.projects.models import Project, ProjectMember
from apps.workspaces.models import Workspace, WorkspaceMember


WORKSPACE_ADMIN_ROLES = (WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN)


@dataclass
class ProjectAccess:
    project: Project
    workspace_membership: WorkspaceMember
    project_membership: ProjectMember | None

    @property
    def is_workspace_admin(self):
        return self.workspace_membership.role in WORKSPACE_ADMIN_ROLES

    @property
    def can_manage(self):
        if self.workspace_membership.role == WorkspaceMember.Role.VIEWER:
            return False
        return self.is_workspace_admin or (
            self.project_membership is not None
            and self.project_membership.role == ProjectMember.Role.MANAGER
        )

    @property
    def can_delete(self):
        return self.is_workspace_admin


def get_workspace_membership(user, workspace_id, *, lock=False):
    workspace = Workspace.objects.filter(
        pk=workspace_id,
        members__user=user,
    ).first()
    if workspace is None:
        raise NotFound("Workspace not found.")

    if lock:
        workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
    memberships = WorkspaceMember.objects
    if lock:
        memberships = memberships.select_for_update()
    membership = memberships.filter(workspace=workspace, user=user).first()
    if membership is None:
        raise NotFound("Workspace not found.")
    return workspace, membership


def get_project_access(user, project_id, *, lock=False):
    project_ref = Project.objects.filter(pk=project_id).values("workspace_id").first()
    if project_ref is None:
        raise NotFound("Project not found.")

    workspace, workspace_membership = get_workspace_membership(
        user,
        project_ref["workspace_id"],
        lock=lock,
    )
    projects = Project.objects.select_related("workspace")
    if lock:
        projects = projects.select_for_update()
    project = projects.filter(pk=project_id, workspace=workspace).first()
    if project is None:
        raise NotFound("Project not found.")

    project_memberships = ProjectMember.objects
    if lock:
        project_memberships = project_memberships.select_for_update()
    project_membership = project_memberships.filter(
        project=project,
        user=user,
    ).first()
    access = ProjectAccess(project, workspace_membership, project_membership)
    if not access.is_workspace_admin and project_membership is None:
        raise NotFound("Project not found.")
    return access


def require_project_manager(access):
    if not access.can_manage:
        raise PermissionDenied("You do not have permission to manage this project.")
