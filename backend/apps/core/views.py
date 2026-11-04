import logging

from django.db import OperationalError, connection
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    try:
        connection.ensure_connection()
    except OperationalError:
        logging.getLogger("teamsync.health").error(
            "database readiness check failed",
            extra={"request_id": getattr(request, "request_id", None)},
        )
        return JsonResponse({"status": "unavailable"}, status=503)
    return JsonResponse({"status": "ok"})
