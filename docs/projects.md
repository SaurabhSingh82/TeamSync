# Projects and project membership (M03)

M03 adds projects to a workspace. All project APIs require an authenticated
M01 session and use the existing HttpOnly JWT cookies and CSRF protection.
Project IDs and membership IDs are UUIDs. Projects are only visible to
workspace members who are project members, except that workspace Owners and
Admins retain workspace-level administrative access to every project.

## Project APIs

- `POST /api/workspaces/{workspace_id}/projects/` - create a project; only
  workspace Owners and Admins may create one. The creator is added as the
  initial Project Manager in the same transaction.
- `GET /api/workspaces/{workspace_id}/projects/` - list accessible projects.
  Supports `search`, `status=planning|active|on_hold|completed`,
  `archived=false|true|all`, and standard pagination (`page`, `page_size`).
  `archived=false` is the default; Completed projects remain visible.
- `GET /api/projects/{project_id}/` - retrieve project details.
- `PATCH /api/projects/{project_id}/` - update project information and status.
- `POST /api/projects/{project_id}/archive/` - archive without deleting data.
- `POST /api/projects/{project_id}/restore/` - restore an archived project.
- `DELETE /api/projects/{project_id}/` - permanently delete an archived
  project; only workspace Owners and Admins may do so.

Project names are trimmed, required, and limited to 150 characters. Optional
due dates cannot precede optional start dates. New projects default to
Planning. Supported statuses are Planning, Active, On Hold, and Completed.

## Project membership APIs

- `GET /api/projects/{project_id}/members/` - list project members.
- `POST /api/projects/{project_id}/members/` - add an existing workspace
  member with `{"user_id": "<user UUID>", "role": "manager|member|viewer"}`.
- `PATCH /api/projects/{project_id}/members/{member_id}/` - update a project
  role with `{"role": "manager|member|viewer"}`.
- `DELETE /api/projects/{project_id}/members/{member_id}/` - remove project
  membership.

Project membership is unique per user/project. Members must already belong to
the same workspace. M03 does not create project invitations.

Member list/create/update responses include `avatar_url` (an absolute URL or
`null`) from the member's profile, for use by clients; it is not an upload or
mutation field.

## Frontend

- `/workspaces/{workspace_id}/projects` - searchable, filterable, paginated
  project list with project creation for workspace Owners/Admins.
- `/workspaces/{workspace_id}/projects/{project_id}` - project overview.
- `/workspaces/{workspace_id}/projects/{project_id}/members` - project
  membership and role management.
- `/workspaces/{workspace_id}/projects/{project_id}/settings` - project
  details, status, archive/restore, and eligible permanent deletion.

Authenticated routes share the TeamSync navigation shell. M01/M02 page content
and route behavior remain unchanged. Project controls use the APIs above;
frontend role checks only improve usability and do not replace backend
authorization.

## Permission hierarchy

| Workspace role | Project role | Read project/members | Update, status, archive/restore, manage members | Create | Permanently delete |
|---|---|---:|---:|---:|---:|
| Owner/Admin | Any or none | Yes | Yes | Yes | Yes, archived only |
| Member | Project Manager | Yes | Yes | No | No |
| Member | Project Member | Yes | No | No | No |
| Member | Project Viewer | Yes | No | No | No |
| Viewer | Any | Yes, if assigned | No | No | No |
| Not a workspace member | Any | No | No | No | No |

Workspace Viewers remain read-only even when their stored project role is
Project Manager. Backend permission checks enforce this hierarchy; frontend
controls are not an authorization boundary. Users without workspace membership
receive `404` for workspace-scoped project resources; users who are workspace
members but not project members receive `404` for project resources unless
they are a workspace Owner or Admin.

Project Manager membership cannot be self-promoted. Project membership changes
are transactional, and every project must retain at least one Project Manager.
Removing or demoting the last Manager is rejected until another Manager is
appointed. Removing a workspace member also removes their project memberships;
the last Manager cannot be removed from a workspace without first appointing a
replacement.

## Persistence

The `apps.projects` app stores `Project` and `ProjectMember`. Database
constraints enforce allowed statuses/roles, non-empty names, valid date order,
and unique project membership. Indexes support workspace project listing,
date lookups, and project-member queries. Workspace deletion cascades to its
projects and project memberships. Project creation and its initial Manager
membership commit atomically.

Projects containing tasks cannot be permanently deleted until those tasks are
deleted. The task-to-project foreign key uses `PROTECT`, and project and
workspace deletion APIs return a conflict rather than silently deleting task
data. See [tasks.md](tasks.md) for task management behavior. Kanban,
attachments, and notifications are not implemented.
