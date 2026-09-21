"""Local stand-in for the (not-yet-provisioned) Vendor Background Check API.

There is no real external compliance/risk-event feed configured anywhere in this
project yet -- no host, no credentials, no contract. This script is a genuine,
separately-running HTTP server (stdlib only, no new dependency) so that
`check_vendor_compliance_events` in server.py can be built and exercised against a
real network call with a real auth check and a real slow-response case, rather than
faking the whole thing in-process. It is a stand-in for development, not real vendor
data -- swap `VENDOR_BGCHECK_BASE_URL` to point at the real service once one exists;
nothing in server.py's tool needs to change to do that.

Contract (deliberately mirrors a plausible real compliance-feed API):
    GET /v1/compliance-events?vendor_name=<name>
    Header: Authorization: Bearer <token>  (must equal VENDOR_BGCHECK_API_KEY)

    200 {"vendor_name": ..., "events": [...], "as_of": "<iso8601>"}
    400 {"error": "bad_request", "message": "..."}      missing vendor_name
    401 {"error": "unauthorized", "message": "..."}     missing/wrong bearer token
    404 {"error": "vendor_not_found", "message": "..."} vendor not tracked by this feed

Run: uv run scripts/mock_vendor_background_check_api.py [--port 8791]
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# Same env var name the real tool reads its credential from -- this mock checks
# incoming requests against it so a wrong/missing credential is a real, observable
# 401, not something faked in the client.
API_KEY_ENV_VAR = "VENDOR_BGCHECK_API_KEY"

# Reuses the same fictional vendors as VENDOR_DB in server.py for narrative
# consistency: Bright Path Staffing is already the "high risk" vendor there.
EVENTS_BY_VENDOR = {
    "Bright Path Staffing": [
        {
            "event_type": "wage_theft_complaint",
            "date": "2026-06-12",
            "severity": "high",
            "description": "State labor board complaint filed for unpaid overtime wages.",
            "source": "state_labor_board",
        },
        {
            "event_type": "contract_dispute",
            "date": "2026-03-01",
            "severity": "medium",
            "description": "Civil suit alleging breach of placement-guarantee terms.",
            "source": "court_filing",
        },
    ],
    "Clearline Recruiting": [],
    "Vantage Talent Group": [
        {
            "event_type": "late_payment_pattern",
            "date": "2026-07-20",
            "severity": "low",
            "description": "Two placements reported payment delays beyond the standard 30-day term.",
            "source": "self_reported",
        }
    ],
    # Deliberate test hook: exercises the tool's timeout path for real. Not a real vendor.
    "Timeout Test Vendor": [],
}

SIMULATED_SLOW_RESPONSE_SECONDS = 8


class ComplianceEventsHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (stdlib-mandated method name)
        parsed = urlparse(self.path)
        if parsed.path != "/v1/compliance-events":
            self._send_json(404, {"error": "not_found", "message": "No such endpoint."})
            return

        expected_key = os.environ.get(API_KEY_ENV_VAR)
        auth_header = self.headers.get("Authorization", "")
        provided_key = auth_header[len("Bearer ") :] if auth_header.startswith("Bearer ") else None
        if not expected_key or provided_key != expected_key:
            self._send_json(401, {"error": "unauthorized", "message": "Missing or invalid bearer token."})
            return

        vendor_name = parse_qs(parsed.query).get("vendor_name", [None])[0]
        if not vendor_name:
            self._send_json(400, {"error": "bad_request", "message": "vendor_name query parameter is required."})
            return

        if vendor_name == "Timeout Test Vendor":
            time.sleep(SIMULATED_SLOW_RESPONSE_SECONDS)

        if vendor_name not in EVENTS_BY_VENDOR:
            self._send_json(
                404, {"error": "vendor_not_found", "message": f"'{vendor_name}' is not tracked by this feed."}
            )
            return

        self._send_json(
            200,
            {
                "vendor_name": vendor_name,
                "events": EVENTS_BY_VENDOR[vendor_name],
                "as_of": datetime.now(timezone.utc).isoformat(),
            },
        )

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        # Default BaseHTTPRequestHandler logging writes to stderr with no structure;
        # match the rest of this project's plain-stderr-is-fine-for-a-mock convention
        # but keep it one line and clearly labeled as the mock, not the real service.
        print(f"[mock-bgcheck-api] {self.address_string()} {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8791)
    args = parser.parse_args()

    if not os.environ.get(API_KEY_ENV_VAR):
        raise SystemExit(
            f"Set {API_KEY_ENV_VAR} before starting the mock -- it checks incoming "
            "requests against that same value, same as the real tool would."
        )

    server = ThreadingHTTPServer(("127.0.0.1", args.port), ComplianceEventsHandler)
    print(f"[mock-bgcheck-api] listening on http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
