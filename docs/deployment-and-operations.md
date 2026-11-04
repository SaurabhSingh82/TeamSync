# Deployment and operations (M11)

## Local Docker Compose

Docker Desktop with Compose v2 is required. The Compose configuration is for
local development only; it binds application ports to `127.0.0.1`, persists
PostgreSQL, avatar/media, and private attachment data in named volumes, waits
for PostgreSQL readiness, and applies migrations before starting Django.

```powershell
Copy-Item .env.docker.example .env.docker
# Edit .env.docker and replace the local-only placeholders.
docker compose --env-file .env.docker up --build
```

Open `http://localhost:5173`; the frontend proxies API calls to the backend.
The backend health endpoint is `http://127.0.0.1:8000/api/health/`.

To stop the services while retaining local data, use
`docker compose --env-file .env.docker down`. Do not use `down --volumes`
unless you intentionally want to erase the local database and uploaded files.
Never expose the development Compose ports or values to the internet.

## Production settings

Use a generated, unique `DJANGO_SECRET_KEY` supplied by the deployment secret
manager. Set `DJANGO_DEBUG=False`, explicit `DJANGO_ALLOWED_HOSTS`, database
credentials and `DATABASE_URL`, and exact HTTPS `CORS_ALLOWED_ORIGINS`,
`CSRF_TRUSTED_ORIGINS`, and `FRONTEND_BASE_URL` values. Do not copy
`.env.docker.example` or `.env.example` into production.

With `DJANGO_DEBUG=False`, HTTPS redirect, secure auth/session/CSRF cookies,
one-year HSTS, HSTS subdomains, content-type nosniff, frame denial, and a
strict referrer policy are enabled by default. Keep TLS termination and HTTP
to HTTPS redirection at the trusted edge. If Django is behind a reverse proxy,
configure `SECURE_PROXY_SSL_HEADER=HTTP_X_FORWARDED_PROTO,https` only when that
proxy strips client-supplied forwarding headers and sets the trusted header
itself. Never trust a client-controlled `X-Forwarded-Proto`.

Run Django's deployment checks against the final production environment
before rollout:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe manage.py check --deploy
..\.venv\Scripts\python.exe manage.py migrate --check --noinput
..\.venv\Scripts\python.exe manage.py migrate --noinput
..\.venv\Scripts\python.exe manage.py collectstatic --noinput
..\.venv\Scripts\python.exe -m gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 60
```

Use a process supervisor/container orchestrator to run Gunicorn. Serve the
built frontend from a TLS-enabled reverse proxy and route `/api/` to Django.
Persist `MEDIA_ROOT` and `PRIVATE_ATTACHMENT_ROOT` on protected storage; private
task attachments must not be exposed as static/public files. Use encrypted
storage and transport, least-privilege database credentials, restricted
database network access, and an external secret manager. Set PostgreSQL
connection SSL options in `DATABASE_URL` when the database is remote.

The database health check returns 200 only when Django can connect to the
configured database and returns 503 when it cannot. Responses include an
`X-Request-ID`; requests are logged as JSON to stdout/stderr with the request
ID, method, path, status, and duration. Request bodies, cookies, query strings,
credentials, and user profile data are not included. Forward the request ID to
your log aggregation/error-reporting service. Do not log secrets or raw
database exception messages.

## Backups and recovery

Back up PostgreSQL and uploaded files as separate data sets: avatar/media
storage and the private attachment root are not included in a database dump.
Use a restricted PostgreSQL backup role, a protected `PGPASSFILE` (not a
password in command-line arguments), encrypted backup destinations, retention
and off-host copies. For a PostgreSQL custom-format backup:

```powershell
pg_dump --no-password --format=custom --file=<protected-path>\teamsync.dump --dbname=teamsync --host=<database-host> --username=<backup-role>
```

Back up media and private attachments with the platform's encrypted,
consistent file backup tooling. Keep all backup output outside the repository.
Define and approve recovery point and recovery time objectives before launch;
test database and file restoration together in an isolated environment, verify
file permissions and application access, and record the restore result. A dump
alone is not a complete TeamSync backup.

## CI and release acceptance

`.github/workflows/ci.yml` runs the SQLite-compatible backend suite, dedicated
PostgreSQL concurrency tests, frontend lint/component tests/production build,
and a real-browser registration-to-task-to-search workflow. Locally, run:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe manage.py test apps.users apps.workspaces apps.projects apps.tasks apps.notifications apps.dashboard apps.search apps.core --settings=config.test_settings
..\.venv\Scripts\python.exe manage.py test apps.workspaces.tests_postgres apps.projects.tests_postgres apps.tasks.tests_postgres apps.notifications.tests_postgres --settings=config.postgres_test_settings
Set-Location ..\frontend
npm run lint
npm test
npm run build
npm run test:e2e
```

End-to-end tests use an isolated SQLite database and an in-memory email
backend. PostgreSQL-specific tests require a local PostgreSQL test database
whose role can create the test database. Before release, review the CI results,
`check --deploy` output, dependency updates, authorization and upload tests,
backup/restore evidence, and HTTPS/reverse-proxy configuration. Establish
performance/load targets and complete the final acceptance review before
creating the release tag.
