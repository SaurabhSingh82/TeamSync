# TeamSync

TeamSync is a collaborative project-management application. This repository
contains the engineering foundation only; product modules will be added in
separate implementation checkpoints.

## Repository layout

- `frontend/` — React, Vite, TypeScript, Tailwind CSS, routing, and API client
- `backend/` — Django REST Framework project and shared foundation apps
- `docs/` — engineering documentation
- `.env.example` — placeholder configuration; never put real credentials here

## Prerequisites

- Node.js 20.19+ or 22.12+
- Python 3.12+
- PostgreSQL 16+ (the Windows setup script targets PostgreSQL 18.6)
- Git

## Local setup

Create the backend virtual environment and install its pinned dependencies
before initializing the database:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

For the Windows PostgreSQL 18 development setup, run the guarded setup script
from an elevated PowerShell. It creates a localhost-only auto-start service,
prompts for passwords in the local console, and stores the private Django
environment file under `%LOCALAPPDATA%\TeamSync` (outside this OneDrive
workspace):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-local-postgresql.ps1
```

The script sets the user environment variable `TEAMSYNC_ENV_FILE` to that
private environment file. Restart VS Code after setup so new terminals inherit
it. For a manual setup, copy `.env.example` to `.env` and replace its
placeholders; `.env` is ignored by Git.

PostgreSQL must listen only on `127.0.0.1:5432` for local development. Never
use local trust authentication or the development database credentials in
production.
The authentication API tests use an isolated in-memory SQLite test database,
so the PostgreSQL application role does not need the `CREATEDB` privilege.

### Backend

```powershell
Set-Location backend
..\.venv\Scripts\python.exe manage.py check
..\.venv\Scripts\python.exe manage.py makemigrations users
..\.venv\Scripts\python.exe manage.py migrate
..\.venv\Scripts\python.exe manage.py runserver
```

The health endpoint is `http://127.0.0.1:8000/api/health/`.

### Frontend

```powershell
Set-Location frontend
npm install
npm run dev
```

The Vite development server runs at `http://localhost:5173` and proxies `/api`
requests to the backend at `http://127.0.0.1:8000`. Set
`VITE_API_BASE_URL` in the root `.env` to override the API base URL.

Production build and lint:

```powershell
Set-Location frontend
npm run build
npm run lint
```

Backend API tests use an isolated in-memory SQLite database so the local
application role does not need `CREATEDB`:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe manage.py test apps.users apps.workspaces apps.core --settings=config.test_settings
```

PostgreSQL-specific row-lock and concurrency tests run against a separate test
database (`test_teamsync` with the default local database). The configured
PostgreSQL role needs `CREATEDB` for the first run, or an administrator can
pre-create that test database owned by the role. `--keepdb` reuses a
pre-provisioned test database without dropping it:

```powershell
..\.venv\Scripts\python.exe manage.py test apps.workspaces.tests_postgres --settings=config.postgres_test_settings --keepdb
```

Workspace invitation emails use a transactional outbox. Creation returns
`email_delivery.status: "pending"` after committing the invitation and queued
email together. Run the dispatcher periodically; failed deliveries are tracked
and can be retried by resending the invitation, which rotates its token:

```powershell
..\.venv\Scripts\python.exe manage.py send_workspace_invitation_emails
```

In development, console email is displayed only in the interactive terminal
and is not written to redirected output or application logs. Delivery uses an
at-least-once outbox; an interruption after the mail server accepts a message
can result in a duplicate email after the claim lease expires.

## Foundation notes

- The custom UUID-based user model is configured before the first database
  migration. M01 account fields and APIs are in the `users` app; M02 workspace
  management and invitations are in the `workspaces` app.
- Authentication uses HttpOnly JWT cookies, CSRF protection, rotating refresh
  tokens, and a console email backend for local reset/verification flows. See
  [authentication.md](docs/authentication.md).
- Workspace membership and invitation behavior is documented in
  [workspaces.md](docs/workspaces.md).
- Projects, tasks, and later product modules are not implemented yet.
- Keep `.env` and all real credentials out of version control. The checked-in
  `.env.example` contains placeholders only.
