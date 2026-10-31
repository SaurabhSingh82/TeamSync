# Authentication and profile (M01)

## API endpoints

All endpoints are under `/api/auth/`:

- `GET csrf/` - bootstrap a CSRF token before browser mutations.
- `POST register/` - create an account and send an email-verification message.
- `POST login/` - accept `identifier` (username or email) and `password`.
- `POST logout/` - blacklist the refresh token and clear authentication cookies.
- `POST refresh/` - rotate the refresh token and issue a new access token.
- `GET me/` - read the authenticated user's profile.
- `PATCH me/` - update profile fields and optionally upload an avatar.
- `POST password-reset/` - request password-reset instructions.
- `POST password-reset/confirm/` - validate a reset link and change the password.
- `POST email/verify/` - verify the email using its signed link.

Registration sends a verification message, but unverified accounts may sign in.
Changing an account email marks it unverified and sends a new verification
message.

## Browser token handling

JWT access and refresh tokens are stored in HttpOnly cookies, never
`localStorage` or JavaScript-readable storage. Access tokens expire after five
minutes; rotating refresh tokens expire after seven days and are blacklisted
after rotation or logout. The access cookie is scoped to `/api/`; the refresh
cookie is scoped to `/api/auth/`.

All authentication mutations and unsafe requests using an access cookie
require Django CSRF validation. The browser first fetches `csrf/`, then sends
the CSRF token in `X-CSRFToken`. CORS credentials are enabled only for the
configured origins. Cookies use `SameSite=Lax` by default and `Secure` is
enabled automatically when `DJANGO_DEBUG=False`; deployments must use HTTPS.
Configure `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`, and, for a
cross-origin deployment, the cookie domain/SameSite policy to match the
deployment topology.

## Email and avatar policy

In development, verification and reset messages use Django's console email
backend. In production, configure an authenticated SMTP or other approved
email backend through environment settings before enabling these flows. Reset
requests return the same response whether or not an account exists.

Avatar uploads accept validated JPEG, PNG, and WebP images up to 5 MiB and
4096 x 4096 pixels (16 megapixels). Development media files are stored under
`backend/media/`, which is ignored by Git and served only with Django debug
mode. Production must configure private or otherwise explicitly approved
media storage and must not expose this development media route.

## Rate limits and password security

Authentication endpoints use scoped DRF throttles. Django's configured
password validators are applied at registration and password reset. User
passwords are stored only as Django password hashes. The API tests use an
in-memory SQLite database, so the PostgreSQL application role does not need
`CREATEDB`.
