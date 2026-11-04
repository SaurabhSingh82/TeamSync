FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN groupadd --system teamsync \
    && useradd --system --gid teamsync --home-dir /app teamsync \
    && mkdir -p /app/backend/staticfiles /app/backend/media /var/lib/teamsync/private-attachments \
    && chown -R teamsync:teamsync /app /var/lib/teamsync

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY --chown=teamsync:teamsync backend /app/backend

WORKDIR /app/backend
RUN DJANGO_SECRET_KEY=build-only-not-a-runtime-secret \
    DJANGO_DEBUG=False \
    DJANGO_ALLOWED_HOSTS=localhost \
    python manage.py collectstatic --noinput

USER teamsync

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-"]
