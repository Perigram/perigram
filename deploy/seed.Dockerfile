# Catalog seeding and standalone data migrations run from this image. It
# carries only their dependency closure, not the full application runtime.
FROM node:24-alpine
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY=localhost,127.0.0.1
WORKDIR /app
RUN npm install --silent mongodb winston h3
RUN printf '{ "type": "module" }' > package.json
COPY server/scripts ./server/scripts
COPY server/db ./server/db
COPY server/utils ./server/utils
COPY server/features ./server/features
COPY packages/cts ./packages/cts
COPY packages/plugin-sdk ./packages/plugin-sdk
# The seed and migrations read the built-in listings at runtime (not
# imports — file reads), each under its plugin's path.
COPY workers/documents/listing.json ./workers/documents/listing.json
COPY workers/tech-drawing/listing.json ./workers/tech-drawing/listing.json
COPY workers/facade/listing.json ./workers/facade/listing.json
CMD ["node", "server/scripts/seed-plugin-catalog.js"]
