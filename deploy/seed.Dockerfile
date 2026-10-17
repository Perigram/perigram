# The catalog seed + builtin-install migrations as an image (the runner's
# job workspace is not host-path-mountable, so the seed ships its own
# tree: the scripts, the db client, the zero-dep SDK, and the mongodb
# driver — nothing else).
FROM node:24-alpine
ENV HTTP_PROXY=http://192.168.0.100:12334 \
    HTTPS_PROXY=http://192.168.0.100:12334 \
    NO_PROXY=localhost,127.0.0.1,192.168.0.0/16,10.77.0.0/16
WORKDIR /app
RUN npm install --silent mongodb winston
ENV HTTP_PROXY= HTTPS_PROXY=
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
