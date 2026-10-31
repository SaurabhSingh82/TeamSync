from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
    accept_invitation,
    create_invitation,
    create_workspace,
    get_workspace_membership,
    membership_role_queryset,
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
            require_role(membership, MANAGER_ROLES)
            serializer = WorkspaceWriteSerializer(
                workspace,
                data=request.data,
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            workspace = serializer.save()
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
            workspace.delete()
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
        serializer = WorkspaceMemberSerializer(page, many=True)
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
        return Response(WorkspaceMemberSerializer(member).data)

    def delete(self, request, workspace_id, member_id):
        with transaction.atomic():
            workspace, actor_membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
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
            member.delete()
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
                "new_owner": WorkspaceMemberSerializer(new_membership).data,
            }
        )


class WorkspaceInvitationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

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
            )
        return Response(
            WorkspaceInvitationSerializer(invitation).data,
            status=status.HTTP_201_CREATED,
        )


class WorkspaceInvitationActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, workspace_id, invitation_id, action):
        if action not in ("resend", "revoke"):
            raise NotFound("Invitation action not found.")

        with transaction.atomic():
            workspace, membership = get_workspace_membership(
                request.user,
                workspace_id,
                lock=True,
            )
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


class AcceptWorkspaceInvitationView(APIView):
    permission_classes = [IsAuthenticated]

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
                "membership": WorkspaceMemberSerializer(membership).data,
            },
            status=status.HTTP_201_CREATED,
        )
