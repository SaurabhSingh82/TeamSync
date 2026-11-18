# Local configuration and external services

This guide is based on the current TeamSync code and configuration. It does
not require sharing credentials in chat. Put secrets only in your local
environment file; the checked-in `.env.example` contains placeholders.

## Required external services

| Service | Needed for | Mandatory? | Setup |
|---|---|---|---|
| PostgreSQL | Application persistence for users, workspaces, projects, tasks, and notifications | Yes for the normal local application | Install PostgreSQL locally (the repository Windows script targets PostgreSQL 18.6) or use Docker Compose. |
| Gmail SMTP | Actual account verification, password reset, and workspace invitation emails | Yes to verify those email workflows or run with production settings | Use a Gmail sender account, enable Google 2-Step Verification, and create a Google App Password. Use the App Password, never the regular Gmail password. |
| Node.js/npm and Python | Run the frontend/backend | Yes, development tools | Use the versions in the repository README and Python virtual environment. |

No Redis, Celery, Django Channels, WebSocket server, search provider, cloud
object store, OAuth provider, or other third-party API is configured or
required by the implementation.

## Local secret-file location

The Django settings loader reads the file named by `TEAMSYNC_ENV_FILE` when
that process variable is set; otherwise it reads the repository-root `.env`.
The Windows PostgreSQL setup script sets `TEAMSYNC_ENV_FILE` to
`%LOCALAPPDATA%\TeamSync\development.env`. If that variable is set, add the
SMTP and URL values to that existing private file rather than creating a
second file Django will ignore. Do not overwrite an existing local config.

If `TEAMSYNC_ENV_FILE` is not set and a root `.env` does not already exist:

```powershell
Copy-Item .env.example .env
```

`.env`, `.env.*`, database dumps, and private-key files are ignored by Git.
Only `.env.example` and `.env.docker.example` are intended for version
control. Verify with `git check-ignore -v .env` without printing the file
contents.

### Gmail SMTP values

Enter these values in the active local environment file:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-sender@gmail.com
EMAIL_HOST_PASSWORD=your-google-app-password
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
DEFAULT_FROM_EMAIL=TeamSync <your-sender@gmail.com>
```

The sender must be the Gmail account or an alias authorized by that account.
Google App Passwords require 2-Step Verification. Do not use the normal Gmail
password; do not paste either password into chat. Since an email credential
was previously disclosed in conversation, revoke it if it is still active and
create a fresh App Password before configuring the local file.

Development can instead use
`apps.core.email_backends.InteractiveConsoleEmailBackend` to view messages in
the private interactive terminal. This is not Gmail delivery and is not
suitable for a headless process. The `.env.example` selects SMTP so the real
email path can be configured explicitly.

The email workflows in the source are:

- Verification: `{FRONTEND_BASE_URL}/verify-email?token=...`; token expires
  after 24 hours.
- Password reset: `{FRONTEND_BASE_URL}/reset-password?uid=...&token=...`;
  Django's default reset-token timeout is three days.
- Workspace invitation:
  `{FRONTEND_BASE_URL}/invitations/accept#token=...`; token expires after
  seven days. The invitee must sign in as the invited email address before
  accepting.

The API does not return the raw invitation token; only a hash is stored.
Verification/reset tokens are submitted to the API from their frontend pages.
There is no project-invitation workflow or separate resend-verification API
in the inspected routes. Account email verification and reset messages are
sent synchronously; workspace invitation emails are queued in an outbox and
require the dispatcher described below.

## URLs, CORS, and cookies

| Variable | Purpose |
|---|---|
| `FRONTEND_BASE_URL` | Public origin used to build verification, reset, and invitation links. Use the frontend origin without a path; trailing slashes are removed. Production must use HTTPS. |
| `VITE_API_BASE_URL` | Frontend API base. The local default `/api` keeps requests same-origin through Vite's proxy. For production, route `/api/` from the frontend origin to Django or set an appropriate public API base at frontend build time. |
| `VITE_API_PROXY_TARGET` | Vite development-server proxy destination. Native default: `http://127.0.0.1:8000`; Compose: `http://backend:8000`. This is not the browser-facing production API URL. |
| `DJANGO_ALLOWED_HOSTS` | Hostnames Django serves. Set the exact backend hostnames; do not include schemes or paths. |
| `CORS_ALLOWED_ORIGINS` | Exact browser frontend origins allowed to make credentialed cross-origin API requests, including scheme and port. |
| `CSRF_TRUSTED_ORIGINS` | Exact trusted origins for unsafe browser requests, including scheme and port. |
| `AUTH_COOKIE_DOMAIN` | Optional cookie domain for a deployment that deliberately shares cookies across subdomains; leave unset for local development. |
| `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_SECURE` | Cookie policy. Production must use HTTPS and secure cookies. Cross-site deployments may require a reviewed `SameSite=None` configuration with `Secure=True`. |

For local development the frontend is `http://localhost:5173`, Vite proxies
`/api` to `http://127.0.0.1:8000`, and Django health is
`http://127.0.0.1:8000/api/health/`. When frontend and backend use different
origins, configure CORS and CSRF values to match the browser's frontend
origin. For production, keep a single public HTTPS origin if possible and
configure the trusted reverse proxy to route `/api/` to Django.

Other deployment security variables are `SECURE_SSL_REDIRECT`,
`SECURE_HSTS_SECONDS`, `SECURE_HSTS_INCLUDE_SUBDOMAINS`,
`SECURE_HSTS_PRELOAD`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, and
`SECURE_PROXY_SSL_HEADER`. Use the production defaults only behind correctly
configured HTTPS. Trust forwarded-protocol headers only when a trusted proxy
overwrites client-supplied values.

## Complete environment-variable reference

| Variable(s) | Meaning |
|---|---|
| `TEAMSYNC_ENV_FILE` | Optional process-level path override for Django's environment file; this value is not read from `.env`. |
| `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS` | Django signing secret, debug mode, and allowed hostnames. The secret is required. Production must explicitly configure the hosts and set debug off. |
| `DATABASE_URL`, `DATABASE_CONN_MAX_AGE` | PostgreSQL URL and optional persistent connection lifetime. Production must explicitly configure `DATABASE_URL`. |
| `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Exact browser origins used for credentialed CORS and CSRF trust. |
| `FRONTEND_BASE_URL`, `VITE_API_BASE_URL`, `VITE_API_PROXY_TARGET` | Frontend email-link origin, frontend API base, and Vite development proxy target. |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL`, `DEFAULT_FROM_EMAIL` | Email backend and SMTP/sender configuration. Production requires authenticated SMTP and all sender/credential values. `DJANGO_EMAIL_BACKEND` is a legacy fallback for `EMAIL_BACKEND`; do not set both. |
| `SECURE_PROXY_SSL_HEADER`, `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS`, `SECURE_HSTS_INCLUDE_SUBDOMAINS`, `SECURE_HSTS_PRELOAD` | HTTPS/proxy and HSTS settings. |
| `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE` | Session, CSRF, and JWT cookie controls. |
| `AUTH_REGISTER_RATE` | Registration throttle rate; defaults to `10/hour`. |
| `PRIVATE_ATTACHMENT_ROOT`, `ATTACHMENT_MAX_SIZE_BYTES`, `ATTACHMENT_ALLOWED_EXTENSIONS` | Private task-file root and upload limits. `MEDIA_ROOT` is currently fixed to `backend/media/`, not environment-configurable. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Docker Compose PostgreSQL initialization values. Compose derives the backend `DATABASE_URL` from them; use local-only values here. |

`EMAIL_PORT` defaults to 587, TLS defaults on, and SSL defaults off. Enabling
both TLS and SSL is rejected. Settings such as cookie/security defaults do not
replace a review of the real proxy, domain, and browser-origin topology.

## PostgreSQL

`DATABASE_URL` is a PostgreSQL connection URL, for example:

```text
postgresql://teamsync:replace-with-database-password@127.0.0.1:5432/teamsync
```

URL-encode special characters in the password. `DATABASE_CONN_MAX_AGE` is an
optional persistent-connection lifetime in seconds. The native Windows
setup script creates a local-only PostgreSQL service and writes its private
connection configuration outside the repository. Follow the [README setup
instructions](../README.md#local-setup); do not run the setup script over an
existing PostgreSQL installation.

After configuration, apply migrations once:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe manage.py check
..\.venv\Scripts\python.exe manage.py migrate --noinput
```

Back up the PostgreSQL database and uploaded files separately. Avatar files
are stored under `backend/media/` by default; private task-file bytes use
`PRIVATE_ATTACHMENT_ROOT` (default `backend/private_attachments/`). Back up
both roots with protected file-backup tooling in addition to the database.
See [deployment and operations](deployment-and-operations.md#backups-and-recovery)
for the PostgreSQL dump procedure and restore requirements.

## Files and local storage

Avatar/media files and task/comment attachment bytes use local filesystem
storage; no S3-compatible or other external file provider is present.
`PRIVATE_ATTACHMENT_ROOT` can select the private attachment directory.
`ATTACHMENT_MAX_SIZE_BYTES` and `ATTACHMENT_ALLOWED_EXTENSIONS` control upload
limits. The defaults are 10 MiB and PDF, PNG, JPEG, GIF, WebP, UTF-8 text, and
CSV. Private attachments are served through authenticated download endpoints,
not public URLs. Malware scanning is not configured.

For production, mount persistent protected storage for both media and private
attachments, restrict access, and arrange separate backups. Do not expose the
private attachment root through a web server.

## Background commands and email outbox

The outbox and reminder features are database-backed management commands;
they are not continuously running workers and are not scheduled by Compose.

After creating a workspace invitation, run this from `backend/` to process
pending invitation messages:

```powershell
..\.venv\Scripts\python.exe manage.py send_workspace_invitation_emails
```

Schedule it with Windows Task Scheduler or the deployment scheduler at a
short interval for regular delivery. Check the invitation's email-delivery
status and attempt count in the application; a newly queued `pending` record
with zero attempts means the dispatcher has not processed it. A `sent` status
means the configured SMTP server accepted the message, not that the recipient
opened it. Failures are tracked, and an owner/admin can resend an invitation;
resending rotates its token. Delivery is at-least-once, so an interrupted
send/finalize can produce a duplicate.

To create due-date reminder notifications, schedule:

```powershell
..\.venv\Scripts\python.exe manage.py send_deadline_reminders
```

This command creates in-app reminders; it does not send reminder emails.
There is no Redis, Celery worker, WebSocket server, or built-in scheduler to
start.

## Start the application

### Native Windows development

1. Configure the active environment file and PostgreSQL connection as
   described above.
2. From the repository root, install backend requirements if needed:

   ```powershell
   .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
   ```

3. In a backend terminal:

   ```powershell
   Set-Location backend
   ..\.venv\Scripts\python.exe manage.py migrate
   ..\.venv\Scripts\python.exe manage.py runserver
   ```

4. In a second terminal:

   ```powershell
   Set-Location frontend
   npm install
   npm run dev
   ```

5. Open `http://localhost:5173`. Check backend readiness at
   `http://127.0.0.1:8000/api/health/`.

### Docker Compose development

Docker Desktop with Compose v2 is required. Copy
`.env.docker.example` to `.env.docker`, replace the local-only database,
secret, and Gmail placeholders, then start:

```powershell
Copy-Item .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

Compose runs PostgreSQL, Django, and Vite only. It applies database migrations
but does not run the invitation dispatcher or reminder scheduler. Keep the
ports bound to localhost; this stack is for development, not production.
Docker was unavailable during this audit, so Compose execution still needs
verification on a machine with Docker Desktop.

## Production startup validation

When `DJANGO_DEBUG=False`, Django now fails during settings initialization if
`DJANGO_ALLOWED_HOSTS` or `DATABASE_URL` is missing, if the selected mail
backend is not authenticated SMTP, if SMTP host/user/password or
`DEFAULT_FROM_EMAIL` is missing, or if `FRONTEND_BASE_URL` is not HTTPS.
These checks prevent a production process from starting with a local database,
console-only email, or localhost email links. They do not prove that Gmail
accepted credentials; that requires an actual configured test message.
