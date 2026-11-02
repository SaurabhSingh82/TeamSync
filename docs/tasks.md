# Task management (M04)

M04 adds project-scoped tasks, assignments, collaborators, labels, subtasks,
and basic comments. Kanban boards, attachments, notifications, and advanced
collaboration are outside this module.

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

## Persistence and tests

The `apps.tasks` schema uses UUID task/subtask/comment/label identifiers,
unique constraints for project label names and task association rows, check
constraints for status, priority, title, dates, and non-empty labels/comments,
and indexes for project task lists, due dates, assignees, subtasks, comments,
and labels. Task deletion cascades to its dependent task records and links;
project deletion is protected while tasks exist.

Run the complete SQLite-compatible backend test suite from `backend/`:

```powershell
..\.venv\Scripts\python.exe manage.py test apps.users apps.workspaces apps.projects apps.tasks apps.core --settings=config.test_settings
```

PostgreSQL is required for row-lock and concurrency tests. Configure
`DATABASE_URL` for the local PostgreSQL instance and run from `backend/`:

```powershell
..\.venv\Scripts\python.exe manage.py test apps.tasks.tests_postgres --settings=config.postgres_test_settings --keepdb
```
