#!/usr/bin/env python3
"""Perigram Forgejo webhook receiver.

Listens for Forgejo push webhooks on a private LAN port, verifies the
X-Forgejo-Signature HMAC, and runs the staging deploy when the pushed ref is
the staging branch.

Configuration is read from the environment:

- PERIGRAM_WEBHOOK_SECRET : shared secret configured on the Forgejo webhook
- PERIGRAM_WEBHOOK_BIND   : listen address (default 192.168.0.106)
- PERIGRAM_WEBHOOK_PORT   : listen port (default 8088)
- PERIGRAM_DEPLOY_SCRIPT  : deploy runner (default /home/perigram/autodeploy/deploy-staging.sh)
- PERIGRAM_DEPLOY_BRANCH  : ref that triggers a deploy (default refs/heads/staging)
"""

import hmac
import hashlib
import json
import logging
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("perigram-webhook")

SECRET = os.environ.get("PERIGRAM_WEBHOOK_SECRET", "").encode()
BIND = os.environ.get("PERIGRAM_WEBHOOK_BIND", "192.168.0.106")
PORT = int(os.environ.get("PERIGRAM_WEBHOOK_PORT", "8088"))
DEPLOY_SCRIPT = os.environ.get(
    "PERIGRAM_DEPLOY_SCRIPT", "/home/perigram/autodeploy/deploy-staging.sh"
)
DEPLOY_BRANCH = os.environ.get("PERIGRAM_DEPLOY_BRANCH", "refs/heads/staging")


def verify_signature(payload: bytes, signature: str) -> bool:
    if not SECRET or not signature:
        return False
    expected = hmac.new(SECRET, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        payload = self.rfile.read(length)

        event = self.headers.get("X-Forgejo-Event", "")
        signature = self.headers.get("X-Forgejo-Signature", "")

        if event != "push":
            log.info("ignoring non-push event=%r", event)
            self.send_response(200)
            self.end_headers()
            return

        if not verify_signature(payload, signature):
            log.warning("invalid signature, rejecting webhook")
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"invalid signature")
            return

        try:
            data = json.loads(payload)
        except ValueError:
            log.warning("malformed payload")
            self.send_response(400)
            self.end_headers()
            return

        ref = data.get("ref", "")
        if ref != DEPLOY_BRANCH:
            log.info("ref %r is not %r, skipping deploy", ref, DEPLOY_BRANCH)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ignored ref")
            return

        log.info("triggering deploy for %s", ref)
        subprocess.Popen(
            [DEPLOY_SCRIPT],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
        )
        self.send_response(202)
        self.end_headers()
        self.wfile.write(b"deploy started")

    def log_message(self, fmt, *args):
        log.info("%s - %s", self.address_string(), fmt % args)


def main():
    if not SECRET:
        log.error("PERIGRAM_WEBHOOK_SECRET is required")
        sys.exit(1)

    server = ThreadingHTTPServer((BIND, PORT), Handler)
    log.info("listening on %s:%s", BIND, PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
