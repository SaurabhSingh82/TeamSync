import hashlib
import secrets
import uuid
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError

from apps.workspaces.models import (
    Workspace,
    WorkspaceInvitation,
    WorkspaceInvitationEmail,
    WorkspaceMember,
)

INVITATION_LIFETIME = timedelta(days=7)
INVITATION_EMAIL_CLAIM_LIFETIME = timedelta(minutes=15)


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This operation conflicts with the current workspace state."
    default_code = "conflict"


def get_workspace_membership(user, workspace_id, *, lock=False):
    workspace = Workspace.objects.filter(
        pk=workspace_id,
        members__user=user,
    ).first()
    if workspace is None:
        raise NotFound("Workspace not found.")

    if lock:
        workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
    membership_query = WorkspaceMember.objects
    if lock:
        membership_query = membership_query.select_for_update()
    membership = membership_query.filter(workspace=workspace, user=user).first()
    if membership is None:
        raise NotFound("Workspace not found.")
    return workspace, membership


def require_role(membership, allowed_roles):
    if membership.role not in allowed_roles:
        raise PermissionDenied("You do not have permission to perform this action.")


def create_workspace(*, owner, name, description):
    with transaction.atomic():
        workspace = Workspace.objects.create(
            owner=owner,
            name=name,
            description=description,
        )
        WorkspaceMember.objects.create(
            workspace=workspace,
            user=owner,
            role=WorkspaceMember.Role.OWNER,
        )
    return workspace


def transfer_ownership(*, workspace, current_owner, target_member_id):
    target_membership = (
        WorkspaceMember.objects.select_for_update()
        .filter(workspace=workspace, pk=target_member_id)
        .first()
    )
    if target_membership is None:
        raise NotFound("Workspace member not found.")
    if target_membership.user_id == current_owner.user_id:
        raise ValidationError({"member_id": "You already own this workspace."})

    current_owner.role = WorkspaceMember.Role.ADMIN
    current_owner.save(update_fields=["role"])
    target_membership.role = WorkspaceMember.Role.OWNER
    target_membership.save(update_fields=["role"])
    workspace.owner_id = target_membership.user_id
    workspace.save(update_fields=["owner", "updated_at"])
    return workspace


def normalize_email(email):
    return email.strip().casefold()


def new_invitation_token():
    return secrets.token_urlsafe(32)


def hash_invitation_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def send_workspace_invitation(invitation, token):
    invite_url = (
        f"{settings.FRONTEND_BASE_URL}/invitations/accept"
        f"#token={quote(token, safe='')}"
    )
    try:
        return (
            send_mail(
                subject=f"Invitation to join {invitation.workspace.name} on TeamSync",
                message=(
                    f"You have been invited to join {invitation.workspace.name} as "
                    f"{invitation.get_role_display()}.\n\n"
                    f"Sign in or create an account with {invitation.email}, then accept "
                    f"the invitation here:\n\n{invite_url}\n\n"
                    "This invitation expires in 7 days."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[invitation.email],
            )
            == 1
        )
    except Exception:
        return False


def create_invitation(*, workspace, inviter, email, role):
    normalized_email = normalize_email(email)
    now = timezone.now()
    WorkspaceInvitation.objects.filter(
        workspace=workspace,
        email__iexact=normalized_email,
        status=WorkspaceInvitation.Status.PENDING,
        expires_at__lte=now,
    ).update(status=WorkspaceInvitation.Status.EXPIRED)

    user_model = get_user_model()
    if user_model.objects.filter(
        workspace_memberships__workspace=workspace,
        email__iexact=normalized_email,
    ).exists():
        raise Conflict("This user is already a workspace member.")

    if WorkspaceInvitation.objects.filter(
        workspace=workspace,
        email__iexact=normalized_email,
        status=WorkspaceInvitation.Status.PENDING,
        expires_at__gt=now,
    ).exists():
        raise Conflict("A pending invitation already exists for this email.")

    try:
        with transaction.atomic():
            invitation = WorkspaceInvitation.objects.create(
                workspace=workspace,
                invited_by=inviter,
                email=normalized_email,
                role=role,
                token_hash=hash_invitation_token(new_invitation_token()),
                expires_at=now + INVITATION_LIFETIME,
            )
            WorkspaceInvitationEmail.objects.create(
                invitation=invitation,
            )
    except IntegrityError as exc:
        raise Conflict("A pending invitation already exists for this email.") from exc
    return invitation


def resend_invitation(*, invitation):
    if invitation.status not in (
        WorkspaceInvitation.Status.PENDING,
        WorkspaceInvitation.Status.EXPIRED,
    ):
        raise Conflict("Only pending or expired invitations can be resent.")

    invitation.token_hash = hash_invitation_token(new_invitation_token())
    invitation.status = WorkspaceInvitation.Status.PENDING
    invitation.expires_at = timezone.now() + INVITATION_LIFETIME
    invitation.accepted_at = None
    invitation.revoked_at = None
    invitation.save(
        update_fields=(
            "token_hash",
            "status",
            "expires_at",
            "accepted_at",
            "revoked_at",
        )
    )
    delivery, _created = WorkspaceInvitationEmail.objects.get_or_create(
        invitation=invitation,
    )
    delivery.status = WorkspaceInvitationEmail.Status.PENDING
    delivery.last_error = ""
    delivery.sent_at = None
    delivery.claim_id = None
    delivery.claimed_at = None
    delivery.save(
        update_fields=(
            "status",
            "last_error",
            "sent_at",
            "claim_id",
            "claimed_at",
            "updated_at",
        )
    )
    return invitation


def dispatch_pending_invitation_emails(*, limit=100):
    if limit < 1:
        raise ValueError("The outbox batch limit must be positive.")

    stale_before = timezone.now() - INVITATION_EMAIL_CLAIM_LIFETIME
    WorkspaceInvitationEmail.objects.filter(
        status=WorkspaceInvitationEmail.Status.SENDING,
        claimed_at__lte=stale_before,
    ).update(
        status=WorkspaceInvitationEmail.Status.PENDING,
        claim_id=None,
        claimed_at=None,
        updated_at=timezone.now(),
    )
    pending = list(
        WorkspaceInvitationEmail.objects.filter(
            status=WorkspaceInvitationEmail.Status.PENDING
        )
        .order_by("created_at", "pk")
        .values_list("pk", "invitation_id")[:limit]
    )
    result = {"sent": 0, "failed": 0, "skipped": 0}
    skip_locked = connection.features.has_select_for_update_skip_locked

    for delivery_id, invitation_id in pending:
        token = new_invitation_token()
        claim_id = uuid.uuid4()
        with transaction.atomic():
            invitation = (
                WorkspaceInvitation.objects.select_for_update()
                .filter(pk=invitation_id)
                .first()
            )
            if invitation is None:
                result["skipped"] += 1
                continue

            delivery = (
                WorkspaceInvitationEmail.objects.select_for_update(
                    skip_locked=skip_locked
                )
                .filter(
                    pk=delivery_id,
                    status=WorkspaceInvitationEmail.Status.PENDING,
                )
                .first()
            )
            if delivery is None:
                result["skipped"] += 1
                continue

            if (
                invitation.status != WorkspaceInvitation.Status.PENDING
                or invitation.expires_at <= timezone.now()
            ):
                delivery.status = WorkspaceInvitationEmail.Status.FAILED
                delivery.last_error = "Invitation is no longer active."
                delivery.save(
                    update_fields=("status", "last_error", "updated_at")
                )
                result["skipped"] += 1
                continue

            invitation.token_hash = hash_invitation_token(token)
            invitation.save(update_fields=("token_hash",))
            invitation.workspace.name
            delivery.attempts += 1
            delivery.last_error = ""
            delivery.status = WorkspaceInvitationEmail.Status.SENDING
            delivery.claim_id = claim_id
            delivery.claimed_at = timezone.now()
            delivery.save(
                update_fields=(
                    "attempts",
                    "last_error",
                    "status",
                    "claim_id",
                    "claimed_at",
                    "updated_at",
                )
            )

        if send_workspace_invitation(invitation, token):
            delivery_status = WorkspaceInvitationEmail.Status.SENT
            delivery_error = ""
        else:
            delivery_status = WorkspaceInvitationEmail.Status.FAILED
            delivery_error = "Invitation email delivery failed."

        with transaction.atomic():
            WorkspaceInvitation.objects.select_for_update().filter(
                pk=invitation_id
            ).first()
            delivery = (
                WorkspaceInvitationEmail.objects.select_for_update()
                .filter(
                    pk=delivery_id,
                    status=WorkspaceInvitationEmail.Status.SENDING,
                    claim_id=claim_id,
                )
                .first()
            )
            if delivery is None:
                result["skipped"] += 1
                continue
            delivery.status = delivery_status
            delivery.last_error = delivery_error
            delivery.claim_id = None
            delivery.claimed_at = None
            delivery.sent_at = (
                timezone.now()
                if delivery_status == WorkspaceInvitationEmail.Status.SENT
                else None
            )
            delivery.save(
                update_fields=(
                    "status",
                    "last_error",
                    "claim_id",
                    "claimed_at",
                    "sent_at",
                    "updated_at",
                )
            )
        result[
            "sent"
            if delivery_status == WorkspaceInvitationEmail.Status.SENT
            else "failed"
        ] += 1

    return result


def revoke_invitation(*, invitation):
    if invitation.status != WorkspaceInvitation.Status.PENDING:
        raise Conflict("Only pending invitations can be revoked.")
    invitation.status = WorkspaceInvitation.Status.REVOKED
    invitation.revoked_at = timezone.now()
    invitation.save(update_fields=("status", "revoked_at"))
    return invitation


def accept_invitation(*, user, token):
    token_digest = hash_invitation_token(token)
    with transaction.atomic():
        invitation_ref = WorkspaceInvitation.objects.filter(
            token_hash=token_digest
        ).only("pk", "workspace_id").first()
        if invitation_ref is None:
            raise ValidationError({"token": "This invitation is invalid or no longer active."})
        workspace = Workspace.objects.select_for_update().get(
            pk=invitation_ref.workspace_id
        )
        invitation = WorkspaceInvitation.objects.select_for_update().get(
            pk=invitation_ref.pk
        )
        if invitation.token_hash != token_digest:
            raise ValidationError({"token": "This invitation is invalid or no longer active."})
        if invitation.status != WorkspaceInvitation.Status.PENDING:
            raise ValidationError({"token": "This invitation is invalid or no longer active."})

        if invitation.expires_at <= timezone.now():
            raise ValidationError({"token": "This invitation is invalid or no longer active."})

        if normalize_email(user.email) != normalize_email(invitation.email):
            raise PermissionDenied("Sign in with the email address that received this invitation.")

        if WorkspaceMember.objects.filter(workspace=workspace, user=user).exists():
            raise Conflict("You are already a member of this workspace.")

        try:
            with transaction.atomic():
                membership = WorkspaceMember.objects.create(
                    workspace=workspace,
                    user=user,
                    role=invitation.role,
                )
        except IntegrityError as exc:
            raise Conflict("You are already a member of this workspace.") from exc

        invitation.status = WorkspaceInvitation.Status.ACCEPTED
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["status", "accepted_at"])
    return membership


def membership_role_queryset(user):
    from django.db.models import OuterRef, Subquery

    role_query = WorkspaceMember.objects.filter(
        workspace_id=OuterRef("pk"),
        user=user,
    ).values("role")[:1]
    return Workspace.objects.filter(members__user=user).annotate(
        current_user_role=Subquery(role_query)
    ).distinct()
