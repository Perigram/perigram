# Catalog seeding and standalone data migrations run from this image. It
# carries only their dependency closure, not the full application runtime.
FROM node:24-alpine
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY=localhost,127.0.0.1
WORKDIR /app
RUN npm install --silent mongodb winston h3
RUN printf '{ "type": "module", "imports": { "#packages/cts": "./packages/cts/src/index.js", "#packages/plugin-sdk": "./packages/plugin-sdk/src/index.js", "#packages/plugin-sdk/*": "./packages/plugin-sdk/src/*.js" } }' > package.json
COPY server/scripts ./server/scripts
COPY server/db ./server/db
COPY server/utils ./server/utils
COPY server/features ./server/features
COPY packages/cts ./packages/cts
COPY packages/plugin-sdk ./packages/plugin-sdk
# The catalog seeder validates each listing and packages the complete,
# statically discoverable runtime import graph before publishing anything.
# Keep the source trees for runtime entrypoints and their relative imports;
# copying listing.json alone makes collectRuntimeAssetFiles fail before the
# catalog upsert, silently leaving the previously published listing in place.
COPY workers/documents ./workers/documents
COPY workers/facade ./workers/facade
COPY workers/tech-drawing/listing.json ./workers/tech-drawing/listing.json
COPY workers/build123d/listing.json ./workers/build123d/listing.json
CMD ["node", "server/scripts/seed-plugin-catalog.js"]
