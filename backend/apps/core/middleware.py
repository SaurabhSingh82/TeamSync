import logging
import time
import uuid


request_logger = logging.getLogger("teamsync.request")


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID", "")
        try:
            request_id = str(uuid.UUID(request_id))
        except (ValueError, AttributeError):
            request_id = str(uuid.uuid4())
        request.request_id = request_id
        started_at = time.perf_counter()
        response = self.get_response(request)
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        response["X-Request-ID"] = request_id
        status_code = response.status_code
        log_method = request_logger.error if status_code >= 500 else request_logger.info
        log_method(
            "request completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.path,
                "status_code": status_code,
                "duration_ms": duration_ms,
            },
        )
        return response
