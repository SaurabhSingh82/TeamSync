from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.projects.services import remove_workspace_member_from_projects
from apps.workspaces.models import WorkspaceInvitation, WorkspaceMember
from apps.workspaces.pagination import WorkspacePagination
from apps.workspaces.serializers import (
    AcceptInvitationSerializer,
    OwnershipTransferSerializer,
    WorkspaceInvitationCreateSerializer,
    WorkspaceInvitationSerializer,
    WorkspaceMemberRoleSerializer,
    WorkspaceMemberSerializer,
    WorkspaceReadSerializer,
    WorkspaceWriteSerializer,
)
from apps.workspaces.services import (
    Conflict,
    accept_invitation,
    accept_invitation_by_id,
    create_invitation,
    create_workspace,
    get_workspace_membership,
    membership_role_queryset,
    reject_invitation,
    reject_invitation_by_id,
    require_active_workspace,
    require_role,
    resend_invitation,
    revoke_invitation,
    transfer_ownership,
)

MANAGER_ROLES = (WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN)
MANAGED_MEMBER_ROLES = (WorkspaceMember.Role.MEMBER, WorkspaceMember.Role.VIEWER)


class WorkspaceListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        workspaces = membership_role_queryset(request.user).order_by("-created_at", "id")
        archived = request.query_params.get("archived", "false").strip().lower()
        if archived == "true":
            workspaces = workspaces.filter(archived_at__isnull=False)
        elif archived == "false":
            workspaces = workspaces.filter(archived_at__isnull=True)
        elif archived != "all":
            raise ValidationError({"archived": "Use true, false, or all."})
        paginator = WorkspacePagination()
        page = paginator.paginate_queryset(workspaces, request, view=self)
        serializer = WorkspaceReadSerializer(
            page,
            many=True,
            context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = WorkspaceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = create_workspace(
            owner=request.user,
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
        )
        membership = WorkspaceMember.objects.get(
            workspace=workspace,
            user=request.user,
        )
        return Response(
            WorkspaceReadSerializer(
                workspace,
                context={"request": request, "membership": membership},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class WorkspaceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):
        workspace, membership = get_workspace_membership(request.user, workspace_id)
        return Response(
            WorkspaceReadSerializer(
                workspace,
                context={"request": request, "membership": membership},
            ).data
        )

    def patch(self, request, workspace_id):
        with transaction.atomic():
            workspace, membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
            require_active_workspace(workspace)
            require_role(membership, MANAGER_ROLES)
            serializer = WorkspaceWriteSerializer(
                workspace,
                data=request.data,
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            workspace = serializer.save()
            from apps.realtime.events import broadcast_event, workspace_group

            transaction.on_commit(
                lambda: broadcast_event(
                    group=workspace_group(workspace.pk),
                    event_type="workspace.updated",
                    payload={"workspace_id": str(workspace.pk)},
                )
            )
        return Response(
            WorkspaceReadSerializer(
                workspace,
                context={"request": request, "membership": membership},
            ).data
        )

    def delete(self, request, workspace_id):
        with transaction.atomic():
            workspace, membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
            require_role(membership, (WorkspaceMember.Role.OWNER,))
            try:
                workspace.delete()
            except ProtectedError as exc:
                raise Conflict(
                    "This workspace contains projects with tasks and cannot be deleted."
                ) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):
        workspace, _membership = get_workspace_membership(request.user, workspace_id)
        members = (
            WorkspaceMember.objects.filter(workspace=workspace)
            .select_related("user")
            .order_by("joined_at", "id")
        )
        paginator = WorkspacePagination()
        page = paginator.paginate_queryset(members, request, view=self)
        serializer = WorkspaceMemberSerializer(
            page,
            many=True,
            context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)


class WorkspaceMemberDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, workspace_id, member_id):
        with transaction.atomic():
            workspace, actor_membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
            require_active_workspace(workspace)
            require_role(actor_membership, MANAGER_ROLES)
            member = get_object_or_404(
                WorkspaceMember.objects.select_for_update().select_related("user"),
                workspace=workspace,
                pk=member_id,
            )
            if member.role == WorkspaceMember.Role.OWNER:
                raise PermissionDenied("The workspace owner cannot be modified.")
            if (
                actor_membership.role == WorkspaceMember.Role.ADMIN
                and member.role not in MANAGED_MEMBER_ROLES
            ):
                raise PermissionDenied("Admins can only manage Members and Viewers.")

            serializer = WorkspaceMemberRoleSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            new_role = serializer.validated_data["role"]
            if (
                actor_membership.role == WorkspaceMember.Role.ADMIN
                and new_role not in MANAGED_MEMBER_ROLES
            ):
                raise PermissionDenied("Admins cannot assign the Admin role.")
            member.role = new_role
            member.save(update_fields=["role"])
            from apps.realtime.events import schedule_workspace_event

            schedule_workspace_event(
                workspace_id=workspace.pk,
                event_type="workspace.member_role_changed",
                payload={"user_id": str(member.user_id), "role": new_role},
            )
        return Response(
            WorkspaceMemberSerializer(
                member,
                context={"request": request},
            ).data
        )

    def delete(self, request, workspace_id, member_id):
        with transaction.atomic():
            workspace, actor_membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
            require_active_workspace(workspace)
            require_role(actor_membership, MANAGER_ROLES)
            member = get_object_or_404(
                WorkspaceMember.objects.select_for_update(),
                workspace=workspace,
                pk=member_id,
            )
            if member.role == WorkspaceMember.Role.OWNER:
                raise PermissionDenied("Transfer ownership before removing the owner.")
            if (
                actor_membership.role == WorkspaceMember.Role.ADMIN
                and member.role not in MANAGED_MEMBER_ROLES
            ):
                raise PermissionDenied("Admins can only manage Members and Viewers.")
            remove_workspace_member_from_projects(
                workspace=workspace,
                user_id=member.user_id,
            )
            removed_user_id = member.user_id
            member.delete()
            from apps.realtime.events import schedule_workspace_event, schedule_user_event

            schedule_workspace_event(
                workspace_id=workspace.pk,
                event_type="workspace.member_removed",
                payload={"user_id": str(removed_user_id)},
            )
            schedule_user_event(
                user_id=removed_user_id,
                event_type="access.revoked",
                payload={"workspace_id": str(workspace.pk)},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class OwnershipTransferView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, workspace_id):
        serializer = OwnershipTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            workspace, membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
            require_active_workspace(workspace)
            require_role(membership, (WorkspaceMember.Role.OWNER,))
            workspace = transfer_ownership(
                workspace=workspace,
                current_owner=membership,
                target_member_id=serializer.validated_data["member_id"],
            )
            new_membership = WorkspaceMember.objects.get(
                workspace=workspace,
                user_id=workspace.owner_id,
            )
        return Response(
            {
                "workspace": WorkspaceReadSerializer(
                    workspace,
                    context={"request": request, "membership": membership},
                ).data,
                "new_owner": WorkspaceMemberSerializer(
                    new_membership,
                    context={"request": request},
                ).data,
            }
        )


class WorkspaceInvitationListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "workspace_invitation_send"

    def get_throttles(self):
        if self.request.method == "GET":
            return []
        return super().get_throttles()

    def get(self, request, workspace_id):
        workspace, membership = get_workspace_membership(request.user, workspace_id)
        require_role(membership, MANAGER_ROLES)
        invitations = (
            WorkspaceInvitation.objects.filter(workspace=workspace)
            .select_related("invited_by", "email_delivery")
            .order_by("-created_at", "id")
        )
        paginator = WorkspacePagination()
        page = paginator.paginate_queryset(invitations, request, view=self)
        serializer = WorkspaceInvitationSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, workspace_id):
        serializer = WorkspaceInvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        role = serializer.validated_data["role"]
        if email == request.user.email.casefold():
            raise ValidationError({"email": "You cannot invite yourself."})

        with transaction.atomic():
            workspace, membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
            require_active_workspace(workspace)
            require_role(membership, MANAGER_ROLES)
            if (
                membership.role == WorkspaceMember.Role.ADMIN
                and role not in MANAGED_MEMBER_ROLES
            ):
                raise PermissionDenied("Admins can only invite Members and Viewers.")
            invitation = create_invitation(
                workspace=workspace,
                inviter=request.user,
                email=email,
                role=role,
                message=serializer.validated_data.get("message", ""),
            )
        return Response(
            WorkspaceInvitationSerializer(invitation).data,
            status=status.HTTP_201_CREATED,
        )


class WorkspaceInvitationActionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "workspace_invitation"

    def post(self, request, workspace_id, invitation_id, action):
        if action not in ("resend", "revoke"):
            raise NotFound("Invitation action not found.")

        with transaction.atomic():
            workspace, membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
            require_active_workspace(workspace)
            require_role(membership, MANAGER_ROLES)
            invitation = get_object_or_404(
                WorkspaceInvitation.objects.select_for_update(),
                workspace=workspace,
                pk=invitation_id,
            )
            if (
                membership.role == WorkspaceMember.Role.ADMIN
                and invitation.role not in MANAGED_MEMBER_ROLES
            ):
                raise PermissionDenied("Admins cannot manage Admin invitations.")
            invitation = (
                resend_invitation(invitation=invitation)
                if action == "resend"
                else revoke_invitation(invitation=invitation)
            )
        return Response(WorkspaceInvitationSerializer(invitation).data)


class ReceivedInvitationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        invitations = (
            WorkspaceInvitation.objects.filter(email__iexact=request.user.email)
            .select_related("workspace", "invited_by", "email_delivery")
            .order_by("-created_at", "id")
        )
        paginator = WorkspacePagination()
        page = paginator.paginate_queryset(invitations, request, view=self)
        return paginator.get_paginated_response(
            WorkspaceInvitationSerializer(page, many=True).data
        )


class ReceivedInvitationActionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invitation_accept_v2"

    def post(self, request, invitation_id, action):
        if action not in ("accept", "reject"):
            raise NotFound("Invitation action not found.")
        if action == "accept":
            membership = accept_invitation_by_id(
                user=request.user,
                invitation_id=invitation_id,
            )
            return Response(
                {
                    "workspace": WorkspaceReadSerializer(
                        membership.workspace,
                        context={"request": request, "membership": membership},
                    ).data,
                    "membership": WorkspaceMemberSerializer(
                        membership,
                        context={"request": request},
                    ).data,
                },
                status=status.HTTP_201_CREATED,
            )
        invitation = reject_invitation_by_id(
            user=request.user,
            invitation_id=invitation_id,
        )
        return Response(WorkspaceInvitationSerializer(invitation).data)


class AcceptWorkspaceInvitationView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invitation_accept_v2"

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = accept_invitation(
            user=request.user,
            token=serializer.validated_data["token"],
        )
        return Response(
            {
                "workspace": WorkspaceReadSerializer(
                    membership.workspace,
                    context={"request": request, "membership": membership},
                ).data,
                "membership": WorkspaceMemberSerializer(
                    membership,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class RejectWorkspaceInvitationView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invitation_accept_v2"

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reject_invitation(
            user=request.user,
            token=serializer.validated_data["token"],
        )
        return Response(
            {"detail": "Invitation rejected."},
            status=status.HTTP_200_OK,
        )


class WorkspaceLifecycleActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, workspace_id, action):
        if action not in ("archive", "restore"):
            raise NotFound("Workspace action not found.")

        with transaction.atomic():
            workspace, membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
            require_role(membership, (WorkspaceMember.Role.OWNER,))
            workspace.archived_at = (
                timezone.now() if action == "archive" else None
            )
            workspace.save(update_fields=("archived_at", "updated_at"))
            from apps.realtime.events import broadcast_event, workspace_group

            transaction.on_commit(
                lambda: broadcast_event(
                    group=workspace_group(workspace.pk),
                    event_type="workspace.updated",
                    payload={"workspace_id": str(workspace.pk), "archived": action == "archive"},
                )
            )
        return Response(
            WorkspaceReadSerializer(
                workspace,
                context={"request": request, "membership": membership},
            ).data
        )


class LeaveWorkspaceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, workspace_id):
        with transaction.atomic():
            workspace, membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
            if membership.role == WorkspaceMember.Role.OWNER:
                raise PermissionDenied(
                    "Transfer workspace ownership before leaving."
                )
            remove_workspace_member_from_projects(
                workspace=workspace,
                user_id=membership.user_id,
            )
            membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
