# The plugins' executor image (shared shape): a plugin's own dependency
# install (its package.json) beside the zero-dependency SDK — the
# "extracted" hosting form of workers/<plugin>/README.md. The repo's
# relative depth is preserved (workers/<plugin> + packages/plugin-sdk)
# so the executors' ../../packages imports resolve unchanged. Build from
# the repo root with --build-arg PLUGIN=<dir> -f workers/plugin-executor.Dockerfile.
FROM node:24-alpine
ARG PLUGIN
WORKDIR /app
# CI: registry.npmjs.org is provider-blocked on runner hosts (the root
# Dockerfile's LAN relay pattern); LAN ranges stay direct.
ENV HTTP_PROXY=http://192.168.0.100:12334 \
    HTTPS_PROXY=http://192.168.0.100:12334 \
    NO_PROXY=localhost,127.0.0.1,192.168.0.0/16,10.77.0.0/16
COPY packages/plugin-sdk ./packages/plugin-sdk
COPY workers/${PLUGIN}/package.json ./workers/${PLUGIN}/package.json
WORKDIR /app/workers/${PLUGIN}
RUN npm install --omit=dev
ENV HTTP_PROXY= HTTPS_PROXY=
WORKDIR /app
COPY workers/${PLUGIN} ./workers/${PLUGIN}
WORKDIR /app/workers/${PLUGIN}
CMD ["node", "index.js"]
