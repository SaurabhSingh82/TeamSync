from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.pagination import ProjectPagination
from apps.projects.permissions import (
    WORKSPACE_ADMIN_ROLES,
    get_project_access,
    get_workspace_membership,
    require_project_manager,
)
from apps.projects.serializers import (
    ProjectMemberCreateSerializer,
    ProjectMemberReadSerializer,
    ProjectMemberRoleSerializer,
    ProjectReadSerializer,
    ProjectWriteSerializer,
)
from apps.projects.services import (
    add_project_member,
    create_project,
    delete_project,
    filter_projects,
    list_project_members,
    queryset_for_workspace_projects,
    remove_project_member,
    set_project_archived,
    update_project_member,
)


def project_read_response(project, request, *, access=None, status_code=status.HTTP_200_OK):
    return Response(
        ProjectReadSerializer(
            project,
            context={"request": request, "access": access},
        ).data,
        status=status_code,
    )


class WorkspaceProjectListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):
        workspace, workspace_membership = get_workspace_membership(
            request.user,
            workspace_id,
        )
        projects = queryset_for_workspace_projects(
            user=request.user,
            workspace=workspace,
            workspace_role=workspace_membership.role,
        )
        projects = filter_projects(projects, request.query_params)
        paginator = ProjectPagination()
        page = paginator.paginate_queryset(projects, request, view=self)
        serializer = ProjectReadSerializer(
            page,
            many=True,
            context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, workspace_id):
        workspace, workspace_membership = get_workspace_membership(
            request.user,
            workspace_id,
        )
        if workspace_membership.role not in WORKSPACE_ADMIN_ROLES:
            raise PermissionDenied("Only workspace Owners and Admins can create projects.")
        serializer = ProjectWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project = create_project(
            workspace=workspace,
            creator=request.user,
            values=serializer.validated_data,
        )
        access = get_project_access(request.user, project.pk)
        return project_read_response(
            project,
            request,
            access=access,
            status_code=status.HTTP_201_CREATED,
        )


class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        access = get_project_access(request.user, project_id)
        return project_read_response(access.project, request, access=access)

    def patch(self, request, project_id):
        with transaction.atomic():
            access = get_project_access(request.user, project_id, lock=True)
            require_project_manager(access)
            serializer = ProjectWriteSerializer(
                access.project,
                data=request.data,
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            project = serializer.save()
        access.project = project
        return project_read_response(project, request, access=access)

    def delete(self, request, project_id):
        with transaction.atomic():
            access = get_project_access(request.user, project_id, lock=True)
            delete_project(access=access)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectLifecycleActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id, action):
        if action not in ("archive", "restore"):
            raise NotFound("Project action not found.")
        with transaction.atomic():
            access = get_project_access(request.user, project_id, lock=True)
            project = set_project_archived(
                access=access,
                archived=action == "archive",
            )
        access.project = project
        return project_read_response(project, request, access=access)


class ProjectMemberListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        access = get_project_access(request.user, project_id)
        members = list_project_members(access.project)
        paginator = ProjectPagination()
        page = paginator.paginate_queryset(members, request, view=self)
        serializer = ProjectMemberReadSerializer(
            page,
            many=True,
            context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, project_id):
        serializer = ProjectMemberCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_project_access(request.user, project_id, lock=True)
            member = add_project_member(
                access=access,
                actor=request.user,
                user_id=serializer.validated_data["user_id"],
                role=serializer.validated_data["role"],
            )
        return Response(
            ProjectMemberReadSerializer(
                member,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class ProjectMemberDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, project_id, member_id):
        serializer = ProjectMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            access = get_project_access(request.user, project_id, lock=True)
            member = update_project_member(
                access=access,
                actor=request.user,
                member_id=member_id,
                role=serializer.validated_data["role"],
            )
        return Response(
            ProjectMemberReadSerializer(
                member,
                context={"request": request},
            ).data
        )

    def delete(self, request, project_id, member_id):
        with transaction.atomic():
            access = get_project_access(request.user, project_id, lock=True)
            remove_project_member(access=access, member_id=member_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
