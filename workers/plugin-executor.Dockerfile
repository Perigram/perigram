# The plugins' executor image (shared shape): a plugin's own dependency
# install (its package.json) beside the zero-dependency SDK — the
# "extracted" hosting form of workers/<plugin>/README.md. The repo's
# relative depth is preserved (workers/<plugin> + packages/plugin-sdk)
# so the executors' ../../packages imports resolve unchanged. Build from
# the repo root with --build-arg PLUGIN=<dir> -f workers/plugin-executor.Dockerfile.
FROM node:24-alpine
ARG PLUGIN
ARG BUILD_HTTP_PROXY
ARG BUILD_HTTPS_PROXY
ARG BUILD_NO_PROXY=localhost,127.0.0.1
WORKDIR /app
ENV HTTP_PROXY=${BUILD_HTTP_PROXY} \
    HTTPS_PROXY=${BUILD_HTTPS_PROXY} \
    NO_PROXY=${BUILD_NO_PROXY}
COPY packages/plugin-sdk ./packages/plugin-sdk
COPY workers/${PLUGIN}/package.json ./workers/${PLUGIN}/package.json
WORKDIR /app/workers/${PLUGIN}
RUN npm install --omit=dev
ENV HTTP_PROXY= HTTPS_PROXY= NO_PROXY=
WORKDIR /app
COPY workers/${PLUGIN} ./workers/${PLUGIN}
WORKDIR /app/workers/${PLUGIN}
CMD ["node", "index.js"]
