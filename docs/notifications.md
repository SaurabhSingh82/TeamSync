# Notifications and activity (M08)

M08 adds database-backed in-app notifications and a workspace activity feed.
Notifications cover task assignment changes, comments, mentions, workspace
invitations and accepted invitations, and due-today/overdue reminders. The
signed-in app shows the unread count in its navigation and provides a
filterable notification list with mark-read, mark-unread, and mark-all-read
actions.

## API

All endpoints require authentication.

| Method and path | Behavior |
|---|---|
| `GET /notifications/?unread_only=true` | Paginated notifications for the signed-in recipient |
| `POST /notifications/{notification_id}/read/` | Mark one notification as read |
| `POST /notifications/{notification_id}/unread/` | Mark one notification as unread |
| `POST /notifications/read-all/` | Mark all visible notifications as read |
| `GET /workspaces/{workspace_id}/activity/` | Paginated workspace activity feed |

Notification data is recipient-scoped. Task notifications are returned only
while the recipient retains project access (or workspace Owner/Admin access).
Workspace activity requires current workspace membership; non-admins only see
activity for projects where they are current members. The feed exposes actor,
event type, object identifiers, timestamp, and filtered metadata. Comment text,
invitation email addresses and tokens, file paths, and other private content
are not copied into activity metadata.

Task activity is mirrored into the workspace stream when created. Invitation
creation and acceptance produce workspace activity events. Invitees who
already have an account can receive an in-app invitation notice, but must use
the emailed invitation link to accept because invitation tokens are never
stored in notification payloads.

## Deadline reminders

`python manage.py send_deadline_reminders` creates notifications for active,
incomplete tasks due today or overdue. It targets current task assignees and
task creators who still have a project membership and are not workspace
viewers. A unique event key based on task, due date, reminder kind, and
recipient makes repeated or concurrent runs idempotent. Schedule this command
with a job runner for regular reminders; no background scheduler is bundled.

## Frontend

- `/notifications` shows the signed-in user's notification history.
- `/workspaces/{workspaceId}/activity` shows the authorized workspace feed.
- The app navigation refreshes the unread badge once per minute.
