ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-slim as base

RUN apt-get update && apt-get install -y --no-install-recommends curl python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

ARG PORT=3000
ARG GIT_COMMIT_SHA

WORKDIR /src

FROM base as build

COPY --link package.json package-lock.json ./
# CI: registry.npmjs.org is provider-blocked on runner hosts (Штаб coordination
# 2026-09-27); build-time fetches go through the LAN hiddify relay. forgejo and
# LAN/NetBird ranges stay direct via NO_PROXY.
ENV HTTP_PROXY=http://192.168.0.100:12334 \
    HTTPS_PROXY=http://192.168.0.100:12334 \
    NO_PROXY=localhost,127.0.0.1,192.168.0.0/16,10.77.0.0/16
ENV NODE_OPTIONS=--dns-result-order=ipv4first
RUN npm ci

COPY --link . .

RUN npm run build

FROM base

ENV PORT=$PORT
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV NUXT_PUBLIC_GIT_COMMIT_SHA=$GIT_COMMIT_SHA

# Install python dependencies for local scripts (DXF generation)
COPY workers/nesting/requirements.txt /tmp/requirements.txt
# usage of --break-system-packages is necessary in newer debian/python versions or use venv
RUN pip3 install -r /tmp/requirements.txt --break-system-packages

COPY --from=build /src/.output /src/.output
# Nuxt 3.19.3 nitro runtime resolves inline public assets against the server
# chunk directory; mirror the public assets there so static serving works.
COPY --from=build /src/.output/public /src/.output/server/chunks/public
COPY --from=build /src/server/scripts /src/server/scripts
COPY --from=build /src/server/features /src/server/features
COPY --from=build /src/public /src/public
# Include nodi-modular WASM for parametric engine at runtime
COPY --from=build /src/node_modules/nodi-modular /src/node_modules/nodi-modular
# Include @napi-rs/canvas so pdfjs-dist can polyfill DOMMatrix in Node at runtime
COPY --from=build /src/node_modules/@napi-rs /src/node_modules/@napi-rs
# Include xlsx so Nitro-bundled chunks can resolve its cpexcel.js codepage data
COPY --from=build /src/node_modules/xlsx /src/node_modules/xlsx
# We need node_modules for runtime? Nuxt .output should have them bundled or in server/node_modules?
# Usually Nuxt output is standalone if configured, but let's keep existing pattern + strict requirement
# If using server/scripts/generate_nest_dxf.py, we need that file in the final image!
# The previous COPY --from=build /src/.output /src/.output is correct for Nuxt
# But we also need the SCRIPTS directory which is outside .output
COPY --from=build /src/server/scripts /src/.output/server/scripts

COPY --link entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE $PORT

CMD ["./entrypoint.sh"]
