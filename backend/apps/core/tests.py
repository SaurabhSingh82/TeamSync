import json
import logging
import sys
from unittest.mock import patch

from django.db import OperationalError
from django.test import TestCase

from apps.core.logging import JsonLogFormatter


class HealthCheckTests(TestCase):
    def test_health_endpoint_returns_ok(self):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertTrue(response["X-Request-ID"])

    @patch("apps.core.views.connection.ensure_connection", side_effect=OperationalError)
    def test_health_endpoint_reports_database_unavailable(self, _ensure_connection):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})

    def test_health_endpoint_preserves_valid_request_id(self):
        request_id = "5e8a39f2-0633-4f34-978a-3ca4d4e55762"

        response = self.client.get(
            "/api/health/",
            HTTP_X_REQUEST_ID=request_id,
        )

        self.assertEqual(response["X-Request-ID"], request_id)

    def test_request_log_is_json_and_correlated_with_response_header(self):
        with self.assertLogs("teamsync.request", level="INFO") as captured:
            response = self.client.get("/api/health/")

        log_entry = json.loads(JsonLogFormatter().format(captured.records[-1]))
        self.assertEqual(response["X-Request-ID"], log_entry["request_id"])
        self.assertEqual(log_entry["path"], "/api/health/")
        self.assertEqual(log_entry["status_code"], 200)

    def test_json_formatter_does_not_log_exception_message(self):
        try:
            raise RuntimeError("sensitive database password")
        except RuntimeError:
            record = logging.LogRecord(
                name="teamsync.test",
                level=logging.ERROR,
                pathname=__file__,
                lineno=1,
                msg="operation failed",
                args=(),
                exc_info=sys.exc_info(),
            )

        output = JsonLogFormatter().format(record)

        self.assertEqual(json.loads(output)["exception_type"], "RuntimeError")
        self.assertNotIn("sensitive database password", output)
