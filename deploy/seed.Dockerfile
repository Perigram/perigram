# The catalog seed + builtin-install migrations as an image (the runner's
# job workspace is not host-path-mountable, so the seed ships its own
# tree: the scripts, the db client, the zero-dep SDK, and the mongodb
# driver — nothing else).
FROM node:24-alpine
ARG BUILD_HTTP_PROXY
ARG BUILD_HTTPS_PROXY
ARG BUILD_NO_PROXY=localhost,127.0.0.1
ENV HTTP_PROXY=${BUILD_HTTP_PROXY} \
    HTTPS_PROXY=${BUILD_HTTPS_PROXY} \
    NO_PROXY=${BUILD_NO_PROXY}
WORKDIR /app
RUN npm install --silent mongodb winston
ENV HTTP_PROXY= HTTPS_PROXY= NO_PROXY=
RUN printf '{ "type": "module" }' > package.json
COPY server/scripts ./server/scripts
COPY server/db ./server/db
COPY server/utils ./server/utils
COPY packages/plugin-sdk ./packages/plugin-sdk
# The seed and migrations read the built-in listings at runtime (not
# imports — file reads), each under its plugin's path.
COPY workers/documents/listing.json ./workers/documents/listing.json
COPY workers/tech-drawing/listing.json ./workers/tech-drawing/listing.json
COPY workers/facade/listing.json ./workers/facade/listing.json
CMD ["node", "server/scripts/seed-plugin-catalog.js"]
