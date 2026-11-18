from django.urls import path

from apps.workspaces.views import (
    AcceptWorkspaceInvitationView,
    LeaveWorkspaceView,
    OwnershipTransferView,
    RejectWorkspaceInvitationView,
    ReceivedInvitationActionView,
    ReceivedInvitationListView,
    WorkspaceDetailView,
    WorkspaceInvitationActionView,
    WorkspaceInvitationListCreateView,
    WorkspaceLifecycleActionView,
    WorkspaceListCreateView,
    WorkspaceMemberDetailView,
    WorkspaceMemberListView,
)


urlpatterns = [
    path("workspaces/", WorkspaceListCreateView.as_view(), name="workspace-list-create"),
    path(
        "workspaces/<uuid:workspace_id>/",
        WorkspaceDetailView.as_view(),
        name="workspace-detail",
    ),
    path(
        "workspaces/<uuid:workspace_id>/leave/",
        LeaveWorkspaceView.as_view(),
        name="workspace-leave",
    ),
    path(
        "workspaces/<uuid:workspace_id>/archive/",
        WorkspaceLifecycleActionView.as_view(),
        {"action": "archive"},
        name="workspace-archive",
    ),
    path(
        "workspaces/<uuid:workspace_id>/restore/",
        WorkspaceLifecycleActionView.as_view(),
        {"action": "restore"},
        name="workspace-restore",
    ),
    path(
        "workspaces/<uuid:workspace_id>/members/",
        WorkspaceMemberListView.as_view(),
        name="workspace-members",
    ),
    path(
        "workspaces/<uuid:workspace_id>/members/<uuid:member_id>/",
        WorkspaceMemberDetailView.as_view(),
        name="workspace-member-detail",
    ),
    path(
        "workspaces/<uuid:workspace_id>/ownership/transfer/",
        OwnershipTransferView.as_view(),
        name="workspace-ownership-transfer",
    ),
    path(
        "workspaces/<uuid:workspace_id>/invitations/",
        WorkspaceInvitationListCreateView.as_view(),
        name="workspace-invitations",
    ),
    path(
        "workspaces/<uuid:workspace_id>/invitations/<uuid:invitation_id>/<str:action>/",
        WorkspaceInvitationActionView.as_view(),
        name="workspace-invitation-action",
    ),
    path(
        "invitations/accept/",
        AcceptWorkspaceInvitationView.as_view(),
        name="workspace-invitation-accept",
    ),
    path(
        "invitations/",
        ReceivedInvitationListView.as_view(),
        name="received-invitations",
    ),
    path(
        "invitations/<uuid:invitation_id>/<str:action>/",
        ReceivedInvitationActionView.as_view(),
        name="received-invitation-action",
    ),
    path(
        "invitations/reject/",
        RejectWorkspaceInvitationView.as_view(),
        name="workspace-invitation-reject",
    ),
]
