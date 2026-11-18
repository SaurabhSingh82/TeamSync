# Search, settings, and usability (M10)

## Global search

The authenticated `/search` page searches projects, tasks, workspace members,
and comments in projects the current user can access. Workspace Owners/Admins
can search projects in their workspace; other users are limited to their
project memberships. Member results are limited to the current user's
workspaces and omit email and other private profile fields.

Each search result group is paginated using the shared page parameter, with a
maximum page size of 20. Task results support project, status, priority,
assignee, creator, label, and due-date-range filters. Project, assignee,
creator, and label filters accept a name or UUID. The project task list also
exposes status, priority, assignee, creator, label, and due-date filters.

| Method and path | Behavior |
|---|---|
| `GET /search/?q=term` | Search accessible projects, tasks, project members, and task comments |

Supported query parameters include `page`, `page_size`, `project`, `status`,
`priority`, `assignee`, `creator`, `label`, `due_after`, and `due_before`.
The search term is required and limited to 100 characters.

## Settings and usability

Personal settings are available at `/profile`; workspace settings are available
from workspace navigation; project settings are available in each project's
settings view. These settings surfaces use the existing server-side permission
checks.

Search is available in desktop and mobile navigation. The search form and
filters use labeled, keyboard-operable controls; results include contextual
links and explicit loading, empty, and error states. Existing responsive
project, workspace, task, and settings interfaces remain in place.
