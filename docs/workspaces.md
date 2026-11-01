# Workspaces and invitations (M02)

All APIs require an authenticated M01 session and use the existing HttpOnly
JWT cookies and CSRF protection. Workspace IDs are UUIDs. Workspace names are
not globally unique.

## Workspace APIs

- `POST /api/workspaces/` - create a workspace; the creator becomes its Owner.
- `GET /api/workspaces/` - list the current user's workspaces, including
  `current_user_role` (paginated; default 20, maximum 100 per page).
- `GET /api/workspaces/{workspace_id}/` - retrieve workspace details.
- `PATCH /api/workspaces/{workspace_id}/` - update the name and description.
- `DELETE /api/workspaces/{workspace_id}/` - delete the workspace.
- `GET /api/workspaces/{workspace_id}/members/` - list members (paginated).
- `PATCH /api/workspaces/{workspace_id}/members/{member_id}/` - update a
  member's role.
- `DELETE /api/workspaces/{workspace_id}/members/{member_id}/` - remove a
  member and revoke access.
- `POST /api/workspaces/{workspace_id}/ownership/transfer/` - transfer
  ownership with `{"member_id": "<workspace member UUID>"}`.

Workspace member list and mutation responses include the profile `avatar_url`
as an absolute URL or `null`. The field is read-only and does not change
workspace membership behavior.

Users without workspace membership receive `404` for workspace-scoped
resources. Insufficient role permissions return `403`.

## Roles

- **Owner** can manage settings and membership, grant any non-owner role,
  transfer ownership, and delete the workspace.
- **Admin** can update settings and manage Member/Viewer memberships and
  invitations. Admins cannot grant Admin, modify/remove an Owner, transfer
  ownership, or delete a workspace.
- **Member** and **Viewer** can read workspace details and the member list.
  They cannot modify workspace settings or membership.

Only the Owner can transfer ownership. The previous Owner becomes an Admin.
The workspace row and both membership records are updated in one transaction.
The Owner membership is protected from removal or role changes.

## Invitations

- `GET /api/workspaces/{workspace_id}/invitations/` - list invitations
  (paginated; Owner/Admin only).
- `POST /api/workspaces/{workspace_id}/invitations/` - invite using
  `{"email": "...", "role": "admin|member|viewer"}`.
- `POST /api/workspaces/{workspace_id}/invitations/{invitation_id}/revoke/` -
  revoke a pending invitation.
- `POST /api/workspaces/{workspace_id}/invitations/{invitation_id}/resend/` -
  resend a pending or expired invitation.
- `POST /api/invitations/accept/` - accept with `{"token": "..."}` while
  authenticated as the invited email address.

Invitation tokens are generated using a cryptographically secure random
generator. Only a SHA-256 digest is stored; the raw token is sent by email and
is not returned by the API. The link carries it in the URL fragment so the
browser sends it to the API only in the authenticated request body. Tokens
expire after seven days. Resending rotates the token and expiry, invalidating
previous links. Invitation creation and a delivery-outbox record commit
together. The API returns the invitation with `email_delivery.status` set to
`pending`; this is distinct from the invitation's membership status. Run
`manage.py send_workspace_invitation_emails` periodically to dispatch queued
email. The dispatcher records `sent` or `failed`, increments `attempts`, and
stores only a generic failure message. Delivery is at-least-once: if email
succeeds but the process stops before marking the outbox row sent, the
15-minute claim lease will eventually expire and a later run may send a
duplicate email. That retry rotates the token, so the prior email's link will
no longer work. Database transactions and row locks cover only claim/finalize
steps; email I/O happens outside them.

The dispatcher generates and hashes the email token immediately before
sending. If delivery fails, the invitation remains committed and active.
Resending queues another attempt and rotates the token, invalidating any
previous link. A retry or resend that races an in-progress send may produce a
duplicate email; only the latest token hash remains valid. The outbox retains
no raw token, so a process restart does not leave a plaintext invitation
credential to recover.

In development, the console email backend writes the complete email, including
its usable invitation link, directly to the interactive terminal device
(`CONOUT$` on Windows or `/dev/tty` on POSIX). It does not write email bodies
to redirected stdout/stderr or Django application logs. If no interactive
terminal is available, delivery fails with a generic message; configure SMTP
for headless development. Anyone with access to the interactive terminal can
read its displayed email, so do not use that terminal as a shared session.

The invitation link proves mailbox possession. A newly registered user can
sign in with the invited email and accept the invitation using that link.
Duplicate active memberships and duplicate pending invitations are rejected.

## Persistence

The `apps.workspaces` app stores workspaces, memberships, and invitations.
Database constraints enforce unique memberships, at most one Owner-role
membership per workspace, allowed roles/statuses, and one pending invitation
per normalized email/workspace. A PostgreSQL migration adds deferred
constraint triggers that require exactly one Owner-role membership matching
the workspace owner FK at commit. A membership-change trigger locks the
workspace while changing its Owner membership. SQLite development tests do
not install PostgreSQL triggers; run the PostgreSQL test module to verify
database constraints and row-lock behavior.

Creation and ownership-transfer services maintain the Workspace owner FK and
its Owner membership atomically. The workspace owner cannot be removed; a
workspace deletion cascades to its memberships, invitations, and outbox rows.

After M03, removing a workspace member also removes their project memberships.
If that would leave a project without any Project Manager, the removal is
rejected until another Manager is appointed. See [projects.md](./projects.md).

The ordinary test suite uses in-memory SQLite. PostgreSQL concurrency tests
require a PostgreSQL test database and a role allowed to create it. Run them
with `manage.py test apps.workspaces.tests_postgres
--settings=config.postgres_test_settings`.
