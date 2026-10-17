# The catalog seed + builtin-install migrations as an image (the runner's
# job workspace is not host-path-mountable, so the seed ships its own
# tree: the scripts, the db client, the zero-dep SDK, and the mongodb
# driver — nothing else).
FROM node:24-alpine
ENV HTTP_PROXY=http://192.168.0.100:12334 \
    HTTPS_PROXY=http://192.168.0.100:12334 \
    NO_PROXY=localhost,127.0.0.1,192.168.0.0/16,10.77.0.0/16
WORKDIR /app
RUN npm install --silent mongodb
ENV HTTP_PROXY= HTTPS_PROXY=
COPY server/scripts ./server/scripts
COPY server/db ./server/db
COPY packages/plugin-sdk ./packages/plugin-sdk
CMD ["node", "server/scripts/seed-plugin-catalog.js"]
