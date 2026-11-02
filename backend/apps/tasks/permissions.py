from dataclasses import dataclass

from rest_framework.exceptions import NotFound, PermissionDenied

from apps.projects.models import Project, ProjectMember
from apps.projects.permissions import (
    ProjectAccess,
    get_project_access,
)
from apps.tasks.models import Task, TaskAssignee, TaskCollaborator
from apps.workspaces.models import WorkspaceMember


@dataclass
class TaskAccess:
    task: Task
    project_access: ProjectAccess

    @property
    def can_manage(self):
        return self.project_access.can_manage

    @property
    def project(self) -> Project:
        return self.project_access.project


def get_task_access(user, task_id, *, lock=False):
    task_ref = Task.objects.filter(pk=task_id).values("project_id").first()
    if task_ref is None:
        raise NotFound("Task not found.")

    project_access = get_project_access(
        user,
        task_ref["project_id"],
        lock=lock,
    )
    tasks = Task.objects.select_related("project")
    if lock:
        tasks = tasks.select_for_update()
    task = tasks.filter(pk=task_id, project=project_access.project).first()
    if task is None:
        raise NotFound("Task not found.")
    return TaskAccess(task=task, project_access=project_access)


def require_task_creator(project_access):
    if project_access.workspace_membership.role == WorkspaceMember.Role.VIEWER:
        raise PermissionDenied("Workspace Viewers cannot create tasks.")
    if project_access.can_manage:
        return
    membership = project_access.project_membership
    if membership is None or membership.role != ProjectMember.Role.MEMBER:
        raise PermissionDenied("Only project Managers, Members, and workspace admins can create tasks.")


def is_task_participant(access, user):
    membership = access.project_access.project_membership
    if membership is None:
        return False
    task = access.task
    return (
        task.creator_id == user.pk
        or TaskAssignee.objects.filter(task=task, project_member=membership).exists()
        or TaskCollaborator.objects.filter(task=task, project_member=membership).exists()
    )


def require_task_participant(access, user):
    if access.can_manage:
        return
    if access.project_access.workspace_membership.role == WorkspaceMember.Role.VIEWER:
        raise PermissionDenied("Workspace Viewers have read-only task access.")
    membership = access.project_access.project_membership
    if membership is None or membership.role != ProjectMember.Role.MEMBER:
        raise PermissionDenied("You do not have permission to change this task.")
    if not is_task_participant(access, user):
        raise PermissionDenied(
            "You must create, be assigned to, or collaborate on this task to change it."
        )


def require_task_manager(access):
    if not access.can_manage:
        raise PermissionDenied("Only project Managers and workspace admins can manage this task.")
