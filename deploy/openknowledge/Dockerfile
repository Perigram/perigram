# OpenKnowledge web editor for the knowledge capability module.
# GPL-3.0+ service kept deliberately outside the app image; the app only
# reaches it over HTTP (see server/features/knowledge/README.md).
FROM node:24-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git config --global user.name "OpenKnowledge" \
    && git config --global user.email "openknowledge@cutkit.local" \
    && git config --global safe.directory /workspace \
    && npm install -g @inkeep/open-knowledge

WORKDIR /workspace
# OK_ALLOW_EXTERNAL consents to non-loopback Host/Origin headers: this
# container's only exposure is the app's authenticated proxy.
ENV PORT=4310 \
    OK_ALLOW_EXTERNAL=1
EXPOSE 4310

# `ok start` refuses uninitialized directories, so first boot scaffolds the
# workspace (--no-mcp: the container has no coding agents to wire). Idle
# shutdown stays off: the service must survive gaps between clients.
CMD ["sh", "-c", "[ -d .ok ] || ok init --no-mcp; exec ok start --port \"${PORT}\" --bind 0.0.0.0 --no-open-browser --idle-shutdown off"]
