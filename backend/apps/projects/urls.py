from django.urls import path

from apps.projects.views import (
    ProjectDetailView,
    ProjectLifecycleActionView,
    ProjectMemberDetailView,
    ProjectMemberListCreateView,
    WorkspaceProjectListCreateView,
)
from apps.projects.milestone_views import (
    ProjectMilestoneDetailView,
    ProjectMilestoneListCreateView,
)


urlpatterns = [
    path(
        "workspaces/<uuid:workspace_id>/projects/",
        WorkspaceProjectListCreateView.as_view(),
        name="workspace-project-list-create",
    ),
    path(
        "projects/<uuid:project_id>/",
        ProjectDetailView.as_view(),
        name="project-detail",
    ),
    path(
        "projects/<uuid:project_id>/members/",
        ProjectMemberListCreateView.as_view(),
        name="project-members",
    ),
    path(
        "projects/<uuid:project_id>/milestones/",
        ProjectMilestoneListCreateView.as_view(),
        name="project-milestones",
    ),
    path(
        "milestones/<uuid:milestone_id>/",
        ProjectMilestoneDetailView.as_view(),
        name="milestone-detail",
    ),
    path(
        "projects/<uuid:project_id>/members/<uuid:member_id>/",
        ProjectMemberDetailView.as_view(),
        name="project-member-detail",
    ),
    path(
        "projects/<uuid:project_id>/<str:action>/",
        ProjectLifecycleActionView.as_view(),
        name="project-lifecycle-action",
    ),
]
