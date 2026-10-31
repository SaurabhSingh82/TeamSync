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

## Foundation notes

- The custom UUID-based user model is configured before the first database
  migration. Generate its initial migration before running `migrate`.
- No authentication endpoints or other product modules are implemented yet.
- Keep `.env` and all real credentials out of version control. The checked-in
  `.env.example` contains placeholders only.
