# TeamSync application integration inventory

This is a source-based integration audit, not a production-readiness claim.
“Fully integrated” means the inspected frontend route calls a corresponding
backend API and the backend persists or reads the feature's data. It does not
mean every behavior has passed a real-browser, multi-role test or that an
external service has been configured.

## M00-M11 feature inventory

| Module / feature | Frontend | Backend and persistence | External setup / limits | Integration status |
|---|---|---|---|---|
| M00 — engineering foundation and health | Vite/React application, shared routes and Axios client | Django REST Framework, PostgreSQL configuration, migrations, database-aware `/api/health/` | PostgreSQL required for normal local use. Local PostgreSQL is running and `manage.py migrate --check --noinput` succeeded in this audit. Docker is unavailable in this environment. | Fully integrated |
| M01 — account, authentication, and profile | Register, login, logout, reset, verify, and profile pages call the auth API | Custom Django user, cookie JWT authentication, CSRF, refresh rotation/blacklisting, profile and avatar endpoints | Gmail SMTP is configured locally. Login currently permits unverified accounts; verification is not an activation gate. Registration sends email synchronously inside the account transaction, so an SMTP error may fail registration and roll back the account. | Integrated and locally exercised; verification policy remains open |
| M01 — verification and password-reset mail | Verification and reset pages submit tokens to the auth API | Signed verification links expire after 24 hours; reset uses Django's password-reset token and password validators | Real local Gmail registration/verification and password-reset/sign-in flows completed. CI tests still use in-memory email. | Real-service workflow verified locally |
| M02 — workspaces, roles, membership | Workspace selector, create/settings/members pages call workspace APIs | Workspace/member/invitation models, role checks and database constraints | PostgreSQL-specific owner/concurrency constraints are covered by the separate PostgreSQL test suite. | Fully integrated |
| M02 — workspace invitation and acceptance | Invite, resend, revoke, accept, and member pages are API-connected | Token hashes, expiration, email outbox, claim/attempt state, and atomic membership acceptance | Real existing- and new-user invitations were delivered and accepted. Gmail placed the new-user message in Spam. The one-shot dispatcher is not scheduled; older queued invitations were intentionally left untouched. | Both real-user workflows verified locally; normal dispatcher scheduling remains unverified |
| M03 — projects and project roles | Project list, overview, settings, and member pages call project APIs | Workspace-scoped project/member records, role permissions, archive/restore and deletion constraints | No project invitation model, route, or email workflow exists; users must already be workspace members. | Fully integrated for implemented scope |
| M04 — tasks | Task list/detail forms call task CRUD, assignment, labels, subtasks, archive, restore, and duplication APIs | Tasks and relations are stored in PostgreSQL with validation and permission checks | No external service required. Full multi-role browser coverage remains outstanding. | Fully integrated at the UI/API boundary |
| M05 — Kanban boards | Board/list modes call board, column, and task-move APIs | Per-project boards, ordered columns, task positions, and version checks are persisted | E2E exposed and fixed a nested route context bug in task details; drag/drop and concurrency still need dedicated browser coverage. | API/UI integrated; task-detail route regression covered by browser test |
| M06 — collaboration | Comments, replies, mentions, collaborators, and task activity are API-connected | Comment/mention/activity records and permissions are database-backed | No WebSocket or push channel is configured; updates are request/poll based, not realtime. | Fully integrated at the UI/API boundary |
| M07 — task/comment files | Upload, list, download, and delete actions call authenticated attachment APIs | Metadata is in PostgreSQL; bytes use private local filesystem storage | Persist and back up `backend/media/` and `PRIVATE_ATTACHMENT_ROOT` separately. No malware scanning or external object-storage provider is configured. | Fully integrated locally; production storage setup required |
| M08 — notifications and workspace activity | Notification list/read actions, unread badge, activity page, and profile preference controls call APIs | Recipient-scoped notification/activity records and per-user category preferences are database-backed | In-app notifications are synchronous. Deadline reminders require the operator to schedule `send_deadline_reminders`; no scheduler or realtime service is bundled. | Integrated for in-app notifications and preferences; reminders not integrated |
| M09 — dashboard, calendar, analytics, milestones | Dashboard, calendar, and analytics pages call the summary/event APIs; milestone persistence/API is available through project routes | Authenticated, access-scoped database aggregates, calendar events, and project milestones | No external service required. Full browser workflow coverage remains outstanding. | Integrated at the UI/API boundary; milestone management UI remains limited |
| M10 — global search and settings | Search and filters call `/api/search/`; profile, workspace, project, and notification settings use existing APIs | Database substring search with authorization scope; settings and notification preferences persist through existing resources | No dedicated search engine is configured. | Fully integrated for implemented scope |
| M11 — hardening and test infrastructure | CI and Playwright configuration exist; browser scenario covers registration through task creation and search | Security defaults, request-ID logging, health check, invitation throttling, and backend test suites exist | Real SMTP, existing-user and new-user invitation flows are verified locally. Full multi-role browser coverage and backup/restore remain unverified. | Partially implemented / acceptance incomplete |

## Cross-module findings

- **Email delivery requires service configuration and an operator.** Real
  verification, password-reset, and existing-user invitation emails were
  received and exercised locally. Account tests use Django's in-memory
  backend. Real invitation email was delivered to Spam and then accepted;
  operators should remind users to check Spam/Junk. Workspace invitations
  create a pending outbox record; delivery requires running the dispatcher
  and a working email backend. The API's `pending` state must not be
  interpreted as a sent email.
- **Registration email failure affects account creation.** Registration sends
  the verification email synchronously inside a database transaction. A mail
  exception may roll back the newly created user. The email-backed workflow
  needs an explicit failure/retry policy during the next integration phase.
- **Email-link token exposure:** verification and reset tokens are placed in
  query parameters on frontend URLs; invitation tokens use a URL fragment.
  The Django request middleware omits query strings, but query tokens can
  remain in browser history and may be captured by other infrastructure.
  Review whether the verification/reset links should move to fragments and
  retain backward compatibility.
- **Verification policy:** the user model tracks `email_verified`, and the
  verification endpoint updates it, but login does not enforce it. This is
  the current code behavior, not proof that the product should allow unverified
  login.
- **Verification resend is absent:** no resend-verification endpoint was
  identified in the auth routes, so a user who misses or loses the initial
  verification message has no dedicated resend flow in the current API.
- **Outbox and reminders need scheduling.** There is no Celery, Redis,
  Channels, WebSocket, or scheduler dependency/service in the inspected
  requirements and Compose configuration. The invitation dispatcher and
  deadline-reminder management commands must be invoked by an operator or
  external scheduler.
- **Project invitations are not implemented.** Workspace invitations are
  implemented; adding a project member requires that person to already be a
  workspace member.
- **Files are local, not cloud-backed.** Attachment metadata is database
  backed; attachment bytes and avatar/media files are separate local files.
  Production durability requires persistent protected storage and separate
  file backups. Malware scanning is not configured.
- **Permission policy to confirm:** project members with access can read task
  details, comments, and attachments; upload/delete operations have stricter
  role checks. Confirm that this visibility is intended for private task files.
- **No production-page mock dataset was found in the inspected frontend.**
  Test files do use mocks. Source inspection confirms API wiring, but does not
  substitute for the requested multi-account end-to-end acceptance.

## SRS v1.1 gaps addressed in this stabilization pass

The SRS document was readable and its M00-M11 requirements were compared with
the current source. These requirements are absent or differ from the current
API contract; they were documented rather than added because this pass forbids
new features and major behavior changes:

- M02 workspace archive/restore, non-owner leave, and matching-email invitation
  rejection are implemented without changing the existing `/api/` contract.
- M09 project milestones are persisted, permission-checked, exposed through
  project milestone endpoints, and included in calendar event results.
- M10 per-user in-app category preferences are persisted and enforced when new
  notifications are created.
- Debug-only OpenAPI schema and Swagger UI are available at `/api/schema/` and
  `/api/docs/`. Existing APIView endpoints still produce schema-generation
  warnings/errors where explicit serializers are not declared.

## Evidence and current validation limits

The audit traced frontend routes and API clients under `frontend/src/`, the
Django apps and migrations under `backend/apps/`, and configuration in
`backend/config/settings.py`, `compose.yaml`, and the dependency manifests.
Feature-specific behavior is documented in [authentication](authentication.md),
[workspaces](workspaces.md), [projects](projects.md), [tasks](tasks.md),
[notifications](notifications.md), [dashboard/calendar/analytics](dashboard-calendar-analytics.md),
and [search/settings](search-settings-usability.md).

Current verification: Django system check, migration plan, and
`makemigrations --check --dry-run` passed. The full SQLite-compatible backend
suite passed 122 tests (13 skipped); all 13 PostgreSQL-specific tests passed
against the existing preserved test database. Frontend tests passed (9 tests),
ESLint passed, and the TypeScript/production build passed with a large-chunk
warning. The Playwright workflow passed with a new assertion that no uncaught
page errors occur; this exposed a task-detail route context bug, which was
fixed by preserving the project outlet context through the task-view outlet.
Real Gmail verification, password reset followed by sign-in, and both
existing-user and new-user workspace invitation delivery and acceptance were
confirmed locally. The new-user invitation was assigned the Viewer role, and
the persisted membership has that role. Direct requests from that Viewer were
denied for project creation, workspace editing, and inviting another member
(HTTP 403); workspace and project counts remained unchanged.

The invitation acceptance endpoint initially returned HTTP 500 because its
`invitation_accept` throttle scope had no configured rate. The production rate
is now `10/hour`; Django checks, the endpoint smoke test (HTTP 201), and
workspace API tests pass. The accepted test invitation and membership remain
in the local database. The four older pending invitation emails were not
processed or modified. A separate newer pending entry was also observed and
left untouched; the local outbox still contained five pending entries after
the targeted email tests.

These checks do not establish every page interaction, a complete new-user
invitation flow, every role combination in a real browser, drag/drop
concurrency, or production backup/restore. Docker and deployment work are
outside the requested scope.
