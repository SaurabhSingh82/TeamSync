# Engineering foundation

## Local services

The frontend development server listens on port `5173`. Its Vite configuration
proxies `/api` requests to Django on `127.0.0.1:8000`. Django reads its
configuration from the repository-root `.env` file.

PostgreSQL connection settings are supplied through `DATABASE_URL`. Do not
commit database credentials or local environment files. The initial custom
user model must be migrated before product models are introduced.

## Project boundaries

The `backend/apps/` directory is reserved for cohesive Django apps. Shared
health and infrastructure endpoints live in `apps/core/`; the custom user
model lives in `apps/users/`. The React application keeps routing, reusable
layout components, pages, and API access in separate source directories.
