# Task management and Kanban boards (M04-M05)

M04 adds project-scoped tasks, assignments, collaborators, labels, subtasks,
and basic comments. M05 adds per-project Kanban boards, configurable columns,
persisted ordering, task activity, and a task-detail drawer. Attachments,
notifications, and advanced collaboration are outside these modules.

## Permissions

Authorization is enforced by the backend for every task and project-scoped
resource; hiding controls in the frontend is not a security boundary.

| Workspace/project role | Read tasks | Create tasks | Edit task details and participation | Manage assignments | Archive, restore, delete tasks | Manage project labels |
|---|---:|---:|---:|---:|---:|---:|
| Workspace Owner or Admin | Yes | Yes | Yes | Any active project member | Yes | Yes |
| Project Manager | Yes | Yes | Yes | Any active project member | Yes | Yes |
| Project Member | Yes | Yes | Only tasks they created, are assigned to, or collaborate on | Add/remove only themselves | No | No |
| Project Viewer | Yes | No | No | No | No | No |
| Workspace Viewer | Yes | No | No | No | No | No |

Workspace Viewers remain read-only regardless of a stored project role.
Members can add or remove themselves as an assignee or collaborator on an
accessible task. Task authors, assignees, and collaborators may edit their own
comments; Managers and workspace Owner/Admin may delete any comment.

Users without access to the project receive not-found responses for task
resources, preventing cross-workspace task UUIDs from revealing their
existence. Assignees and collaborators must have active membership in both the
workspace and project.

## Task behavior

Tasks have UUID identifiers, a title and description, a creator, status
(`todo`, `in_progress`, `review`, `completed`), priority (`low`, `medium`,
`high`, `urgent`), optional start and due dates, labels, assignees,
collaborators, creation/update timestamps, and an optional archive timestamp.
Due dates cannot precede start dates. Subtasks and comments belong to a task
and are deleted with it.

Duplicating a task copies its title, description, priority, dates, and labels.
The duplicate starts in `todo` and does not copy assignments, collaborators,
subtasks, or comments.

Tasks are protected from project deletion. Delete tasks before permanently
deleting their project or workspace; the API returns `409 Conflict` while
task-bearing projects remain.

## Boards and task views (M05)

Each project has a board with four canonical status columns plus configurable
columns. Each task belongs to one active column; its status follows the column.
Project Managers and workspace Owners/Admins can add, rename, reorder, archive,
restore, and delete columns. Tasks must be moved to another active column when
an occupied column is archived or deleted. Replacing a canonical column
requires another active column for that status.

Authorized task participants can drag tasks between columns and reorder tasks
within a column. Board and task versions are checked on every move; stale
updates return `409 Conflict` and the frontend refreshes the board rather than
overwriting newer state. Board filters include text, status, priority, assignee,
label, and due-date range. Filters are applied to the loaded board while task
positions remain based on the full column order.

The project Tasks view has Board and List modes. Opening a task from either
mode displays a detail drawer over the existing view; closing it preserves the
view, URL query state, and in-memory filters. Task activity records creation,
detail updates, and board moves.

## API

All routes are under `/api/` and require authentication.

| Method and path | Behavior |
|---|---|
| `GET /tasks/?project_id=...` | Paginated task list; supports search, status, priority, assignee, due-date, and archive filters |
| `POST /tasks/` | Create task |
| `GET`, `PATCH`, `DELETE /tasks/{task_id}/` | Read, update, or delete task |
| `POST /tasks/{task_id}/archive/` | Archive task |
| `POST /tasks/{task_id}/restore/` | Restore task |
| `POST /tasks/{task_id}/duplicate/` | Duplicate task |
| `POST /tasks/{task_id}/assignees/`; `DELETE /tasks/{task_id}/assignees/{user_id}/` | Add/remove assignee |
| `POST /tasks/{task_id}/collaborators/`; `DELETE /tasks/{task_id}/collaborators/{user_id}/` | Add/remove collaborator |
| `POST /tasks/{task_id}/labels/`; `DELETE /tasks/{task_id}/labels/{label_id}/` | Add/remove a project label |
| `GET`, `POST /tasks/{task_id}/subtasks/` | List or create subtasks |
| `PATCH`, `DELETE /tasks/{task_id}/subtasks/{subtask_id}/` | Update or delete a subtask |
| `GET`, `POST /tasks/{task_id}/comments/` | List or create comments |
| `PATCH`, `DELETE /tasks/{task_id}/comments/{comment_id}/` | Edit or delete a comment |
| `GET`, `POST /projects/{project_id}/labels/` | List or create project labels |
| `GET /projects/{project_id}/board/` | Read ordered columns and tasks; supports filters and `include_archived=true` |
| `POST /projects/{project_id}/columns/` | Add a board column |
| `POST /projects/{project_id}/columns/reorder/` | Reorder active columns |
| `PATCH`, `DELETE /columns/{column_id}/` | Rename a column or delete it with optional task migration |
| `POST /columns/{column_id}/archive/`; `POST /columns/{column_id}/restore/` | Archive or restore a column |
| `POST /tasks/{task_id}/move/` | Move/reorder a task with task and board versions |
| `GET /tasks/{task_id}/activity/` | Read task activity |

Task creation accepts an optional `board_column_id` to place the task in a
specific active column on the same project board. Column mutations require
`expected_board_version`; task updates require `expected_version`, and task
moves require both `expected_task_version` and `expected_board_version`.

## Persistence and tests

The `apps.tasks` schema uses UUID task/subtask/comment/label identifiers,
unique constraints for project label names and task association rows, check
constraints for status, priority, title, dates, and non-empty labels/comments,
and indexes for project task lists, due dates, assignees, subtasks, comments,
and labels. M05 adds project board/version, board-column ordering/status, task
column/order/version/completion fields, and task activity. The M05 migration
creates default boards for existing projects and backfills existing tasks into
their matching status columns. Task deletion cascades to its dependent task records and links;
project deletion is protected while tasks exist.

Run the complete SQLite-compatible backend test suite from `backend/`:

```powershell
..\.venv\Scripts\python.exe manage.py test apps.users apps.workspaces apps.projects apps.tasks apps.core --settings=config.test_settings
```

Run frontend tests, lint, and production build from `frontend/`:

```powershell
npm test
npm run lint
npm run build
```

PostgreSQL is required for row-lock and concurrency tests. Configure
`DATABASE_URL` for the local PostgreSQL instance and run from `backend/`:

```powershell
..\.venv\Scripts\python.exe manage.py test apps.tasks.tests_postgres --settings=config.postgres_test_settings --keepdb
```
