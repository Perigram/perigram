#!/usr/bin/env python3
"""The build123d plugin's endpoint-mode executor.

Serves every discovered operation at `POST /<op-id>` with the service
input record as the JSON body (the plugin Connection contract): one
process, the engine imported once, each request dispatched generically
through dispatch.py. Env: BUILD123D_EXECUTOR_PORT (default 8793),
BUILD123D_EXECUTOR_KEY (optional bearer).
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dispatch import OPS, DispatchError, dispatch  # noqa: E402

PORT = int(os.environ.get("BUILD123D_EXECUTOR_PORT", "8793"))
KEY = os.environ.get("BUILD123D_EXECUTOR_KEY") or None


class Executor(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        if KEY and self.headers.get("authorization") != f"Bearer {KEY}":
            self.fail(401, "invalid or missing executor key")
            return
        op_id = self.path.lstrip("/").split("?")[0].strip("/")
        if op_id not in OPS:
            self.fail(404, f"unknown service {op_id or '(root)'} — declared: {', '.join(sorted(OPS))}")
            return
        try:
            length = int(self.headers.get("content-length") or 0)
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else None
        except (ValueError, UnicodeDecodeError):
            self.fail(400, "request body is not valid JSON")
            return
        try:
            result = dispatch({"op": op_id, "args": body or {}})
        except DispatchError as error:
            self.fail(400, str(error))
            return
        except Exception as error:  # engine errors carry the real message
            self.fail(500, f"{type(error).__name__}: {error}")
            return
        self.respond(200, result)

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            self.respond(200, {"status": "ok", "services": len(OPS)})
            return
        self.fail(405, "services answer POST only")

    def respond(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def fail(self, status, message):
        self.respond(status, {"error": message})

    def log_message(self, fmt, *args):
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")


if __name__ == "__main__":
    # Import the engine once at boot so the first request does not pay
    # the import cost.
    from dispatch import require_build123d

    require_build123d()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Executor)
    print(
        f"build123d executor on :{PORT} ({len(OPS)} services){' (key required)' if KEY else ''}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
