# Dashboard, calendar, and analytics (M09)

M09 adds signed-in dashboard summaries, a month/week/day calendar, and
paginated project analytics. All data is computed from current database records
and is scoped to the user's workspace and project memberships. Workspace
Owners/Admins may see every project in their workspace; other roles only see
projects where they are current members.

## API

All endpoints require authentication.

| Method and path | Behavior |
|---|---|
| `GET /dashboard/` | Summary counts, personal assigned-task workload, up to 8 upcoming tasks, and up to 8 recent activity events |
| `GET /calendar/events/?start=YYYY-MM-DD&end=YYYY-MM-DD` | Paginated task/project date events for a range of up to 42 days |
| `GET /analytics/?page=1` | Paginated per-project task counts and completion progress with authorized status totals |

Calendar results include task start dates and deadlines, plus project start and
due dates. Events are ordered by date, title, then event type. Page size can be
selected with `page_size` and is capped at 100. The browser UI supports month,
week, and day ranges and loads additional event pages when necessary.

Dashboard `tasks.total` and `tasks.by_status` include non-archived tasks in
non-archived accessible projects. `my_workload` counts tasks currently assigned
to the signed-in user. `upcoming_tasks` includes assigned, incomplete tasks due
today through seven days from today.

Project progress is calculated as:

`completed non-archived tasks / all non-archived tasks in the accessible, non-archived project`

Archived tasks and archived projects are excluded from both numerator and
denominator. A project with no active tasks has 0% progress. Status counts and
project progress are aggregated in Django/database queries; the frontend does
not fetch unbounded task collections to compute metrics.

## Frontend

- `/dashboard` shows project/task metrics, personal upcoming deadlines, task
  status counts, and recent activity.
- `/calendar` presents project/task dates in month, week, and day views.
- `/analytics` presents task status totals and paginated project progress.
